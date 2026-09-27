// PostgreSQL servers for local scripts and tests: the CI service (SOPHIA_DISPOSABLE_DATABASE_URL),
// a throwaway Docker container, or a named dev container kept between runs.
import { spawnSync } from 'node:child_process'
import pg from 'pg'

export interface PostgresServer {
  /** Admin connection URL (database `postgres`). */
  url: string
  stop(): void
}

const docker = (args: string[]) => spawnSync('docker', args, { encoding: 'utf8' })

export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** pg_isready can succeed during initdb's temporary server, so require a real query. */
function waitUntilReady(container: string, attempts = 60): boolean {
  for (let i = 0; i < attempts; i++) {
    if (docker(['exec', container, 'psql', '-U', 'postgres', '-tAc', 'select 1']).stdout.trim() === '1') return true
    sleepSync(1000)
  }
  return false
}

/** SOPHIA_DISPOSABLE_DATABASE_URL when set (CI service), otherwise a throwaway postgres:16. */
export function disposablePostgres(): PostgresServer {
  const fromEnv = process.env.SOPHIA_DISPOSABLE_DATABASE_URL?.trim()
  if (fromEnv) return { url: fromEnv, stop: () => undefined }

  const name = `sophia-pg-${process.pid}`
  const password = 'disposable'
  const started = docker([
    'run',
    '-d',
    '--rm',
    '--name',
    name,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-p',
    '127.0.0.1::5432',
    'postgres:16',
  ])
  if (started.status !== 0) throw new Error(`docker run failed: ${started.stderr}`)
  const stop = () => void docker(['stop', name])
  const port = docker(['port', name, '5432/tcp']).stdout.trim().split('\n')[0]?.split(':').at(-1)
  if (!waitUntilReady(name) || !port) {
    stop()
    throw new Error('postgres:16 did not become ready')
  }
  return { url: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`, stop }
}

/** A named dev container on a fixed local port, created if missing and kept between runs. */
export function namedPostgres(name: string, port: number, password: string): PostgresServer {
  if (!docker(['ps', '-q', '--filter', `name=^${name}$`]).stdout.trim()) {
    docker(['rm', '-f', name])
    const started = docker([
      'run',
      '-d',
      '--name',
      name,
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      '-p',
      `127.0.0.1:${port}:5432`,
      'postgres:16',
    ])
    if (started.status !== 0) throw new Error(`docker run failed: ${started.stderr}`)
  }
  if (!waitUntilReady(name)) throw new Error(`${name} did not become ready`)
  return { url: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`, stop: () => undefined }
}

export function withDatabase(url: string, database: string): string {
  const u = new URL(url)
  u.pathname = `/${database}`
  return u.toString()
}

export async function withClient<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}
