/** Keep pnpm deploy's patch references portable without removing any bytes from the artifact identity. */
import { createHash } from 'node:crypto'
import { chmodSync, closeSync, constants, fchmodSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parse, stringify } from 'yaml'

const LOCAL_PATCHES = '.sophia-patches'

function directory(path) {
  if (!lstatSync(path).isDirectory() || realpathSync(path) !== path) throw new Error('patch relocation requires a real directory')
}

function regularFile(path) {
  if (!lstatSync(path).isFile()) throw new Error('patch relocation requires a regular file')
}

function patchMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid patchedDependencies map')
  return value
}

function sameKeys(expected, actual) {
  if (JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(Object.keys(actual).sort())) throw new Error('patchedDependencies package keys differ')
}

/**
 * Validate the complete frozen source/deployed maps before writing. Generated references are compared to the
 * canonical source path, never opened. The copied patches and rewritten YAML remain covered by treeDigest.
 * This runs once on the new, exclusively owned deployment output, before it is exposed to readers.
 */
export function relocateRuntimePatches(repoRoot, runtimeRoot) {
  const repo = resolve(repoRoot)
  const runtime = resolve(runtimeRoot)
  // Only a leading parent component leaves the runtime; names such as '..source' are children.
  if (relative(runtime, repo).split(sep)[0] !== '..') throw new Error('runtime must not contain the source repository')
  directory(repo)
  directory(runtime)
  directory(join(repo, 'patches'))
  const sourceFile = join(repo, 'pnpm-workspace.yaml')
  const lockFile = join(repo, 'pnpm-lock.yaml')
  const generatedFile = join(runtime, 'pnpm-workspace.yaml')
  for (const file of [sourceFile, lockFile, generatedFile]) regularFile(file)
  const source = patchMap(parse(readFileSync(sourceFile, 'utf8'))?.patchedDependencies)
  const locked = patchMap(parse(readFileSync(lockFile, 'utf8'))?.patchedDependencies)
  const generated = parse(readFileSync(generatedFile, 'utf8'))
  const deployed = patchMap(generated?.patchedDependencies)
  sameKeys(source, locked)
  sameKeys(source, deployed)
  const copies = []
  const names = new Set()
  for (const key of Object.keys(source).sort()) {
    const ref = source[key]
    if (typeof ref !== 'string' || !/^patches\/[A-Za-z0-9@_.+-]+\.patch$/.test(ref)) throw new Error('invalid source patch reference')
    const sourcePath = join(repo, ref)
    regularFile(sourcePath)
    const deployedRef = deployed[key]
    if (typeof deployedRef !== 'string' || isAbsolute(deployedRef) || deployedRef !== relative(runtime, sourcePath)) throw new Error('foreign or invalid generated patch reference')
    const bytes = readFileSync(sourcePath)
    if (typeof locked[key] !== 'string' || createHash('sha256').update(bytes).digest('hex') !== locked[key]) throw new Error('source patch does not match frozen lock')
    const name = basename(ref)
    if (names.has(name)) throw new Error('patch destination collision')
    names.add(name)
    copies.push({ key, bytes, name })
  }
  const destination = join(runtime, LOCAL_PATCHES)
  try {
    lstatSync(destination)
    throw new Error('patch destination already exists')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  // Serialize before writes too; preserve every unrelated parsed option, including unknown future settings.
  for (const { key, name } of copies) deployed[key] = `${LOCAL_PATCHES}/${name}`
  const yaml = stringify(generated, { sortMapEntries: true, lineWidth: 0 })
  mkdirSync(destination, { mode: 0o755 })
  chmodSync(destination, 0o755)
  for (const { bytes, name } of copies) {
    const fd = openSync(join(destination, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644)
    try {
      writeFileSync(fd, bytes)
      fchmodSync(fd, 0o644)
    } finally {
      closeSync(fd)
    }
  }
  // Open the validated generated file without following a replacement symlink; no foreign destination is reused.
  const fd = openSync(generatedFile, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW)
  try {
    writeFileSync(fd, yaml)
    fchmodSync(fd, 0o644)
  } finally {
    closeSync(fd)
  }
}
