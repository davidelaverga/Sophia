#!/usr/bin/env node
// Run a command with SOPHIA_DISPOSABLE_DATABASE_URL pointing at a disposable PostgreSQL 16: the CI
// service when the variable is set, otherwise a throwaway container removed afterwards.
//   node scripts/with-postgres.ts <command> [args...]
import { spawnSync } from 'node:child_process'
import { disposablePostgres } from './lib/postgres.ts'

const [cmd, ...args] = process.argv.slice(2)
if (!cmd) {
  console.error('usage: node scripts/with-postgres.ts <command> [args...]')
  process.exit(2)
}

const server = disposablePostgres()
const env = { ...process.env, SOPHIA_DISPOSABLE_DATABASE_URL: server.url }
// Windows resolves .cmd shims only through a shell; the command comes from package.json.
const child =
  process.platform === 'win32'
    ? spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', shell: true, env })
    : spawnSync(cmd, args, { stdio: 'inherit', env })
server.stop()
process.exit(child.status ?? 1)
