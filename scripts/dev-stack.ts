#!/usr/bin/env node
// Local dev stack → API (:8787, supervised) → Studio (:5173). Three backends:
//   node scripts/dev-stack.ts                       synthetic HS256 identities on a dev postgres:16
//   node scripts/dev-stack.ts --supabase            real Supabase Auth on the local Supabase stack
//   node scripts/dev-stack.ts --hosted <env-file>   the HOSTED project (real accounts and data);
//                                                   the env file stays outside the repository
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
  const server = namedPostgres('sophia-dev-pg', 55440, 'dev')
  const seeded = spawnSync(process.execPath, ['apps/api/scripts/dev-db.ts', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, SOPHIA_DISPOSABLE_DATABASE_URL: server.url },
  })
  if (seeded.status !== 0) throw new Error(`dev-db failed: ${seeded.stderr}`)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the last line apps/api/scripts/dev-db.ts prints
  const dev = JSON.parse(seeded.stdout.trim().split('\n').at(-1) ?? '{}') as {
    api: Record<string, string>
    project: { projectId: string }
    identities: unknown[]
  }
  return {
    apiEnv: { ...dev.api, ...localRoomServer() },
    studioEnv: { VITE_DEV_PROJECT_ID: dev.project.projectId, VITE_DEV_IDENTITIES: JSON.stringify(dev.identities) },
    banner: `Synthetic dev identities · project ${dev.project.projectId}`,
  }
}

function chooseBackend(): Backend {
  const { values } = parseArgs({ options: { supabase: { type: 'boolean' }, hosted: { type: 'string' } } })
  if (values.hosted) return hostedBackend(values.hosted)
  if (values.supabase) return localSupabaseBackend()
  return syntheticBackend()
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
console.log(`\nSophia dev stack · ${backend.banner}\nStudio http://localhost:5173 · API http://127.0.0.1:8787\n`)

const stop = () => {
  stopping = true
  api().kill()
  studio.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
studio.on('exit', stop)
