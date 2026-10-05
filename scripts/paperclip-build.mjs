#!/usr/bin/env node
// Builds the two Paperclip packages of WBC-02 against the pinned Paperclip checkout, outside this repository's tree:
//   node scripts/paperclip-build.mjs --paperclip <checkout of paperclipai/paperclip at the pin> [--out <dir>]
// 1. refuses any checkout whose HEAD is not the pin;
// 2. typechecks the structural bindings against the pin's own types: the plugin SDK's PluginContext and
//    PluginApiRequestInput must be assignable to bind.ts's SdkContext and SdkApiRequest, and createServerAdapter() must
//    be a ServerAdapterModule of @paperclipai/adapter-utils;
// 3. bundles, with the pin's esbuild, the plugin (manifest, worker, migrations) and the external adapter into
//    self-contained packages, and writes MANIFEST.json with each file's sha256.
// The checkout needs `pnpm install --frozen-lockfile` and `pnpm --filter @paperclipai/plugin-sdk build`. Nothing here
// installs anything into a Paperclip instance: installing is the release operator's step (deploy/paperclip/README.md).
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export const PAPERCLIP_PIN = '5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb'
const REPO = resolve(import.meta.dirname, '..')

const { values } = parseArgs({ options: { paperclip: { type: 'string' }, out: { type: 'string' } } })
const checkout = resolve(values.paperclip ?? process.env.PAPERCLIP_SOURCE ?? '')
const out = resolve(values.out ?? join(REPO, 'deploy/paperclip/dist'))

function pinned() {
  const head = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (head !== PAPERCLIP_PIN) throw new Error(`${checkout} is at ${head}, not the pin ${PAPERCLIP_PIN}`)
  const dirty = execFileSync('git', ['-C', checkout, 'status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  })
  if (dirty.trim() !== '') throw new Error(`${checkout} has local changes to tracked files; build from a clean pin`)
  statSync(join(checkout, 'packages/plugins/sdk/dist/index.js'))
}

const src = (path) => join(REPO, path)
const entries = join(out, '.entries')

/** The SDK entry (the only code that names the SDK at run time) and the checks of the structural bindings. */
function writeEntries() {
  mkdirSync(entries, { recursive: true })
  writeFileSync(join(entries, 'package.json'), '{ "type": "module" }\n')
  const bind = JSON.stringify(src('packages/paperclip-plugin/src/bind.ts'))
  const manifest = JSON.stringify(src('packages/paperclip-plugin/src/manifest.ts'))
  const adapter = JSON.stringify(src('packages/paperclip-adapters/src/sophia-dsh/index.ts'))
  writeFileSync(
    join(entries, 'worker.ts'),
    `import { definePlugin, runWorker } from '@paperclipai/plugin-sdk'
import { pluginHandlers } from ${bind}
const handlers = pluginHandlers()
const plugin = definePlugin({ setup: (ctx) => handlers.setup(ctx), onApiRequest: (input) => handlers.onApiRequest(input) })
export default plugin
runWorker(plugin, import.meta.url)
`,
  )
  writeFileSync(join(entries, 'manifest.ts'), `import { manifest } from ${manifest}\nexport default manifest\n`)
  // Paperclip loads createServerAdapter; the factory and the unreachable error are exported for
  // scripts/paperclip-host-probe.mjs, which runs this same bundle in the pin's heartbeat with a scripted Sophia.
  writeFileSync(
    join(entries, 'adapter.ts'),
    `export { createServerAdapter, createSophiaDshAdapter, SophiaUnreachable } from ${adapter}\n`,
  )
  writeFileSync(
    join(entries, 'bindings.check.ts'),
    `import type { PaperclipPluginManifestV1, PluginApiRequestInput, PluginContext } from '@paperclipai/plugin-sdk'
import type { ServerAdapterModule } from '@paperclipai/adapter-utils'
import type { SdkApiRequest, SdkContext } from ${bind}
import { manifest } from ${manifest}
import { createServerAdapter } from ${adapter}
export const context = (ctx: PluginContext): SdkContext => ctx
export const request = (input: PluginApiRequestInput): SdkApiRequest => input
type DeepMutable<T> = T extends readonly (infer U)[] ? DeepMutable<U>[] : T extends object ? { -readonly [K in keyof T]: DeepMutable<T[K]> } : T
// The manifest is declared readonly (as const): the same shape made mutable, every field and literal checked against
// the pin's manifest type.
const mutable: DeepMutable<typeof manifest> = JSON.parse(JSON.stringify(manifest))
export const declared: PaperclipPluginManifestV1 = mutable
export const adapterModule = (): ServerAdapterModule => createServerAdapter()
`,
  )
}

/** Typecheck the entries and the bindings with this repository's TypeScript, resolving Paperclip at the pin. */
function typecheck() {
  // The pin's own strictness (not this repository's stricter base): assignability is judged as the host compiles it.
  const config = {
    compilerOptions: {
      target: 'ES2024',
      lib: ['ES2024', 'DOM'],
      module: 'esnext',
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: ['node'],
      typeRoots: [src('node_modules/@types')],
      paths: {
        '@paperclipai/plugin-sdk': [join(checkout, 'packages/plugins/sdk/dist/index.d.ts')],
        '@paperclipai/adapter-utils': [join(checkout, 'packages/adapter-utils/src/index.ts')],
        '@paperclipai/shared': [join(checkout, 'packages/shared/dist/index.d.ts')],
      },
    },
    files: [join(entries, 'bindings.check.ts'), join(entries, 'worker.ts')],
  }
  writeFileSync(join(entries, 'tsconfig.json'), JSON.stringify(config, null, 2))
  execFileSync(process.execPath, [src('node_modules/typescript/bin/tsc'), '-p', join(entries, 'tsconfig.json')], {
    stdio: 'inherit',
  })
}

async function bundle() {
  const { build } = await import(pathToFileURL(join(checkout, 'node_modules/esbuild/lib/main.js')).href)
  const common = {
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    legalComments: 'none',
    logLevel: 'warning',
  }
  const sdk = { '@paperclipai/plugin-sdk': join(checkout, 'packages/plugins/sdk/dist/index.js') }
  const plugin = join(out, 'sophia-coordination-plugin')
  await build({
    ...common,
    entryPoints: [join(entries, 'worker.ts')],
    outfile: join(plugin, 'dist/worker.js'),
    alias: sdk,
    nodePaths: [join(checkout, 'node_modules')],
  })
  await build({ ...common, entryPoints: [join(entries, 'manifest.ts')], outfile: join(plugin, 'dist/manifest.js') })
  cpSync(src('packages/paperclip-plugin/migrations'), join(plugin, 'migrations'), { recursive: true })
  writeFileSync(
    join(plugin, 'package.json'),
    `${JSON.stringify({ name: '@sophia/paperclip-coordination-plugin', version: '0.1.0', private: true, type: 'module', paperclipPlugin: { manifest: './dist/manifest.js', worker: './dist/worker.js' } }, null, 2)}\n`,
  )
  const adapter = join(out, 'sophia-dsh-adapter')
  await build({ ...common, entryPoints: [join(entries, 'adapter.ts')], outfile: join(adapter, 'dist/index.js') })
  writeFileSync(
    join(adapter, 'package.json'),
    `${JSON.stringify({ name: '@sophia/paperclip-adapter-sophia-dsh', version: '0.1.0', private: true, type: 'module', exports: { '.': './dist/index.js' } }, null, 2)}\n`,
  )
}

/** Every built file with its sha256, the pin and the commit it was built from. */
function record() {
  const files = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
    )
  const built = files(out).filter((f) => !f.includes(`${'/'}.entries${'/'}`) && !f.endsWith('MANIFEST.json'))
  const commit = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const dirty = execFileSync('git', ['-C', REPO, 'status', '--porcelain'], { encoding: 'utf8' }).trim() !== ''
  const manifest = {
    paperclipPin: PAPERCLIP_PIN,
    sophiaCommit: commit,
    sophiaTreeDirty: dirty,
    files: Object.fromEntries(
      built.toSorted().map((f) => [relative(out, f), createHash('sha256').update(readFileSync(f)).digest('hex')]),
    ),
  }
  writeFileSync(join(out, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

pinned()
rmSync(out, { recursive: true, force: true })
writeEntries()
typecheck()
await bundle()
const manifest = record()
rmSync(entries, { recursive: true, force: true })
console.log(`built against paperclip@${PAPERCLIP_PIN} into ${out}`)
for (const [file, sha] of Object.entries(manifest.files)) console.log(`  ${sha}  ${file}`)
