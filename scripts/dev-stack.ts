#!/usr/bin/env node
// Local dev stack → API (:8787, supervised) → Studio (:5173). Three backends:
//   node scripts/dev-stack.ts                       synthetic HS256 identities on a dev postgres:16
//   node scripts/dev-stack.ts --supabase            real Supabase Auth on the local Supabase stack
//   node scripts/dev-stack.ts --hosted <env-file>   the HOSTED project (real accounts and data);
//                                                   the env file stays outside the repository
// With the synthetic backend, S1-05A adds the worker (runtime dispatch) and, on request, the dsh runtime:
//   --runtime rehearse   keyless mock model: exercises the whole brief path, never live evidence
//   --runtime live       the recorded model route with the key in YOUR environment: billable model calls
// and the media bridge (Sophia's voice in the room):
//   --voice rehearse     no Google call and no key: a chime stands in for her voice, never live evidence
//   --voice live         Gemini Live with GEMINI_API_KEY from YOUR environment: billable model calls
// SOPHIA_DEV_DATABASE_URL points the synthetic backend at a PostgreSQL 16 you already run (no container).
// Everything is dev-only. Ctrl+C stops the API and Studio (database containers are kept).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { readEnvFile, requireKeys } from './lib/env-file.ts'
import { namedLiveKit } from './lib/livekit.ts'
import { namedPostgres } from './lib/postgres.ts'

process.chdir(fileURLToPath(new URL('..', import.meta.url)))

const STUDIO_ENV = 'apps/studio/.env.development.local'
const API_KEYS = ['SOPHIA_API_DATABASE_URL', 'SUPABASE_JWT_ISSUER', 'SUPABASE_JWKS_URL'] as const

interface Backend {
  apiEnv: Record<string, string>
  /** The worker's database login and the registered runtime's capability (synthetic backend only). */
  workerEnv?: Record<string, string>
  runtimeEnv?: Record<string, string>
  mediaEnv?: Record<string, string>
  /** Values the browser may see (public or dev-only). */
  studioEnv: Record<string, string>
  banner: string
}

const pick = (env: Record<string, string>, keys: readonly string[]) =>
  Object.fromEntries(keys.map((k) => [k, env[k] ?? '']))

/** Project rooms on the local LiveKit container (S1-04); the hosted backend brings its own server. */
function localRoomServer(): Record<string, string> {
  const lk = namedLiveKit()
  return { LIVEKIT_URL: lk.url, LIVEKIT_API_KEY: lk.apiKey, LIVEKIT_API_SECRET: lk.apiSecret }
}

const LIVEKIT_KEYS = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const

function hostedBackend(file: string): Backend {
  const env = readEnvFile(file)
  requireKeys(env, [...API_KEYS, 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'], file)
  // Rooms need a LiveKit server reachable by both founders; without one the Studio says voice is unavailable.
  const rooms = env.LIVEKIT_URL ? pick(env, LIVEKIT_KEYS) : {}
  return {
    apiEnv: { ...pick(env, API_KEYS), ...rooms },
    studioEnv: {
      VITE_SUPABASE_URL: env.SUPABASE_URL ?? '',
      VITE_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY ?? '',
    },
    banner: `HOSTED project ${env.SUPABASE_URL} · real accounts and data · sign-in links go to your real inbox`,
  }
}

function localSupabaseBackend(): Backend {
  const r = spawnSync(process.execPath, ['scripts/supabase-local.ts'], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('supabase-local failed')
  const env = readEnvFile('.env.supabase.local')
  requireKeys(env, API_KEYS, '.env.supabase.local')
  return {
    apiEnv: { ...pick(env, API_KEYS), ...localRoomServer() },
    studioEnv: {}, // supabase-local already wrote the Studio's public values
    banner: [
      `Supabase Auth (local) · sign-in emails in Mailpit ${env.MAILPIT_URL}`,
      'Add a member: node --env-file=.env.supabase.local scripts/add-member.ts <projectId> <email> [editor|viewer|admin]',
    ].join('\n'),
  }
}

function syntheticBackend(): Backend {
  const own = process.env.SOPHIA_DEV_DATABASE_URL
  const server = own ? { url: own } : namedPostgres('sophia-dev-pg', 55440, 'dev')
  const seeded = spawnSync(process.execPath, ['apps/api/scripts/dev-db.ts', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, SOPHIA_DISPOSABLE_DATABASE_URL: server.url },
  })
  if (seeded.status !== 0) throw new Error(`dev-db failed: ${seeded.stderr}`)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the last line apps/api/scripts/dev-db.ts prints
  const dev = JSON.parse(seeded.stdout.trim().split('\n').at(-1) ?? '{}') as {
    api: Record<string, string>
    worker: Record<string, string>
    runtime: Record<string, string>
    media: Record<string, string>
    project: { projectId: string }
    identities: unknown[]
  }
  const rooms = localRoomServer()
  return {
    apiEnv: { ...dev.api, ...rooms },
    // The worker takes declined guests out of the call (amendment A07): it needs the same LiveKit server.
    workerEnv: { ...dev.worker, ...rooms },
    runtimeEnv: { ...dev.runtime, SOPHIA_PROJECT_ID: dev.project.projectId },
    mediaEnv: dev.media,
    studioEnv: { VITE_DEV_PROJECT_ID: dev.project.projectId, VITE_DEV_IDENTITIES: JSON.stringify(dev.identities) },
    banner: `Synthetic dev identities · project ${dev.project.projectId}`,
  }
}

const { values: flags } = parseArgs({
  options: {
    supabase: { type: 'boolean' },
    hosted: { type: 'string' },
    runtime: { type: 'string' },
    voice: { type: 'string' },
  },
})

function chooseBackend(): Backend {
  if (flags.hosted) return hostedBackend(flags.hosted)
  if (flags.supabase) return localSupabaseBackend()
  return syntheticBackend()
}

/** The worker dispatches admitted native work to the runtime's queue (S1-05A). */
function startWorker(workerEnv: Record<string, string>): ChildProcess {
  return spawn(process.execPath, ['apps/worker/src/server.ts'], {
    stdio: 'inherit',
    env: { ...process.env, ...workerEnv },
  })
}

/** The dsh runtime under the execution-host supervisor, bound to this API; rehearsal uses the mock model. */
function startRuntime(runtimeEnv: Record<string, string>, mode: string): ChildProcess {
  if (mode !== 'rehearse' && mode !== 'live') throw new Error('--runtime is rehearse or live')
  const root = `.sophia-runtime/${runtimeEnv.SOPHIA_PROJECT_ID ?? 'dev'}`
  const args = ['scripts/runtime-host.mjs', '--root', root, ...(mode === 'rehearse' ? ['--rehearse'] : [])]
  return spawn(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, ...runtimeEnv, SOPHIA_SERVICE_URL: 'http://127.0.0.1:8787' },
  })
}

/** Sophia's voice in the room: the media bridge bound to this API (S1-05A); rehearsal calls no Google model. */
function startBridge(mediaEnv: Record<string, string>, mode: string): ChildProcess {
  if (mode !== 'rehearse' && mode !== 'live') throw new Error('--voice is rehearse or live')
  return spawn(process.execPath, ['apps/media-bridge/src/server.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...mediaEnv,
      NODE_ENV: 'production',
      SOPHIA_SERVICE_URL: 'http://127.0.0.1:8787',
      ...(mode === 'rehearse' ? { SOPHIA_LIVE_MODE: 'rehearse' } : {}),
    },
  })
}

/** Invitation emails are written here (gitignored), never sent: open the .html to read one. */
const MAIL_DIR = '.sophia-mail'

/** The API restarts if it exits, so the Studio's reconnection can be exercised locally. */
function superviseApi(apiEnv: Record<string, string>, isStopping: () => boolean): () => ChildProcess {
  let current: ChildProcess
  const start = () => {
    current = spawn(process.execPath, ['apps/api/src/server.ts'], {
      stdio: 'inherit',
      env: { SOPHIA_MAIL_DIR: MAIL_DIR, ...process.env, ...apiEnv, PORT: '8787' },
    })
    current.on('exit', (code) => {
      if (isStopping()) return
      console.log(`\nAPI exited (${code ?? 'signal'}); restarting in 2 s…`)
      setTimeout(() => {
        if (!isStopping()) start()
      }, 2000)
    })
  }
  start()
  return () => current
}

const backend = chooseBackend()
if (Object.keys(backend.studioEnv).length > 0) {
  // Vite loads *.development.local only in dev mode; the file is gitignored (.env.*).
  writeFileSync(
    STUDIO_ENV,
    `${Object.entries(backend.studioEnv)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')}\n`,
  )
}

// Invitation links need a secret and the Studio address; a fresh secret per run is enough locally.
const inviteEnv = { INVITE_TOKEN_SECRET: randomBytes(32).toString('hex'), STUDIO_URL: 'http://localhost:5173' }
let stopping = false
const api = superviseApi({ ...inviteEnv, ...backend.apiEnv }, () => stopping)
const studio = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', cwd: 'apps/studio' })
const worker = backend.workerEnv ? startWorker(backend.workerEnv) : null
const runtime = backend.runtimeEnv && flags.runtime ? startRuntime(backend.runtimeEnv, flags.runtime) : null
const bridge = backend.mediaEnv && flags.voice ? startBridge(backend.mediaEnv, flags.voice) : null
console.log(`\nSophia dev stack · ${backend.banner}\nStudio http://localhost:5173 · API http://127.0.0.1:8787\n`)

const stop = () => {
  stopping = true
  api().kill()
  studio.kill()
  worker?.kill()
  runtime?.kill()
  bridge?.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
studio.on('exit', stop)
