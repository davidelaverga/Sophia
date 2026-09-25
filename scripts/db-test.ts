#!/usr/bin/env node
// Apply migrations in order, then run the SQL test files, on a fresh database of a DISPOSABLE server.
//   node scripts/db-test.ts [--source repo|pack] [--allow-empty]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { disposablePostgres, withClient, withDatabase } from './lib/postgres.ts'

const SOURCES = { repo: 'db', pack: 'docs/pack/db' } as const

const { values } = parseArgs({
  options: { source: { type: 'string', default: 'repo' }, 'allow-empty': { type: 'boolean', default: false } },
})
const source = values.source as keyof typeof SOURCES
const base = SOURCES[source] as string | undefined
if (!base) fail(`unknown --source ${values.source} (use repo or pack)`)

const sqlFiles = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .toSorted()
        .map((f) => join(dir, f))
    : []
const migrations = sqlFiles(join(base, 'migrations'))
const tests = sqlFiles(join(base, 'tests'))

if (migrations.length === 0) {
  if (!values['allow-empty']) fail(`no migrations in ${base}/migrations`)
  console.log(`db-test: no migrations in ${base}/migrations — skipped (--allow-empty).`)
  process.exit(0)
}

const server = disposablePostgres()
if (/sophia[-_]?(prod|legacy|pilot)/i.test(server.url)) fail('refusing a URL that looks like a non-disposable database')
const database = `sophia_dbtest_${Date.now()}`
let failed = false
try {
  await withClient(server.url, (c) => c.query(`CREATE DATABASE ${database}`))
  failed = !(await runFiles(withDatabase(server.url, database), [...migrations, ...tests]))
  await withClient(server.url, (c) => c.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`))
} finally {
  server.stop()
}
console.log(
  failed
    ? 'db-test: FAILED'
    : `db-test: ${migrations.length} migrations, ${tests.length} test files passed (${source})`,
)
process.exit(failed ? 1 : 0)

/** Each file owns its transaction (migrations commit, tests roll back); stop at the first failure. */
async function runFiles(url: string, files: string[]): Promise<boolean> {
  return withClient(url, async (c) => {
    for (const file of files) {
      try {
        await c.query(readFileSync(file, 'utf8'))
        console.log(`ok   ${file}`)
      } catch (err: unknown) {
        console.log(`FAIL ${file}\n${err instanceof Error ? err.message : String(err)}`)
        return false
      }
    }
    return true
  })
}

function fail(message: string): never {
  console.error(`db-test: ${message}`)
  process.exit(1)
}
