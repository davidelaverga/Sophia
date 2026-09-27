// pnpm db:migrate [-- --dry-run] [--dir db/migrations]
// Needs SOPHIA_MIGRATION_DATABASE_URL: the migration owner (never the API or worker login).
import { migrate } from '../src/migrate.ts'

const args = process.argv.slice(2)
const url = process.env.SOPHIA_MIGRATION_DATABASE_URL?.trim()
if (!url) {
  console.error('SOPHIA_MIGRATION_DATABASE_URL is required (migration owner connection).')
  process.exit(2)
}
const dir = (args.includes('--dir') ? args[args.indexOf('--dir') + 1] : undefined) ?? 'db/migrations'

try {
  const report = await migrate(url, dir, { dryRun: args.includes('--dry-run') })
  console.log(`PostgreSQL ${report.serverVersion} · database ${report.database} · as ${report.role}`)
  for (const r of report.rows) console.log(`${r.version}  ${r.sha256}  ${r.status.padEnd(15)}  ${r.filename}`)
  const applied = report.rows.filter((r) => r.status === 'applied').length
  console.log(
    args.includes('--dry-run')
      ? `${report.rows.filter((r) => r.status === 'pending').length} pending (dry run)`
      : `${applied} applied, ${report.rows.length - applied} already applied`,
  )
} catch (err) {
  console.error(`db:migrate: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
