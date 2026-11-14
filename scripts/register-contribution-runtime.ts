#!/usr/bin/env node
// OPERATOR PROVISIONING (INC01-CC-004 S5-a, migration 0094): register an owner's API contribution runtime for one
// project, as the migration owner. It creates the contribution's own dsh executor resource for the connection's
// credential revision, replaces any earlier capability of that resource, and prints the new capability ONCE. Only
// its SHA-256 is stored. The owner's key goes only into that runtime host's environment, under the route's reference
// name (OPENAI_RESEARCH_API_KEY); this script never reads, asks for or prints a key.
//   node --env-file=<env> scripts/register-contribution-runtime.ts <projectId> <connectionId> [--rotate] [--unit <runtimeUnitId>]
// --rotate: the key was replaced. The credential revision advances, and every older runtime of the connection drains:
// it gets no new work and no new paid model call, but may still settle what it already reserved. Its task's queued
// create, resume or steer is denied, not sent; a result it already produced may still publish under the old payer and
// revision (BLOCK_NEW_CALLS_POLICY, printed on rotation).
// S5c: with --binding-dir <dir> --service-origin <url> the capability is not printed. It goes, with the registration's
// identities, into a binding record written exclusively (mode 0600) in that existing private directory, which
// scripts/contribution-runtime-host.mjs reads (lib/contribution-custody.mjs). Only metadata and the record's path are
// printed. The key itself is never handled here: an owner/operator step places it in the custody file the launcher
// derives from this record.
// S5c r2: in that mode the ids (any accepted UUID spelling, stored lowercase), unit, origin and directory are checked
// before any connection. Registration runs inside one transaction, and the record is created and made durable before
// COMMIT, so a refusal or a failed create, write or fsync rolls everything back and removes the record. Outcomes:
// committed (exit 0); definitely rolled back (exit 1: nothing was registered, the earlier runtime and revision are as
// they were); unknown (exit 3: COMMIT was sent but not confirmed). On an unknown outcome the record is KEPT, since it
// may hold the only copy of the current capability, and the ids are printed so an operator can check
// sophia.runtime_instances. Nothing is retried. The capability is never printed in this mode.
// Needs SOPHIA_MIGRATION_DATABASE_URL. Running it against a real deployment is a credentialed configuration effect,
// held by the release-trust amendment; S5-a exercises it only against disposable databases. Registering a runtime is
// not a qualification: the route stays unusable until an operator records one on real evidence.
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  BLOCK_NEW_CALLS_POLICY,
  CONTRIBUTION_ROUTE,
  type ContributionRegistration,
  registerContributionRuntime,
} from '../packages/persistence/src/api-contributions.ts'
import { withClient } from './lib/postgres.ts'

/** What this script uses of lib/contribution-custody.mjs (plain JavaScript, loaded by path). */
interface BindingFields {
  readonly projectId: string
  readonly connectionId: string
  readonly runtimeUnitId: string
  readonly serviceOrigin: string
}
interface CreatedBinding {
  readonly path: string
  discard(): boolean
}
interface Custody {
  bindingFields(input: {
    projectId: string
    connectionId: string
    runtimeUnitId: string
    serviceOrigin: string | undefined
    dir: string
    capability: string
  }): BindingFields
  bindingRecord(
    fields: BindingFields,
    registered: ContributionRegistration,
    capability: string,
  ): Record<string, unknown>
  createBinding(dir: string, record: Record<string, unknown>): CreatedBinding
}
const CUSTODY_MODULE: string = new URL('lib/contribution-custody.mjs', import.meta.url).href
const isCustody = (m: unknown): m is Custody =>
  typeof m === 'object' &&
  m !== null &&
  ['bindingFields', 'bindingRecord', 'createBinding'].every((k) => typeof Reflect.get(m, k) === 'function')
async function loadCustody(): Promise<Custody> {
  const loaded: unknown = await import(CUSTODY_MODULE)
  if (!isCustody(loaded)) throw new Error('lib/contribution-custody.mjs is not the custody module')
  return loaded
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The recorded unit's id and the contributed route, which must be exactly the pinned one; anything else fails closed. */
function recordedUnit(): { id: string; liveVerified: boolean } {
  const unit: unknown = JSON.parse(readFileSync(new URL('../config/runtime-unit.json', import.meta.url), 'utf8'))
  if (!isRecord(unit) || typeof unit.id !== 'string' || !isRecord(unit.model_routes))
    throw new Error('config/runtime-unit.json has no id or model_routes')
  const route = unit.model_routes[CONTRIBUTION_ROUTE.routeId]
  if (!isRecord(route)) throw new Error(`the unit records no route ${CONTRIBUTION_ROUTE.routeId}`)
  const expected: Record<string, string> = {
    provider: CONTRIBUTION_ROUTE.provider,
    model: CONTRIBUTION_ROUTE.model,
    reasoningEffort: CONTRIBUTION_ROUTE.effort,
    credential_ref: CONTRIBUTION_ROUTE.credentialRef,
    baseURL: CONTRIBUTION_ROUTE.baseURL,
  }
  const changed = Object.entries(expected).filter(([k, v]) => route[k] !== v)
  if (changed.length > 0)
    throw new Error(
      `the recorded route differs from the contributed one (${changed.map(([k]) => k).join(', ')}): ` +
        'a new route needs a new migration and qualification',
    )
  return { id: unit.id, liveVerified: route.live_verified === true }
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    rotate: { type: 'boolean', default: false },
    unit: { type: 'string' },
    'binding-dir': { type: 'string' },
    'service-origin': { type: 'string' },
  },
})
const [projectId, connectionId] = positionals
const url = process.env.SOPHIA_MIGRATION_DATABASE_URL?.trim()
const bindingDir = values['binding-dir']
const serviceOrigin = values['service-origin']
if (
  !projectId ||
  !connectionId ||
  !url ||
  positionals.length !== 2 ||
  (bindingDir === undefined) !== (serviceOrigin === undefined)
) {
  console.error(
    'usage: node --env-file=<env> scripts/register-contribution-runtime.ts <projectId> <connectionId> [--rotate] [--unit <id>]',
  )
  console.error('       [--binding-dir <private dir> --service-origin <http(s) origin>] (both or neither)')
  console.error('       (needs SOPHIA_MIGRATION_DATABASE_URL)')
  process.exit(2)
}

type Outcome = 'committed' | 'rolled_back' | 'unknown'
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
/** A server ERROR answering COMMIT: the server rolled the transaction back and the session survives. */
const serverRefused = (err: unknown) =>
  typeof err === 'object' &&
  err !== null &&
  Reflect.get(err, 'severity') === 'ERROR' &&
  typeof Reflect.get(err, 'code') === 'string'

/**
 * A resolved answer to COMMIT, by its command tag only (S5c r3): `COMMIT` is a commit and `ROLLBACK` (an aborted
 * transaction) a definite rollback. Any other tag, a missing tag or another shape proves neither: unknown.
 */
function commitReceipt(done: unknown): Outcome {
  const tag: unknown = typeof done === 'object' && done !== null ? Reflect.get(done, 'command') : undefined
  if (tag === 'COMMIT') return 'committed'
  if (tag === 'ROLLBACK') return 'rolled_back'
  return 'unknown'
}

interface Run {
  outcome: Outcome
  registered?: ContributionRegistration
  created?: CreatedBinding
  cause?: unknown
}

/**
 * Binding mode (S5c r2): BEGIN, register, create the durable record, COMMIT. Before COMMIT is sent any failure is a
 * definite rollback (PostgreSQL commits nothing without it, and a dropped session aborts its transaction). Once it is
 * sent, only the COMMIT tag is a commit, and only a server ERROR or the ROLLBACK tag is a definite rollback; anything
 * else, including another or a missing tag, is unknown (commitReceipt).
 */
async function registerAndRetain(
  dbUrl: string,
  dir: string,
  custody: Custody,
  fields: BindingFields,
  token: string,
): Promise<Run> {
  const run: Run = { outcome: 'rolled_back' }
  try {
    await withClient(dbUrl, async (c) => {
      // A dropped session is classified here; it must never surface as an unhandled client event.
      c.on('error', () => undefined)
      await c.query('BEGIN')
      try {
        run.registered = await registerContributionRuntime(c, {
          projectId: fields.projectId,
          connectionId: fields.connectionId,
          runtimeUnitId: fields.runtimeUnitId,
          tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
          rotate: values.rotate,
        })
        run.created = custody.createBinding(dir, custody.bindingRecord(fields, run.registered, token))
      } catch (err: unknown) {
        run.cause = err
        await c.query('ROLLBACK').catch(() => undefined)
        return
      }
      run.outcome = 'unknown'
      try {
        const done: unknown = await c.query('COMMIT')
        run.outcome = commitReceipt(done)
        if (run.outcome === 'rolled_back') run.cause = new Error('the transaction was rolled back at COMMIT')
        if (run.outcome === 'unknown') run.cause = new Error('COMMIT was answered without a COMMIT or ROLLBACK tag')
      } catch (err: unknown) {
        run.cause = err
        run.outcome = serverRefused(err) ? 'rolled_back' : 'unknown'
      }
    })
  } catch (err: unknown) {
    // Connecting, BEGIN or closing: before COMMIT was sent this is a definite rollback; a known outcome stands.
    run.cause ??= err
  }
  return run
}

/** Report the outcome truthfully. Success only after a known commit; never the capability. */
function report(run: Run, fields: BindingFields, liveVerified: boolean): void {
  const { registered, created } = run
  if (run.outcome === 'committed' && registered && created) {
    console.log(
      `✓ contribution runtime ${registered.runtimeId} registered for unit ${fields.runtimeUnitId}, ` +
        `credential revision ${registered.credentialRevision} (connection ${registered.connectionState})`,
    )
    if (values.rotate) console.log(`! older revisions drain under ${BLOCK_NEW_CALLS_POLICY}`)
    if (!liveVerified)
      console.log(
        `! ${CONTRIBUTION_ROUTE.routeId} is not live-verified: the contribution stays unusable until qualified`,
      )
    // Metadata and the path only: the capability stays in the record.
    console.log(
      `binding record ${created.path} (project ${fields.projectId}, connection ${fields.connectionId}, revision ${registered.credentialRevision})`,
    )
    console.log(
      `the custodian's key for this revision goes in <custody dir>/${fields.connectionId}.r${registered.credentialRevision}.${CONTRIBUTION_ROUTE.routeId}.credential`,
    )
    return
  }
  if (run.outcome === 'unknown' && registered && created) {
    // Kept, never retried: the record may hold the only copy of the current capability.
    console.error(
      `! registration outcome UNKNOWN: COMMIT was sent but not confirmed (${message(run.cause)}); nothing is retried`,
    )
    console.error(
      `! binding record kept at ${created.path}: project ${fields.projectId}, connection ${fields.connectionId}, ` +
        `runtime ${registered.runtimeId}, resource ${registered.resourceId}, revision ${registered.credentialRevision}`,
    )
    console.error(
      `! reconcile: if sophia.runtime_instances has runtime ${registered.runtimeId} active, this record is its binding; ` +
        'if it has no such runtime, nothing was registered and the record authorizes nothing',
    )
    process.exitCode = 3
    return
  }
  // Definitely rolled back: nothing was registered; the earlier runtime, revision and commitments are as they were.
  const removed = created ? created.discard() : true
  console.error(`registration rolled back: nothing was registered (${message(run.cause)})`)
  if (!removed && created)
    console.error(`! a record for the uncommitted runtime may remain at ${created.path}; it authorizes nothing`)
  process.exitCode = 1
}

/** Binding mode: every caller field checked and canonical before any connection, then one transaction. */
async function registerWithBinding(
  dbUrl: string,
  dir: string,
  input: { projectId: string; connectionId: string; runtimeUnitId: string; serviceOrigin: string | undefined },
  liveVerified: boolean,
): Promise<void> {
  const custody = await loadCustody()
  const token = randomBytes(32).toString('base64url')
  const fields = custody.bindingFields({ ...input, dir, capability: token })
  report(await registerAndRetain(dbUrl, dir, custody, fields, token), fields, liveVerified)
}

try {
  const unit = recordedUnit()
  const runtimeUnitId = values.unit ?? unit.id
  if (bindingDir !== undefined) {
    await registerWithBinding(
      url,
      bindingDir,
      { projectId, connectionId, runtimeUnitId, serviceOrigin },
      unit.liveVerified,
    )
  } else {
    const token = randomBytes(32).toString('base64url')
    const registered = await withClient(url, (c) =>
      registerContributionRuntime(c, {
        projectId,
        connectionId,
        runtimeUnitId,
        tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
        rotate: values.rotate,
      }),
    )
    console.log(
      `✓ contribution runtime ${registered.runtimeId} registered for unit ${runtimeUnitId}, ` +
        `credential revision ${registered.credentialRevision} (connection ${registered.connectionState})`,
    )
    if (values.rotate) console.log(`! older revisions drain under ${BLOCK_NEW_CALLS_POLICY}`)
    if (!unit.liveVerified)
      console.log(
        `! ${CONTRIBUTION_ROUTE.routeId} is not live-verified: the contribution stays unusable until qualified`,
      )
    console.log('Capability (shown once; store it as SOPHIA_RUNTIME_TOKEN on the contribution runtime host):')
    console.log(token)
  }
} catch (err: unknown) {
  console.error(message(err))
  process.exitCode = 1
}
