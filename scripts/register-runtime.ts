#!/usr/bin/env node
// OPERATOR PROVISIONING (S1-05A): register the dsh runtime that will run a project's native work, as the migration
// owner. It creates the project's dsh executor resource if needed, retires any earlier capability for the same
// runtime unit, and prints the new capability ONCE. Only its SHA-256 is stored. Put the capability in the
// execution host's secret store as SOPHIA_RUNTIME_TOKEN; never in Git, chat or an issue.
//   node --env-file=<env> scripts/register-runtime.ts <projectId> <adminEmail> [runtimeUnitId]
// Needs SOPHIA_MIGRATION_DATABASE_URL. The runtime unit defaults to config/runtime-unit.json's id.
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { withClient } from './lib/postgres.ts'

const unitOf = (): string => {
  const parsed: unknown = JSON.parse(readFileSync(new URL('../config/runtime-unit.json', import.meta.url), 'utf8'))
  const id = typeof parsed === 'object' && parsed !== null && 'id' in parsed ? parsed.id : undefined
  if (typeof id !== 'string') throw new Error('config/runtime-unit.json has no id')
  return id
}

const [projectId, email, runtimeUnitId = unitOf()] = process.argv.slice(2)
const url = process.env.SOPHIA_MIGRATION_DATABASE_URL?.trim()
if (!projectId || !email || !url) {
  console.error('usage: node --env-file=<env> scripts/register-runtime.ts <projectId> <adminEmail> [runtimeUnitId]')
  console.error('       (needs SOPHIA_MIGRATION_DATABASE_URL)')
  process.exit(2)
}

const token = randomBytes(32).toString('base64url')
try {
  const runtimeId = await withClient(url, async (c) => {
    const admin = await c.query<{ id: string }>(`SELECT id FROM auth.users WHERE lower(email) = lower($1)`, [email])
    const actor = admin.rows[0]?.id
    if (!actor) throw new Error(`No Auth user with email ${email}`)
    const { rows } = await c.query<{ id: string }>(`SELECT sophia.register_runtime($1, $2, $3, $4) AS id`, [
      projectId,
      actor,
      runtimeUnitId,
      createHash('sha256').update(token, 'utf8').digest(),
    ])
    return rows[0]?.id
  })
  console.log(`✓ runtime ${runtimeId ?? '?'} registered for unit ${runtimeUnitId}`)
  console.log('Capability (shown once; store it as SOPHIA_RUNTIME_TOKEN on the execution host):')
  console.log(token)
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
}
