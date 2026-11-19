#!/usr/bin/env node
// OPERATOR EVIDENCE CUSTODY (INC04-S01b, migration 0104): record, or revoke, an account-scoped qualification of one API
// contribution connection, as the migration owner. It binds the connection's account, its CURRENT credential revision,
// its route, model and effort and the verified operations to evidence the operator keeps OUTSIDE the database, named
// by reference. It reads no key or credential, calls no provider and prints no secret.
//   node --env-file=<env> scripts/qualify-api-account.ts record <connectionId> --evidence <ref> --observed-at <time>
//        --expires-at <time> [--verification operator_verified_call|operator_verified_console]
//   node --env-file=<env> scripts/qualify-api-account.ts revoke <qualificationId> --reason <text>
// Recording is custody of a claim, not qualification by itself: the route's global qualification is still required,
// the record goes stale when the credential is rotated, and only real evidence a qualified operator observed may be
// recorded. Running it against a real deployment is a credentialed configuration effect, held by the release-trust
// amendment; INC04-S01b exercises it only against disposable databases. Needs SOPHIA_MIGRATION_DATABASE_URL.
import { parseArgs } from 'node:util'
import { qualifyApiAccount, revokeApiAccountQualification } from '../packages/persistence/src/api-contributions.ts'
import { withClient } from './lib/postgres.ts'

const VERIFICATIONS = ['operator_verified_call', 'operator_verified_console'] as const
type Verification = (typeof VERIFICATIONS)[number]
const isVerification = (v: string): v is Verification => VERIFICATIONS.some((x) => x === v)

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    evidence: { type: 'string' },
    'observed-at': { type: 'string' },
    'expires-at': { type: 'string' },
    verification: { type: 'string', default: 'operator_verified_call' },
    reason: { type: 'string' },
  },
})
const [command, id] = positionals
const url = process.env.SOPHIA_MIGRATION_DATABASE_URL?.trim()
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

function usage(): never {
  console.error('usage: node --env-file=<env> scripts/qualify-api-account.ts record <connectionId> --evidence <ref>')
  console.error(
    '         --observed-at <RFC 3339> --expires-at <RFC 3339> [--verification ' + VERIFICATIONS.join('|') + ']',
  )
  console.error('       node --env-file=<env> scripts/qualify-api-account.ts revoke <qualificationId> --reason <text>')
  console.error('       (needs SOPHIA_MIGRATION_DATABASE_URL)')
  process.exit(2)
}

async function record(dbUrl: string, connectionId: string): Promise<void> {
  const evidenceRef = values.evidence
  const observedAt = values['observed-at']
  const expiresAt = values['expires-at']
  const verification = values.verification
  if (!evidenceRef || !observedAt || !expiresAt || !isVerification(verification)) usage()
  const q = await withClient(dbUrl, (c) =>
    qualifyApiAccount(c, { connectionId, operations: ['research'], verification, evidenceRef, observedAt, expiresAt }),
  )
  console.log(
    `✓ account qualification ${q.qualificationId} recorded for connection ${q.connectionId} at credential revision ` +
      `${String(q.credentialRevision)}, until ${q.expiresAt}`,
  )
  console.log('! a record, not live access: the route still needs its global qualification, and a rotation stales it')
}

async function revoke(dbUrl: string, qualificationId: string): Promise<void> {
  const reason = values.reason
  if (!reason) usage()
  await withClient(dbUrl, (c) => revokeApiAccountQualification(c, qualificationId, reason))
  console.log(`✓ account qualification ${qualificationId} revoked`)
}

if (!url || !id || positionals.length !== 2 || (command !== 'record' && command !== 'revoke')) usage()
try {
  await (command === 'record' ? record(url, id) : revoke(url, id))
} catch (err: unknown) {
  console.error(message(err))
  process.exitCode = 1
}
