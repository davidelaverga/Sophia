#!/usr/bin/env node
// OPERATOR EVIDENCE CUSTODY (INC04-S03a, migration 0107; docs/plans/capacity-observations.md): record, or revoke, one
// scoped capacity reading of an API contribution connection, as the migration owner. The reading is read from a JSON
// file the operator wrote from evidence kept OUTSIDE the database (named by reference); the database checks its scope,
// qualifications, windows and seal. It reads no key or credential, calls no provider and prints no evidence.
//   node --env-file=<env> scripts/record-capacity-observation.ts record <reading.json>
//   node --env-file=<env> scripts/record-capacity-observation.ts revoke <observationId> --reason <text>
// Recording is custody of a claim, not telemetry, quota or qualification: a reading speaks only for its exact connection,
// credential revision and qualifications, and changes no ledger. Running it against a real deployment is a credentialed
// configuration effect, held by the release-trust amendment; INC04-S03a exercises it only against disposable databases.
// Needs SOPHIA_MIGRATION_DATABASE_URL.
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  recordCapacityObservation,
  revokeCapacityObservation,
  type CapacityObservationInput,
} from '../packages/persistence/src/capacity-observations.ts'
import { withClient } from './lib/postgres.ts'

const { positionals, values } = parseArgs({ allowPositionals: true, options: { reason: { type: 'string' } } })
const [command, arg] = positionals
const url = process.env.SOPHIA_MIGRATION_DATABASE_URL?.trim()
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

function usage(): never {
  console.error('usage: node --env-file=<env> scripts/record-capacity-observation.ts record <reading.json>')
  console.error(
    '       node --env-file=<env> scripts/record-capacity-observation.ts revoke <observationId> --reason <text>',
  )
  console.error('       (needs SOPHIA_MIGRATION_DATABASE_URL)')
  process.exit(2)
}

/** The file's reading. Only its JSON shape is checked here; every rule is the database's (0107). */
function readingOf(file: string): CapacityObservationInput {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('A reading is a JSON object')
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the database validates every field and refuses the rest
  return parsed as CapacityObservationInput
}

async function record(dbUrl: string, file: string): Promise<void> {
  const reading = readingOf(file)
  const r = await withClient(dbUrl, (c) => recordCapacityObservation(c, reading))
  console.log(
    `✓ capacity observation ${r.observationId} (${r.observationKey}) for connection ${r.connectionId} at credential ` +
      `revision ${String(r.credentialRevision)}: ${r.coverage}, ${String(r.windowCount)} window(s), fresh until ${r.freshUntil}`,
  )
  console.log('! custody of a claim, not live telemetry: it changes no ledger and no admission reads it')
}

async function revoke(dbUrl: string, observationId: string): Promise<void> {
  const reason = values.reason
  if (!reason) usage()
  await withClient(dbUrl, (c) => revokeCapacityObservation(c, observationId, reason))
  console.log(`✓ capacity observation ${observationId} revoked`)
}

if (!url || !arg || positionals.length !== 2 || (command !== 'record' && command !== 'revoke')) usage()
try {
  await (command === 'record' ? record(url, arg) : revoke(url, arg))
} catch (err: unknown) {
  console.error(message(err))
  process.exitCode = 1
}
