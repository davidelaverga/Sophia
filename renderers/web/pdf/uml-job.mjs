// The per-job protocol between the render supervisor and the UML guest (SDD-01, renderers/web/pdf/uml). The guest is an
// untrusted component behind the host launchers: it reads one job from a read-only input disk (a ustar archive this
// host writes) and writes its output directory to an output disk of a fixed size (a ustar archive this host reads
// back). The reader takes only regular files with plain names, each and all within bounds, and refuses anything else:
// a link, a device, a path, an extended header, a duplicate, a bad checksum or a size past the disk.
import fs from 'node:fs'
import path from 'node:path'

const BLOCK = 512
/** The output disk's size: the capture kernel's 64 MiB of images or a 32 MiB PDF, its receipt and the archive's headers. */
export const OUTPUT_DISK_BYTES = 112 * 1024 * 1024
/** What one job's output may hold. */
export const OUTPUT_LIMITS = { files: 80, fileBytes: 32 * 1024 * 1024, totalBytes: 100 * 1024 * 1024 }
/** A name the kernels write in their output directory: receipt.json, report.pdf, or a capture's file name. */
const OUTPUT_NAME = /^[a-z0-9][a-z0-9.-]{0,150}\.(json|pdf|png)$/

/** Why the guest's output cannot be taken; nothing of it is kept. */
export class OutputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'OutputError'
  }
}

/**
 * One header field, written as a NUL-terminated octal number of `width` bytes.
 * @param {Buffer} header
 * @param {number} at
 * @param {number} width
 * @param {number} value
 */
function octal(header, at, width, value) {
  header.write(`${value.toString(8).padStart(width - 1, '0')}\0`, at, width, 'ascii')
}

/**
 * A name's ustar fields: the name itself (at most 100 bytes) and a prefix (at most 155), split at a '/'.
 * @param {string} name
 * @returns {{ name: string, prefix: string }}
 */
function ustarName(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: '' }
  for (let cut = name.indexOf('/'); cut !== -1; cut = name.indexOf('/', cut + 1)) {
    const prefix = name.slice(0, cut)
    const rest = name.slice(cut + 1)
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100) return { name: rest, prefix }
  }
  throw new Error(`the path ${name} is too long for the job archive`)
}

/**
 * One ustar header.
 * @param {string} name
 * @param {'0' | '5'} type a regular file or a directory
 * @param {number} size
 */
function headerOf(name, type, size) {
  const header = Buffer.alloc(BLOCK)
  const fields = ustarName(name)
  header.write(fields.name, 0, 100, 'utf8')
  octal(header, 100, 8, type === '5' ? 0o755 : 0o644)
  octal(header, 108, 8, 0)
  octal(header, 116, 8, 0)
  octal(header, 124, 12, size)
  octal(header, 136, 12, 0)
  header.fill(0x20, 148, 156)
  header.write(type, 156, 1, 'ascii')
  header.write('ustar\u000000', 257, 8, 'ascii')
  header.write(fields.prefix, 345, 155, 'utf8')
  let sum = 0
  for (const byte of header) sum += byte
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return header
}

/**
 * A ustar archive of directories and regular files, in the order given, ending with two empty blocks.
 * @param {({ dir: string } | { file: string, data: Buffer })[]} entries
 */
export function archive(entries) {
  /** @type {Buffer[]} */
  const parts = []
  for (const entry of entries) {
    if ('dir' in entry) {
      parts.push(headerOf(`${entry.dir}/`, '5', 0))
      continue
    }
    parts.push(headerOf(entry.file, '0', entry.data.length), entry.data)
    const pad = (BLOCK - (entry.data.length % BLOCK)) % BLOCK
    if (pad) parts.push(Buffer.alloc(pad))
  }
  parts.push(Buffer.alloc(2 * BLOCK))
  return Buffer.concat(parts)
}

/**
 * The input archive of one job: its kernel, its job file and its package under `src/`, every directory named first.
 * @param {'pdf' | 'png'} kernel
 * @param {unknown} jobFile the job the kernel reads, with the guest's paths
 * @param {string} sourceRoot this host's copy of the package
 * @param {string[]} files the package's paths, relative to sourceRoot
 */
export function inputArchive(kernel, jobFile, sourceRoot, files) {
  /** @type {({ dir: string } | { file: string, data: Buffer })[]} */
  const entries = [
    { file: 'kernel', data: Buffer.from(kernel) },
    { file: 'job.json', data: Buffer.from(JSON.stringify(jobFile)) },
    { dir: 'src' },
  ]
  const dirs = new Set()
  for (const file of files) {
    const parts = file.split('/')
    if (path.isAbsolute(file) || parts.some((p) => p === '' || p === '.' || p === '..')) {
      throw new Error(`the package path ${file} cannot go in the job archive`)
    }
    for (let i = 1; i < parts.length; i += 1) {
      const dir = `src/${parts.slice(0, i).join('/')}`
      if (!dirs.has(dir)) {
        dirs.add(dir)
        entries.push({ dir })
      }
    }
    entries.push({ file: `src/${file}`, data: fs.readFileSync(path.join(sourceRoot, file)) })
  }
  return archive(entries)
}

/**
 * A NUL-terminated header string.
 * @param {Buffer} header
 * @param {number} at
 * @param {number} width
 */
const text = (header, at, width) => {
  const field = header.subarray(at, at + width)
  const end = field.indexOf(0)
  return field.subarray(0, end === -1 ? width : end).toString('utf8')
}

/**
 * A header's octal number, or NaN when the field holds anything else.
 * @param {Buffer} header
 * @param {number} at
 * @param {number} width
 */
const number = (header, at, width) => {
  const digits = text(header, at, width).trim()
  return /^[0-7]{1,12}$/.test(digits) ? Number.parseInt(digits, 8) : Number.NaN
}

/**
 * The header at `at`: its full name, type and size, or null at the archive's end (an empty block). A header that fails
 * its checksum, is not ustar or has no size refuses the archive.
 * @param {Buffer} disk
 * @param {number} at
 * @returns {{ full: string, type: string, size: number } | null}
 */
function headerAt(disk, at) {
  if (at + BLOCK > disk.length) throw new OutputError('the output archive has no end')
  const header = disk.subarray(at, at + BLOCK)
  if (header.every((b) => b === 0)) return null
  let sum = 0
  for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : (header[i] ?? 0)
  if (number(header, 148, 8) !== sum) throw new OutputError('an output header fails its checksum')
  if (!text(header, 257, 6).startsWith('ustar')) throw new OutputError('the output archive is not ustar')
  const size = number(header, 124, 12)
  if (!Number.isSafeInteger(size)) throw new OutputError('an output header has no size')
  const prefix = text(header, 345, 155)
  const name = text(header, 0, 100)
  return { full: prefix ? `${prefix}/${name}` : name, type: String.fromCharCode(header[156] ?? 0), size }
}

/**
 * An entry's output name, or null for the archive's own "." directory: only regular files named as the kernels name
 * their outputs, each once.
 * @param {{ full: string, type: string, size: number }} entry
 * @param {Set<string>} names the names taken so far
 */
function outputName(entry, names) {
  if (entry.type === '5' && entry.size === 0 && ['.', './', ''].includes(entry.full)) return null
  if (entry.type !== '0' && entry.type !== '\0') {
    throw new OutputError(`the output archive holds a ${JSON.stringify(entry.type)} entry`)
  }
  const name = entry.full.startsWith('./') ? entry.full.slice(2) : entry.full
  if (!OUTPUT_NAME.test(name))
    throw new OutputError(`the output archive names ${JSON.stringify(entry.full.slice(0, 80))}`)
  if (names.has(name)) throw new OutputError(`the output archive names ${name} twice`)
  return name
}

/**
 * Hold one more output to OUTPUT_LIMITS: its size, everything taken so far and how many files.
 * @param {string} name
 * @param {number} size
 * @param {{ total: number, count: number }} taken
 */
function withinLimits(name, size, taken) {
  if (size > OUTPUT_LIMITS.fileBytes) throw new OutputError(`${name} is larger than ${OUTPUT_LIMITS.fileBytes} bytes`)
  taken.total += size
  taken.count += 1
  if (taken.total > OUTPUT_LIMITS.totalBytes)
    throw new OutputError(`the outputs exceed ${OUTPUT_LIMITS.totalBytes} bytes`)
  if (taken.count > OUTPUT_LIMITS.files) throw new OutputError(`more than ${OUTPUT_LIMITS.files} outputs`)
}

/**
 * The files of the guest's output archive (as busybox or GNU tar write `tar -cf … .`): only "." itself and regular
 * files named as the kernels name their outputs, each and all within OUTPUT_LIMITS. Anything else refuses the whole
 * archive.
 * @param {Buffer} disk the output disk
 * @returns {{ name: string, data: Buffer }[]}
 */
export function readOutput(disk) {
  /** @type {{ name: string, data: Buffer }[]} */
  const files = []
  /** @type {Set<string>} */
  const names = new Set()
  const taken = { total: 0, count: 0 }
  let at = 0
  for (let entry = headerAt(disk, at); entry; entry = headerAt(disk, at)) {
    at += BLOCK
    const name = outputName(entry, names)
    if (name === null) continue
    withinLimits(name, entry.size, taken)
    if (at + entry.size > disk.length) throw new OutputError(`${name} runs past the output disk`)
    names.add(name)
    files.push({ name, data: Buffer.from(disk.subarray(at, at + entry.size)) })
    at += Math.ceil(entry.size / BLOCK) * BLOCK
  }
  return files
}

/**
 * Read the output disk the guest wrote, through no link, as a regular file of exactly its size, and write its files
 * once into `outputDir`.
 * @param {string} disk
 * @param {string} outputDir
 */
export function takeOutput(disk, outputDir) {
  const fd = fs.openSync(disk, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const st = fs.fstatSync(fd)
    if (!st.isFile() || st.size !== OUTPUT_DISK_BYTES) throw new OutputError('the output disk is not the one written')
    const bytes = Buffer.alloc(OUTPUT_DISK_BYTES)
    let read = 0
    while (read < bytes.length) {
      const n = fs.readSync(fd, bytes, read, bytes.length - read, read)
      if (n === 0) break
      read += n
    }
    for (const file of readOutput(bytes)) fs.writeFileSync(path.join(outputDir, file.name), file.data, { flag: 'wx' })
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * A fresh output disk of exactly OUTPUT_DISK_BYTES, all zeros, writable only by its owner.
 * @param {string} file
 * @param {{ uid: number, gid: number } | null} owner
 */
export function outputDisk(file, owner) {
  const fd = fs.openSync(file, 'wx', 0o600)
  try {
    fs.ftruncateSync(fd, OUTPUT_DISK_BYTES)
    if (owner) fs.fchownSync(fd, owner.uid, owner.gid)
  } finally {
    fs.closeSync(fd)
  }
}
