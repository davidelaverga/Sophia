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

// A JSON number crosses to the database as a JS number (the persistence wrapper re-serializes the reading), so a file's
// number must already BE that number: 9007199254740993 parses to …992, 1.00000000000000001 to 1 and 1e-999 to 0, and
// each would reach SQL as a different, valid-looking value. Every numeric token is therefore checked against its own
// lexeme (Node 24's reviver context.source) before any database is contacted, and refused, never rounded, unless its
// decimal value is exactly the number's. Nothing here echoes a token: the errors are fixed.
const INEXACT = "A reading's numbers must be finite and keep their written value"
/** Integral fields that must be exact safe integers, with their least value. */
const INTEGRAL = [
  ['sourceSequence', 0],
  ['credentialRevision', 1],
  ['accountQualificationRevision', 1],
] as const
/** A JSON number, or a JS number's JSON text: sign, integer digits, fraction digits, exponent. */
const NUMBER_TEXT = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?)(\d+))?$/u
/** Longer exponents cannot belong to a finite nonzero double whatever the digits (a file is far shorter than 1e15). */
const MAX_EXPONENT_DIGITS = 15

/**
 * A decimal value in one form per value: its significant digits (no leading or trailing zeros) and the exponent of the
 * first, signed; zero is "0" whatever its sign or spelling. So 1, 1.0, 10e-1 and 1e0 are equal and 1.1 is not 1. Bounded:
 * one regular scan and Number arithmetic on lengths and an exponent of at most 15 digits. undefined: no such value.
 */
function decimalOf(text: string): string | undefined {
  const m = NUMBER_TEXT.exec(text)
  if (!m) return undefined
  const [, sign = '', int = '', frac = '', expSign = '', expDigits = '0'] = m
  const digits = int + frac
  const lead = digits.search(/[1-9]/u)
  if (lead < 0) return '0'
  const exponentText = expDigits.replace(/^0+(?=\d)/u, '')
  if (exponentText.length > MAX_EXPONENT_DIGITS) return undefined
  const exponent = (expSign === '-' ? -1 : 1) * Number(exponentText) + int.length - 1 - lead
  return `${sign}${digits.slice(lead).replace(/0+$/u, '')}e${String(exponent)}`
}

/**
 * Whether a number's own JSON (what crosses to SQL) has exactly its lexeme's decimal value: 0.1 and 1e-1 cross as 0.1,
 * while 1.00000000000000001 would cross as 1. Equality is by value, never by spelling.
 */
function exact(value: number, source: string | undefined): boolean {
  if (!Number.isFinite(value) || source === undefined) return false
  const lexeme = decimalOf(source)
  return lexeme !== undefined && lexeme === decimalOf(JSON.stringify(value))
}

/** Node 24 passes the primitive's source text; the ES2024 lib does not yet declare the third argument. */
interface ParseContext {
  readonly source?: string
}

function parseExact(text: string): unknown {
  try {
    return JSON.parse(text, (_key: string, value: unknown, context?: ParseContext): unknown => {
      if (typeof value === 'number' && !exact(value, context?.source)) throw new Error(INEXACT)
      return value
    })
  } catch (err: unknown) {
    // A syntax error's message quotes the file: it is neither printed nor kept as a cause.
    // oxlint-disable-next-line eslint/preserve-caught-error -- the cause would carry raw evidence
    if (err instanceof SyntaxError) throw new Error('A reading file is JSON')
    throw err
  }
}

/**
 * The file's reading. Its JSON shape and the exactness of its numbers are checked here, with the three integral fields'
 * safe range; every other rule is the database's (0107).
 */
function readingOf(file: string): CapacityObservationInput {
  const parsed = parseExact(readFileSync(file, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('A reading is a JSON object')
  const fields = new Map<string, unknown>(Object.entries(parsed))
  for (const [field, least] of INTEGRAL) {
    const v = fields.get(field)
    if (typeof v === 'number' && (!Number.isSafeInteger(v) || v < least))
      throw new Error(`A reading's ${field} must be a safe integer of at least ${String(least)}`)
  }
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
