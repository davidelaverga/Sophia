#!/usr/bin/env node
// OPERATOR EVIDENCE CUSTODY (INC04-R07 C4/C5 W1, migration 0114; docs/plans/capacity-exposure-wiring.md): append one
// capacity-exposure record as the migration owner: a scope, a window, an issuer, a binding, a binding revocation, a
// dimension mapping, an attribution or an effect-finality payload. The payload is read from a JSON file the operator
// wrote from evidence kept OUTSIDE the database (named by digest); the database checks every key, grammar, cross-field
// rule and append-time condition, and refuses with a fixed code. It reads no key or credential, calls no provider and
// prints no payload value.
//   node --env-file=<env> scripts/record-capacity-exposure.ts <kind> <payload.json>
//   kind: scope | window | issuer | binding | revoke-binding | mapping | attribution | finality
// Appending is custody of a claim, not telemetry, quota, a mapping's qualification or a clock's: it changes no ledger,
// reservation, claim or admission. Running it against a real deployment is a credentialed configuration effect held by
// the release-trust amendment; W1 exercises it only against disposable databases. Needs SOPHIA_MIGRATION_DATABASE_URL.
import { readFileSync } from 'node:fs'
import type pg from 'pg'
import {
  appendCapacityAttribution,
  appendCapacityFinality,
  bindCapacityObservation,
  CapacityCustodyRefused,
  registerCapacityIssuer,
  registerCapacityMapping,
  registerCapacityScope,
  registerCapacityWindow,
  revokeCapacityBinding,
  type CapacityCustodyReceipt,
} from '../packages/persistence/src/capacity-exposure-custody.ts'
import { withClient } from './lib/postgres.ts'

type Append = (db: pg.Client, payload: never) => Promise<CapacityCustodyReceipt>

/**
 * Each kind's append: a closed Map of exactly eight own keys (W1-F03), so an inherited name (toString, constructor,
 * __proto__, hasOwnProperty) is no kind at all. The payload's fields are the database's to check.
 */
const APPENDS: ReadonlyMap<string, Append> = new Map<string, Append>([
  ['scope', registerCapacityScope],
  ['window', registerCapacityWindow],
  ['issuer', registerCapacityIssuer],
  ['binding', bindCapacityObservation],
  ['revoke-binding', revokeCapacityBinding],
  ['mapping', registerCapacityMapping],
  ['attribution', appendCapacityAttribution],
  ['finality', appendCapacityFinality],
])

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

function usage(): never {
  console.error(
    `usage: node --env-file=<env> scripts/record-capacity-exposure.ts <${[...APPENDS.keys()].join('|')}> <payload.json>`,
  )
  console.error('       (needs SOPHIA_MIGRATION_DATABASE_URL)')
  process.exit(2)
}

/** The file's payload. Only its JSON shape is checked here; every rule is the database's (0114). */
function payloadOf(file: string): never {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('A payload is a JSON object')
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the database validates every field and refuses the rest
  return parsed as never
}

const [kind, file, ...rest] = process.argv.slice(2)
const url = process.env.SOPHIA_MIGRATION_DATABASE_URL?.trim()
// The kind is checked first, before the payload file is read or a database client exists.
const append = kind === undefined ? undefined : APPENDS.get(kind)
if (!url || append === undefined || file === undefined || rest.length > 0) usage()
try {
  const payload = payloadOf(file)
  const r = await withClient(url, (c) => append(c, payload))
  console.log(`✓ ${r.kind} ${r.outcome}${r.replay ? ' (replay: the original receipt)' : ''} at ${r.recordedAt}`)
  if (r.outcome === 'conflict')
    console.log('! a different payload under a recorded key: kept once, sticky and restrictive')
  console.log('! custody of a claim, not live qualification: it changes no ledger and no admission reads it')
} catch (err: unknown) {
  console.error(err instanceof CapacityCustodyRefused ? `refused: ${err.refusal}` : message(err))
  process.exitCode = 1
}
