// The dev stack's runtime in a Linux container, for hosts the runtime doesn't support (Windows): the runtime admits
// linux-x64 and darwin-arm64 only, and its reply child, process groups and PATH are Linux's. The checkout is mounted
// read-only; the container copies what git knows into its own volume, builds and verifies the artifacts there, and
// starts scripts/runtime-host.mjs (scripts/runtime-container.mjs). docs/plans/dev-runtime-container.md.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Node 24.21 (the toolchain's pin) on Debian, pinned by digest. */
export const RUNTIME_IMAGE =
  'node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20'
export const RUNTIME_CONTAINER = 'sophia-dev-runtime'
/** The container's copy of the checkout, its pnpm store and the runtime's data, kept between runs. */
export const RUNTIME_VOLUME = 'sophia-dev-runtime'
/** The API on the host, as the container reaches it (the host's 127.0.0.1:8787). */
export const CONTAINER_SERVICE_URL = 'http://host.docker.internal:8787'

/** Whether the runtime runs in the container on this platform. */
export function runsInContainer(platform: NodeJS.Platform): boolean {
  return platform === 'win32'
}

export interface ManifestEntry {
  path: string
  mode: 0o644 | 0o755
}

/**
 * What the container copies, from `git ls-files -s -z` (tracked) and `git ls-files -o --exclude-standard -z`
 * (untracked, not ignored). Through a Windows mount every file looks executable, and the runtime's tree digest hashes
 * that bit, so each file takes git's mode: 755 for `100755`, 644 for any other file. Links and submodules are left.
 */
export function copyManifest(staged: string, untracked: string): ManifestEntry[] {
  const entries: ManifestEntry[] = []
  const seen = new Set<string>()
  const add = (path: string, mode: ManifestEntry['mode']) => {
    if (!path || seen.has(path)) return
    seen.add(path)
    entries.push({ path, mode })
  }
  for (const line of staged.split('\0')) {
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const kind = line.slice(0, line.indexOf(' '))
    if (kind === '100755') add(line.slice(tab + 1), 0o755)
    else if (kind === '100644') add(line.slice(tab + 1), 0o644)
  }
  for (const path of untracked.split('\0')) add(path, 0o644)
  return entries
}

interface CredentialRef {
  credential_ref?: string
}

/** The credential variables a runtime unit names (scripts/runtime-host.mjs reads the same ones), once each. */
export function credentialNames(unit: {
  model_route?: CredentialRef
  model_routes?: Record<string, CredentialRef>
  research_sources?: Record<string, CredentialRef | null>
}): string[] {
  const names = [
    unit.model_route?.credential_ref,
    ...Object.values(unit.model_routes ?? {}).map((route) => route.credential_ref),
    ...Object.values(unit.research_sources ?? {}).map((source) => source?.credential_ref),
  ]
  return [...new Set(names.filter((name): name is string => typeof name === 'string' && name.length > 0))]
}

/**
 * `docker run` for the runtime. Variables pass by name only (`-e NAME`): Docker reads each value from the CLI's own
 * environment, so none is written in the command line.
 */
export function containerArgs({
  checkout,
  envNames,
  command,
}: {
  checkout: string
  envNames: readonly string[]
  command: readonly string[]
}): string[] {
  const env = [...new Set([...envNames, 'SOPHIA_SERVICE_URL'])].flatMap((name) => ['-e', name])
  return [
    'run',
    '--rm',
    '--init',
    '-i',
    '--name',
    RUNTIME_CONTAINER,
    '-v',
    `${checkout}:/src:ro`,
    '-v',
    `${RUNTIME_VOLUME}:/work`,
    ...env,
    RUNTIME_IMAGE,
    ...command,
  ]
}

const git = (args: string[]) => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

/** Removes the runtime's container, if one is left. */
export function removeRuntimeContainer(): void {
  spawnSync('docker', ['rm', '-f', RUNTIME_CONTAINER], { stdio: 'ignore' })
}

/**
 * Starts the runtime in its container from the checkout at `checkout` (the dev stack's working directory), bound to
 * the host's API, and writes the copy manifest to its input, which stays open while the dev stack runs.
 */
export function startRuntimeContainer({
  checkout,
  env,
  rehearse,
}: {
  checkout: string
  env: Record<string, string>
  rehearse: boolean
}): ChildProcess {
  const staged = git(['ls-files', '-s', '-z'])
  const untracked = git(['ls-files', '-o', '--exclude-standard', '-z'])
  if (staged.status !== 0 || untracked.status !== 0)
    throw new Error(`git ls-files failed: ${staged.stderr}${untracked.stderr}`)
  const manifest = copyManifest(staged.stdout, untracked.stdout)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the committed runtime unit (config/runtime-unit.json)
  const unit = JSON.parse(readFileSync(`${checkout}/config/runtime-unit.json`, 'utf8')) as Parameters<
    typeof credentialNames
  >[0]
  const envNames = [...Object.keys(env), ...credentialNames(unit).filter((name) => process.env[name])]
  removeRuntimeContainer()
  const child = spawn(
    'docker',
    containerArgs({
      checkout: checkout.replaceAll('\\', '/'),
      envNames,
      command: ['node', '/src/scripts/runtime-container.mjs', ...(rehearse ? ['--rehearse'] : [])],
    }),
    {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, ...env, SOPHIA_SERVICE_URL: CONTAINER_SERVICE_URL, MSYS_NO_PATHCONV: '1' },
    },
  )
  // The manifest is the first line; the input then stays open. It closes when this process goes, however it goes
  // (a stop that kills the process tree runs no handler here), and the container then stops its runtime and exits.
  child.stdin.write(`${JSON.stringify(manifest)}\n`)
  return child
}
