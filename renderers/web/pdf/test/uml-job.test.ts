// SDD-01: the per-job protocol between the render supervisor and the UML guest (uml-job.mjs). The host writes the input
// archive; the guest, untrusted, writes the output archive, which the host takes only as the kernels' own files.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import {
  OUTPUT_DISK_BYTES,
  OUTPUT_LIMITS,
  OutputError,
  archive,
  inputArchive,
  outputDisk,
  readOutput,
  takeOutput,
} from '../uml-job.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'sophia-uml-job-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
const hasTar = process.platform === 'linux' && spawnSync('tar', ['--version']).status === 0

/** An archive as a guest writes `tar -cf … .` in its output directory: "./" first, then its files. */
const output = (files: { name: string; data: Buffer }[]): Buffer =>
  archive([{ dir: '.' }, ...files.map((f) => ({ file: `./${f.name}`, data: f.data }))])

/** The same archive with one header changed (and its checksum recomputed unless `keepSum`). */
function edited(bytes: Buffer, at: number, edit: (header: Buffer) => void, keepSum = false): Buffer {
  const copy = Buffer.from(bytes)
  const header = copy.subarray(at, at + 512)
  edit(header)
  if (!keepSum) {
    header.fill(0x20, 148, 156)
    let sum = 0
    for (const b of header) sum += b
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  }
  return copy
}

/** That reading these bytes refuses the whole archive, for the reason given. */
const refuse = (bytes: Buffer, why: RegExp): void => {
  assert.throws(
    () => readOutput(bytes),
    (e: unknown) => e instanceof OutputError && why.test(e.message),
  )
}

describe('the UML job archives (uml-job.mjs)', () => {
  it('reads back what the kernels write: "./" and their files, nothing else', () => {
    const pdf = Buffer.from('%PDF-1.7 fixture')
    const receipt = Buffer.from('{"status":"succeeded"}')
    const files = readOutput(
      output([
        { name: 'receipt.json', data: receipt },
        { name: 'report.pdf', data: pdf },
        { name: 'w390-light-overview-1.png', data: Buffer.alloc(1300, 7) },
      ]),
    )
    assert.deepEqual(
      files.map((f) => [f.name, f.data.length]),
      [
        ['receipt.json', receipt.length],
        ['report.pdf', pdf.length],
        ['w390-light-overview-1.png', 1300],
      ],
    )
    assert.deepEqual(files[1]?.data, pdf)
    assert.deepEqual(readOutput(output([])), [])
  })

  it('refuses links, devices, paths, extended headers, duplicates, bad checksums and anything past its bounds', () => {
    const one = output([{ name: 'report.pdf', data: Buffer.from('x') }])
    const fileHeader = 512
    refuse(
      edited(one, fileHeader, (h) => h.write('1', 156)),
      /"1" entry/u,
    )
    refuse(
      edited(one, fileHeader, (h) => h.write('x', 156)),
      /"x" entry/u,
    )
    refuse(
      edited(one, fileHeader, (h) => h.write('3', 156)),
      /"3" entry/u,
    )
    refuse(
      edited(one, fileHeader, (h) => h.write('5', 156)),
      /"5" entry/u,
    )
    refuse(
      edited(one, 0, (h) => h.write('0', 156)),
      /names/u,
    )
    for (const name of [
      '../report.pdf',
      './a/report.pdf',
      '/report.pdf',
      './report.sh',
      './.receipt.json',
      './Report.pdf',
    ]) {
      refuse(
        edited(one, fileHeader, (h) => h.fill(0, 0, 100).write(name, 0)),
        /names/u,
      )
    }
    refuse(
      edited(one, fileHeader, (h) => h.write('9', 148), true),
      /checksum/u,
    )
    refuse(
      edited(one, fileHeader, (h) => h.fill(0, 257, 265)),
      /not ustar/u,
    )
    refuse(
      output([
        { name: 'report.pdf', data: Buffer.from('a') },
        { name: 'report.pdf', data: Buffer.from('b') },
      ]),
      /twice/u,
    )
    refuse(output([{ name: 'report.pdf', data: Buffer.alloc(OUTPUT_LIMITS.fileBytes + 1) }]), /larger than/u)
    const many = Array.from({ length: 4 }, (_, k) => ({
      name: `c${String(k)}.png`,
      data: Buffer.alloc(30 * 1024 * 1024),
    }))
    refuse(output(many), /exceed/u)
    refuse(
      output(
        Array.from({ length: OUTPUT_LIMITS.files + 1 }, (_, k) => ({
          name: `c${String(k)}.png`,
          data: Buffer.from('p'),
        })),
      ),
      /more than/u,
    )
    // A size past the disk, and an archive with no end.
    refuse(
      edited(one, fileHeader, (h) => h.write('00000077777\0', 124)),
      /past the output disk/u,
    )
    refuse(one.subarray(0, 1024 + 512), /no end/u)
    refuse(Buffer.alloc(100), /no end/u)
  })

  it('writes the input archive with every directory first and a long path split into its prefix', () => {
    const src = join(scratch, 'src')
    const deep = `${'d'.repeat(60)}/${'e'.repeat(60)}/${'f'.repeat(60)}.png`
    for (const p of ['report.html', 'img/chart.png', deep]) {
      mkdirSync(join(src, p, '..'), { recursive: true })
      writeFileSync(join(src, p), `bytes of ${p}`)
    }
    const job = { sourceRoot: '/work/job/src', outputDir: '/work/job/out' }
    const bytes = inputArchive('pdf', job, src, ['report.html', 'img/chart.png', deep])
    assert.equal(bytes.length % 512, 0)
    assert.throws(() => inputArchive('pdf', job, src, ['../escape.html']), /cannot go in the job archive/u)
    assert.throws(() => inputArchive('pdf', job, src, ['/etc/passwd']), /cannot go in the job archive/u)
    assert.throws(() => inputArchive('pdf', job, src, ['a//b.png']), /cannot go in the job archive/u)
    if (!hasTar) return
    const listed = spawnSync('tar', ['-tvf', '-'], { input: bytes, encoding: 'utf8' })
    assert.equal(listed.status, 0, listed.stderr)
    const names = listed.stdout
      .trim()
      .split('\n')
      .map((l) => l.split(/\s+/u).at(-1))
    assert.deepEqual(
      names,
      [
        'kernel',
        'job.json',
        'src/',
        'report.html',
        'src/img/',
        'img/chart.png',
        `src/${'d'.repeat(60)}/`,
        `src/${'d'.repeat(60)}/${'e'.repeat(60)}/`,
        deep,
      ].map((n) => (n.startsWith('src/') || ['kernel', 'job.json'].includes(n) ? n : `src/${n}`)),
    )
    const into = join(scratch, 'extracted')
    mkdirSync(into)
    assert.equal(spawnSync('tar', ['-xf', '-', '-C', into], { input: bytes }).status, 0)
    assert.equal(readFileSync(join(into, 'kernel'), 'utf8'), 'pdf')
    assert.deepEqual(JSON.parse(readFileSync(join(into, 'job.json'), 'utf8')), job)
    assert.equal(readFileSync(join(into, 'src', deep), 'utf8'), `bytes of ${deep}`)
  })

  it(
    'reads an archive GNU tar writes, as the guest writes it into its fixed-size disk',
    { skip: !hasTar && 'no tar' },
    () => {
      const out = join(scratch, 'out')
      mkdirSync(out)
      writeFileSync(join(out, 'receipt.json'), '{"status":"succeeded"}')
      writeFileSync(join(out, 'report.pdf'), Buffer.alloc(70_000, 1))
      const made = spawnSync('tar', ['-cf', '-', '-C', out, '.'], { maxBuffer: 1 << 26 })
      assert.equal(made.status, 0)
      const disk = Buffer.alloc(4 * 1024 * 1024)
      made.stdout.copy(disk)
      assert.deepEqual(
        readOutput(disk)
          .map((f) => [f.name, f.data.length])
          .toSorted((x, y) => String(x[0]).localeCompare(String(y[0]))),
        [
          ['receipt.json', 22],
          ['report.pdf', 70_000],
        ],
      )
    },
  )

  it('takes the output disk only as a regular file of its own size, through no link, writing each file once', () => {
    const dir = join(scratch, 'take')
    mkdirSync(dir)
    const disk = join(dir, 'output.img')
    outputDisk(disk, null)
    assert.throws(() => outputDisk(disk, null), /EEXIST/u)
    const bytes = output([{ name: 'receipt.json', data: Buffer.from('{}') }])
    writeFileSync(disk, Buffer.concat([bytes, Buffer.alloc(OUTPUT_DISK_BYTES - bytes.length)]))
    const into = join(dir, 'out')
    mkdirSync(into)
    takeOutput(disk, into)
    assert.equal(readFileSync(join(into, 'receipt.json'), 'utf8'), '{}')
    assert.throws(() => takeOutput(disk, into), /EEXIST/u, 'a file already taken is never replaced')
    const link = join(dir, 'link.img')
    symlinkSync(disk, link)
    assert.throws(() => takeOutput(link, join(dir, 'out')), /ELOOP/u)
    const short = join(dir, 'short.img')
    writeFileSync(short, bytes)
    assert.throws(() => takeOutput(short, into), /not the one written/u)
  })
})
