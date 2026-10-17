/**
 * The service executor's complete identity (A35/A40 `executorArtifactDigest`, #393 4302689994): one digest over the
 * installed closure that actually runs a service reply, derived from the loaded components, never taken on trust.
 *
 * Recipe `sophia-executor-closure-v1`, the SHA-256 of the recipe's name, a newline and the canonical JSON (keys sorted)
 * of these components:
 * - `runtime`: the dsh runtime this process was launched from (`argv[1]` is its declared bin), with its dependency
 *   closure: dsh-base, the LLM adapters, pi-ai and the OpenAI SDK. Digested as `sophia-tree-v2` (the recorded
 *   `dsh.artifacts_by_platform` scheme, scripts/lib/tree-digest.mjs), with no exclusion beyond that scheme's.
 * - `bundle`: this installed Sophia bundle's own files, the code that runs the executor, digested the same way.
 * - `profile`: the SHA-256 of each profile input the profile was installed from (package.json, pnpm-workspace.yaml,
 *   cordis.patch.yml, pnpm-lock.yaml) and of the archive it installed.
 * - `overlays`: the SHA-256 of each `--patch` file, in order: the effective configuration over the profile, such as a
 *   route's provider, model, effort, caps, compat, retry and credential reference (a name, never a value).
 * - `launcher` and `toolchain`: the declared bin, the profile name, and Node's version, platform and architecture.
 *
 * Every component is read from what this process loaded, so a changed adapter, SDK, bundle, profile input or overlay
 * changes the digest. A symlink that resolves outside its root, a launch this recipe cannot read, or an unsupported
 * platform leaves the closure unverifiable. The digest is recorded outside the archive it covers (the operator's
 * expected pin), so the archive never hashes itself. Nothing here reads, hashes or logs a credential value.
 */

import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const EXECUTOR_CLOSURE_RECIPE = 'sophia-executor-closure-v1'
/** The dsh package's declared bin, relative to the runtime root (scripts/lib/common.mjs DSH_ENTRY). */
export const DSH_ENTRY = 'node_modules/@deepseek-ai/dsh/lib/bin.js'
/** The profile's installed inputs (scripts/lib/artifacts.mjs PROFILE_FILES plus its lock). */
export const PROFILE_INPUTS = ['package.json', 'pnpm-workspace.yaml', 'cordis.patch.yml', 'pnpm-lock.yaml'] as const
/** Platforms with a recorded runtime artifact (config/runtime-unit.json). */
const SUPPORTED_PLATFORMS = new Set(['darwin-arm64', 'linux-x64'])
/** sophia-tree-v2's exclusions, exactly (scripts/lib/tree-digest.mjs VOLATILE_PATHS and `.bin` shims). */
const VOLATILE_PATHS = new Set(['pnpm-lock.yaml', 'node_modules/.modules.yaml', 'node_modules/.pnpm-workspace-state-v1.json', 'node_modules/.pnpm/lock.yaml'])

/** The closure cannot be established from what is loaded; `reason` is fixed and carries no path or content. */
export class ClosureUnverifiable extends Error {
  constructor(readonly reason: 'launch_unreadable' | 'unsupported_platform' | 'symlink_escapes_root' | 'component_unreadable' | 'bundle_outside_profile') {
    super(`executor closure unverifiable: ${reason}`)
  }
}

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')

/**
 * `sophia-tree-v2` of `root`, refusing any symlink whose target is absolute or resolves outside `root`: a loaded file
 * reached through it would not be covered.
 */
export function treeDigestWithin(root: string): string {
  const base = realpathSync(root)
  const entries: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      const rel = relative(base, abs).split(sep).join('/')
      if (VOLATILE_PATHS.has(rel)) continue
      if (name === '.bin' && rel.split('/').at(-2) === 'node_modules') continue
      const stat = lstatSync(abs)
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(abs)
        const inside = relative(base, resolve(dirname(abs), target))
        if (isAbsolute(target) || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
          throw new ClosureUnverifiable('symlink_escapes_root')
        }
        entries.push(`l ${rel} - ${target}`)
      } else if (stat.isDirectory()) {
        walk(abs)
      } else if (stat.isFile()) {
        entries.push(`f ${rel} ${stat.mode & 0o111 ? 'x' : '-'} ${sha256(readFileSync(abs))}`)
      } else {
        throw new ClosureUnverifiable('component_unreadable')
      }
    }
  }
  walk(base)
  entries.sort()
  return `sophia-tree-v2:sha256:${sha256(entries.join('\n') + '\n')}`
}

/** Where the closure's components are, and the launch they ran with. */
export interface ClosureInputs {
  readonly runtimeDir: string
  readonly profileDir: string
  readonly bundleDir: string
  readonly archive: string
  readonly overlays: readonly Buffer[]
  readonly profile: string
  readonly toolchain: { readonly node: string; readonly platform: string; readonly arch: string }
}

/** Canonical JSON: object keys sorted at every level. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** The closure's components and its digest (64 lowercase hex), or ClosureUnverifiable. */
export function executorClosure(inputs: ClosureInputs): { digest: string; components: Record<string, unknown> } {
  const platform = `${inputs.toolchain.platform}-${inputs.toolchain.arch}`
  if (!SUPPORTED_PLATFORMS.has(platform)) throw new ClosureUnverifiable('unsupported_platform')
  const profileDir = realpathSync(inputs.profileDir)
  const bundleDir = realpathSync(inputs.bundleDir)
  const within = relative(profileDir, bundleDir)
  if (within === '' || within.startsWith('..') || isAbsolute(within)) throw new ClosureUnverifiable('bundle_outside_profile')
  let profile: Record<string, string>
  try {
    profile = Object.fromEntries([...PROFILE_INPUTS, inputs.archive].map((file) => [file, sha256(readFileSync(join(profileDir, file)))]))
  } catch {
    throw new ClosureUnverifiable('component_unreadable')
  }
  const components = {
    recipe: EXECUTOR_CLOSURE_RECIPE,
    runtime: treeDigestWithin(inputs.runtimeDir),
    bundle: treeDigestWithin(bundleDir),
    profile,
    overlays: inputs.overlays.map((bytes) => sha256(bytes)),
    launcher: { entry: DSH_ENTRY, profile: inputs.profile },
    toolchain: { node: inputs.toolchain.node, platform },
  }
  return { digest: sha256(`${EXECUTOR_CLOSURE_RECIPE}\n${canonical(components)}`), components }
}

/**
 * The closure inputs of THIS dsh process: its runtime from `argv[1]`, its profile from `--profile` under DSH_HOME, the
 * installed bundle `bundleDir`, and every `--patch` file. Any other launch shape is unreadable, so no closure is
 * claimed for it.
 */
export function loadedClosureInputs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  bundleDir: string,
  archive: string,
  toolchain: ClosureInputs['toolchain'],
): ClosureInputs {
  const entry = argv[1] === undefined ? '' : resolve(argv[1])
  const suffix = `${sep}${DSH_ENTRY.split('/').join(sep)}`
  if (!entry.endsWith(suffix)) throw new ClosureUnverifiable('launch_unreadable')
  let profile: string | null = null
  const patches: string[] = []
  const rest = argv.slice(2)
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]]
    if (value === undefined || value.startsWith('--')) throw new ClosureUnverifiable('launch_unreadable')
    if (flag === '--profile' && profile === null) profile = value
    else if (flag === '--patch') patches.push(value)
    else throw new ClosureUnverifiable('launch_unreadable')
  }
  if (profile === null || !/^[a-z0-9][a-z0-9-]*$/.test(profile)) throw new ClosureUnverifiable('launch_unreadable')
  let overlays: Buffer[]
  try {
    overlays = patches.map((file) => readFileSync(resolve(file)))
  } catch {
    throw new ClosureUnverifiable('component_unreadable')
  }
  const dshHome = env.DSH_HOME ?? join(homedir(), '.dsh')
  return {
    runtimeDir: entry.slice(0, -suffix.length),
    profileDir: join(dshHome, 'profiles', profile),
    bundleDir,
    archive,
    overlays,
    profile,
    toolchain,
  }
}
