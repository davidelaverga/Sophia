#!/usr/bin/env node
// OPERATOR STAND-IN until the membership invitation handler exists (named product work): add an
// existing Auth user (by email) to a project, as the migration owner. Works for the local stack and
// the hosted project; the target database comes from SOPHIA_MIGRATION_DATABASE_URL.
//   node --env-file=.env.supabase.local scripts/add-member.ts <projectId> <email> [editor|viewer|admin]
// The person must have signed in once. Only the membership row changes.
import { withClient } from './lib/postgres.ts'

const ROLES = ['editor', 'viewer', 'admin'] as const
type Role = (typeof ROLES)[number]
const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value)

const [projectId, email, role = 'editor'] = process.argv.slice(2)
const url = process.env.SOPHIA_MIGRATION_DATABASE_URL?.trim()
if (!projectId || !email || !isRole(role) || !url) {
  console.error('usage: node --env-file=<env> scripts/add-member.ts <projectId> <email> [editor|viewer|admin]')
  console.error('       (needs SOPHIA_MIGRATION_DATABASE_URL)')
  process.exit(2)
}

try {
  const message = await withClient(url, async (c) => {
    const project = await c.query<{ title: string }>(`SELECT title FROM sophia.projects WHERE id = $1`, [projectId])
    const title = project.rows[0]?.title
    if (title === undefined) throw new Error(`No project ${projectId}`)
    const { rows } = await c.query<{ role: Role }>(
      `INSERT INTO sophia.project_members(project_id, actor_id, role)
       SELECT $1::uuid, u.id, $3 FROM auth.users u WHERE lower(u.email) = lower($2)
       ON CONFLICT (project_id, actor_id) DO UPDATE SET role = EXCLUDED.role, active = true
       RETURNING role`,
      [projectId, email, role],
    )
    const added = rows[0]?.role
    if (added === undefined) throw new Error(`No Auth user with email ${email}. They must sign in once first.`)
    return `✓ ${email} is ${added} of "${title}"`
  })
  console.log(message)
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
}
