/**
 * The plugin's three routes (WBC-02 G1/G2), as plain handlers over a CoordinationHost. Before any effect each request
 * passes, in order: its body shape; the caller (a board user, and the configured integration principal when one is
 * configured); Sophia's signed envelope for exactly this body, operation, company and time; the configured mapping of
 * the Sophia project to this company and Paperclip project; and its nonce, kept so a replay is refused. A refusal
 * changes nothing. The issue is a core record changed only through the host's issue APIs; the namespace keeps only
 * the commission's binding, the controls, the nonces, the wakeups asked and the status writes until they settle.
 *
 * Creating is serialized per commission key: a namespace row claims the key, the core issue is looked up by its
 * exact origin (`plugin:sophia.coordination:commission`, the key) before anything is created, and a create whose
 * outcome Sophia did not see is answered by the same issue. While another request is creating, the answer is 503:
 * Sophia treats it as unknown and reconciles, never as a refusal.
 * @module @sophia/paperclip-plugin/coordination
 */
import { createPublicKey, randomUUID, type KeyObject } from 'node:crypto'
import {
  EnvelopeError,
  verifyEnvelope,
  type EnvelopeClaims,
  type EnvelopeOp,
  type SignedEnvelope,
} from '@sophia/coordination/envelope'
import {
  COMMISSION_ORIGIN_KIND,
  CONTROL_EFFECT,
  isCommissionRequest,
  isControlRequest,
  isLookupRequest,
  type Commission,
  type CommissionReply,
  type Control,
  type ControlOp,
  type ControlReply,
  type IssueStatus,
  type LookupReply,
} from '@sophia/coordination/plugin-wire'
import { UnansweredHostCall, type ApiRequest, type ApiResponse, type CoordinationHost, type HostIssue } from './host.ts'

/** How long a claimed but unfinished create blocks another (a worker that died mid-create releases it after this). */
const CREATING_STALE_SECONDS = 120

/** One Sophia project's binding to a Paperclip company and project, as the operator configured it. */
export interface ProjectMapping {
  readonly sophiaProjectId: string
  readonly companyId: string
  readonly paperclipProjectId: string
}

export interface CoordinationConfig {
  readonly publicKey: KeyObject
  /** The integration board principal's user id; when set, no other board user may call these routes. */
  readonly integrationUserId: string | null
  readonly projects: readonly ProjectMapping[]
}

class Refusal extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function refuse(status: number, code: string, message: string): never {
  throw new Refusal(status, code, message)
}

/** The operator's configuration, read and checked; a plugin without one refuses everything (nothing is guessed). */
export function readConfig(raw: Readonly<Record<string, unknown>>): CoordinationConfig {
  const pem = raw.signingPublicKey
  if (typeof pem !== 'string' || pem.trim() === '')
    refuse(503, 'not_configured', 'The plugin has no Sophia signing public key')
  const projects = Array.isArray(raw.projects) ? raw.projects.filter(isMapping) : []
  if (projects.length === 0) refuse(503, 'not_configured', 'The plugin maps no Sophia project')
  const user = raw.integrationUserId
  return {
    publicKey: createPublicKey(pem),
    integrationUserId: typeof user === 'string' && user !== '' ? user : null,
    projects,
  }
}

function isMapping(value: unknown): value is ProjectMapping {
  if (typeof value !== 'object' || value === null) return false
  const m: Record<string, unknown> = { ...value }
  return (
    typeof m.sophiaProjectId === 'string' && typeof m.companyId === 'string' && typeof m.paperclipProjectId === 'string'
  )
}

/** What a request names: the envelope must name exactly the same work (and delivery and project, when given). */
interface Binding {
  readonly sophiaProjectId: string
  readonly workId: string
  readonly commissionKey: string
  readonly deliveryKey?: string
  readonly paperclipProjectId?: string
}

/** The envelope and the body it must sign, the operations it may name, and the work the request names. */
interface Signed {
  readonly envelope: SignedEnvelope
  readonly payload: unknown
  readonly ops: ReadonlySet<EnvelopeOp>
  readonly binding: Binding
}

const NOT_PRINCIPAL = 'Only the Sophia integration principal may call this route'

function checkCaller(config: CoordinationConfig, actor: ApiRequest['actor']): void {
  if (actor.actorType !== 'user') refuse(403, 'not_integration_principal', NOT_PRINCIPAL)
  if (config.integrationUserId !== null && (actor.userId ?? actor.actorId) !== config.integrationUserId) {
    refuse(403, 'not_integration_principal', NOT_PRINCIPAL)
  }
}

function verified(config: CoordinationConfig, companyId: string, signed: Signed, now: number): EnvelopeClaims {
  try {
    return verifyEnvelope(signed.envelope, signed.payload, {
      publicKey: config.publicKey,
      companyId,
      ops: signed.ops,
      now,
    })
  } catch (err: unknown) {
    if (err instanceof EnvelopeError)
      refuse(err.code === 'expired' || err.code === 'not_yet_valid' ? 401 : 403, `envelope_${err.code}`, err.message)
    throw err
  }
}

const names = (claims: EnvelopeClaims, b: Binding): boolean =>
  claims.sophiaProjectId === b.sophiaProjectId &&
  claims.workId === b.workId &&
  claims.commissionKey === b.commissionKey &&
  (b.deliveryKey === undefined || claims.deliveryKey === b.deliveryKey) &&
  (b.paperclipProjectId === undefined || claims.paperclipProjectId === b.paperclipProjectId)

/** The caller, the envelope, the mapping and the nonce: everything that must hold before any effect. */
async function admit(host: CoordinationHost, input: ApiRequest, signed: Signed): Promise<EnvelopeClaims> {
  const config = readConfig(await host.config(input.companyId))
  checkCaller(config, input.actor)
  const claims = verified(config, input.companyId, signed, host.now())
  if (!names(claims, signed.binding)) refuse(403, 'envelope_mismatch', 'The envelope names other work than the request')
  const mapped = config.projects.some(
    (m) =>
      m.sophiaProjectId === claims.sophiaProjectId &&
      m.companyId === input.companyId &&
      m.paperclipProjectId === claims.paperclipProjectId,
  )
  if (!mapped) refuse(403, 'not_mapped', 'This Sophia project is not mapped to this company and project')
  const kept = await host.execute(
    `INSERT INTO ${host.namespace}.envelope_nonces (nonce, company_id, delivery_key, expires_at)
     VALUES ($1, $2, $3, to_timestamp($4)) ON CONFLICT (nonce) DO NOTHING`,
    [claims.nonce, input.companyId, claims.deliveryKey, claims.exp],
  )
  if (kept.rowCount === 0) refuse(409, 'replayed', 'This envelope was already used')
  return claims
}

/** The core issue that holds a commission key, found by its exact origin; more than one is a broken invariant. */
async function issueOf(host: CoordinationHost, companyId: string, key: string): Promise<HostIssue | null> {
  const found = await host.issues.list({ companyId, originKind: COMMISSION_ORIGIN_KIND, originId: key, limit: 2 })
  if (found.length > 1) refuse(409, 'ambiguous_commission', 'More than one issue holds this commission key')
  return found[0] ?? null
}

async function bind(
  host: CoordinationHost,
  commission: { key: string; companyId: string; sophiaProjectId: string; paperclipProjectId: string; workId: string },
  issueId: string,
) {
  await host.execute(
    `INSERT INTO ${host.namespace}.commissions (commission_key, company_id, sophia_project_id, paperclip_project_id, work_id, state, issue_id)
     VALUES ($1, $2, $3, $4, $5, 'created', $6)
     ON CONFLICT (commission_key) DO UPDATE SET state = 'created', issue_id = EXCLUDED.issue_id, updated_at = now()`,
    [
      commission.key,
      commission.companyId,
      commission.sophiaProjectId,
      commission.paperclipProjectId,
      commission.workId,
      issueId,
    ],
  )
}

/** Claim the key for this request's create: a new row, or one another create left behind long enough ago. */
async function claim(host: CoordinationHost, companyId: string, c: Commission): Promise<boolean> {
  const fresh = await host.execute(
    `INSERT INTO ${host.namespace}.commissions (commission_key, company_id, sophia_project_id, paperclip_project_id, work_id, state)
     VALUES ($1, $2, $3, $4, $5, 'creating') ON CONFLICT (commission_key) DO NOTHING`,
    [c.key, companyId, c.sophiaProjectId, c.paperclipProjectId, c.workId],
  )
  if (fresh.rowCount === 1) return true
  const stale = await host.execute(
    `UPDATE ${host.namespace}.commissions SET updated_at = now()
      WHERE commission_key = $1 AND state = 'creating' AND updated_at < now() - make_interval(secs => $2)`,
    [c.key, CREATING_STALE_SECONDS],
  )
  return stale.rowCount === 1
}

async function wake(host: CoordinationHost, issue: HostIssue, key: string): Promise<boolean> {
  const woken = await host.issues.requestWakeup(issue.id, issue.companyId, {
    reason: 'sophia:commission',
    contextSource: 'sophia.coordination',
    idempotencyKey: key,
  })
  return woken.queued
}

/** How long an unconfirmed wakeup ask may still be in flight before a resend may ask again. */
const WAKE_STALE_SECONDS = 60

/**
 * One wakeup of the issue for this delivery key, made at most once as far as the plugin can know. The pinned host
 * does not deduplicate a wakeup by its idempotency key and can fail after the wakeup is durable, so the ask is
 * recorded first and a resend reconciles before it asks: see `reask`. A second run would still only attach to Sophia's
 * one attempt; this keeps the host from being asked for one.
 */
async function wakeOnce(host: CoordinationHost, issue: HostIssue, key: string): Promise<boolean> {
  const first = await host.execute(
    `INSERT INTO ${host.namespace}.wakes (wake_key, issue_id) VALUES ($1, $2) ON CONFLICT (wake_key) DO NOTHING`,
    [key, issue.id],
  )
  if (first.rowCount === 0 && !(await reask(host, issue, key))) return false
  if (!(await wake(host, issue, key)))
    // The host queued no run (`{queued: false}`: the agent cannot be woken now, or the wakeup was deferred). Not
    // confirmed and not delivered: the worker asks again, and a run since the first ask confirms it then.
    refuse(503, 'wake_not_queued', 'Paperclip queued no run of the source reviewer for this wakeup; ask again later')
  await confirmWake(host, key)
  return true
}

async function confirmWake(host: CoordinationHost, key: string) {
  await host.execute(
    `UPDATE ${host.namespace}.wakes SET confirmed_at = now() WHERE wake_key = $1 AND confirmed_at IS NULL`,
    [key],
  )
}

/**
 * Whether a resend asks again for a wakeup asked before and not confirmed. A run of the issue since the first ask
 * means the host took it (its reply was lost, or its activity log failed after it): confirmed, not asked again. An
 * ask that may still be in flight is waited for (503). A stale ask with no run since is claimed by one resend.
 */
async function reask(host: CoordinationHost, issue: HostIssue, key: string): Promise<boolean> {
  const rows = await host.query<{ confirmed: boolean; ran: boolean; stale: boolean; asked: string }>(
    `SELECT w.confirmed_at IS NOT NULL AS confirmed, w.asked_at::text AS asked,
            w.asked_at < now() - make_interval(secs => $3) AS stale,
            EXISTS (SELECT 1 FROM public.heartbeat_runs r
                     WHERE r.company_id::text = $2 AND r.context_snapshot->>'issueId' = w.issue_id::text
                       AND r.created_at >= w.first_asked_at) AS ran
       FROM ${host.namespace}.wakes w WHERE w.wake_key = $1`,
    [key, issue.companyId, WAKE_STALE_SECONDS],
  )
  const asked = rows[0]
  if (asked === undefined || asked.confirmed) return false
  if (asked.ran) {
    await confirmWake(host, key)
    return false
  }
  const claimed = asked.stale
    ? await host.execute(
        `UPDATE ${host.namespace}.wakes SET asked_at = now()
          WHERE wake_key = $1 AND confirmed_at IS NULL AND asked_at::text = $2`,
        [key, asked.asked],
      )
    : { rowCount: 0 }
  if (claimed.rowCount === 0)
    refuse(503, 'wake_in_progress', 'A wakeup of this issue was asked and may still be in flight; ask again later')
  return true
}

/** The commission's wakeup, while the issue is still in the status the commission set (a Hold since is not undone). */
async function wakeCommission(host: CoordinationHost, c: Commission, issue: HostIssue): Promise<boolean> {
  if (!c.wake || c.initialStatus !== 'todo' || issue.status !== 'todo') return false
  return wakeOnce(host, issue, c.key)
}

export async function handleCommission(host: CoordinationHost, input: ApiRequest): Promise<CommissionReply> {
  const body = input.body
  if (!isCommissionRequest(body)) refuse(422, 'invalid_request', 'Not a commission request')
  const { commission: c, envelope } = body
  await admit(host, input, {
    envelope,
    payload: c,
    ops: new Set(['commission']),
    binding: {
      sophiaProjectId: c.sophiaProjectId,
      workId: c.workId,
      commissionKey: c.key,
      paperclipProjectId: c.paperclipProjectId,
    },
  })
  const bound = { ...c, companyId: input.companyId }
  const existing = await issueOf(host, input.companyId, c.key)
  if (existing !== null) {
    await bind(host, bound, existing.id)
    const queued = await wakeCommission(host, c, existing)
    return { outcome: 'existing', issueId: existing.id, status: existing.status, wakeQueued: queued }
  }
  const agent = await host.reviewerAgent(input.companyId)
  if (agent === null) refuse(409, 'reviewer_missing', 'The source-reviewer agent is not provisioned in this company')
  if (!(await claim(host, input.companyId, c)))
    refuse(503, 'commission_in_progress', 'Another request is creating this commission; reconcile by its key')
  const issue = await host.issues.create({
    companyId: input.companyId,
    projectId: c.paperclipProjectId,
    title: c.title,
    description: c.description,
    status: c.initialStatus,
    priority: 'medium',
    assigneeAgentId: agent,
    originKind: COMMISSION_ORIGIN_KIND,
    originId: c.key,
    billingCode: `sophia:${c.workId}`,
  })
  await bind(host, bound, issue.id)
  const queued = await wakeCommission(host, c, issue)
  return { outcome: 'created', issueId: issue.id, status: issue.status, wakeQueued: queued }
}

export async function handleLookup(host: CoordinationHost, input: ApiRequest): Promise<LookupReply> {
  const body = input.body
  if (!isLookupRequest(body)) refuse(422, 'invalid_request', 'Not a lookup request')
  const { lookup, envelope } = body
  await admit(host, input, {
    envelope,
    payload: lookup,
    ops: new Set(['lookup']),
    binding: { sophiaProjectId: lookup.sophiaProjectId, workId: lookup.workId, commissionKey: lookup.key },
  })
  const issue = await issueOf(host, input.companyId, lookup.key)
  if (issue !== null) return { outcome: 'found', issueId: issue.id, status: issue.status }
  // A create still in flight could yet produce the issue: that is not proof of absence.
  const rows = await host.query<{ creating: boolean }>(
    `SELECT state = 'creating' AND updated_at >= now() - make_interval(secs => $2) AS creating
       FROM ${host.namespace}.commissions WHERE commission_key = $1`,
    [lookup.key, CREATING_STALE_SECONDS],
  )
  if (rows[0]?.creating === true)
    refuse(503, 'commission_in_progress', 'A create of this commission may still be in flight')
  return { outcome: 'absent' }
}

export async function handleControl(host: CoordinationHost, input: ApiRequest): Promise<ControlReply> {
  const body = input.body
  if (!isControlRequest(body)) refuse(422, 'invalid_request', 'Not a control request')
  const { control, envelope } = body
  const target = await host.issues.get(input.params.issueId ?? '', input.companyId)
  if (target === null || target.originKind !== COMMISSION_ORIGIN_KIND || target.originId !== control.commissionKey) {
    refuse(403, 'wrong_issue', 'This issue does not hold the commission the control names')
  }
  const claims = await admit(host, input, {
    envelope,
    payload: control,
    ops: new Set([control.op]),
    binding: {
      sophiaProjectId: control.sophiaProjectId,
      workId: control.workId,
      commissionKey: control.commissionKey,
      deliveryKey: control.key,
    },
  })
  // The binding normally exists from the commission; a namespace that lost it is re-bound from the issue itself.
  await host.execute(
    `INSERT INTO ${host.namespace}.commissions (commission_key, company_id, sophia_project_id, paperclip_project_id, work_id, state, issue_id)
     VALUES ($1, $2, $3, $4, $5, 'created', $6) ON CONFLICT (commission_key) DO NOTHING`,
    [
      control.commissionKey,
      input.companyId,
      control.sophiaProjectId,
      claims.paperclipProjectId,
      control.workId,
      target.id,
    ],
  )
  const recorded = await recordControl(host, control, target.id)
  if (recorded.state === 'applied') {
    const settled = await confirmSettled(host, {
      commissionKey: control.commissionKey,
      issueId: target.id,
      companyId: input.companyId,
    })
    return { outcome: 'already', issueId: target.id, status: settled ?? target.status, wakeQueued: false }
  }
  return applyControl(host, { companyId: input.companyId, issue: target, control, seq: recorded.seq })
}

interface Pending {
  readonly companyId: string
  readonly issue: HostIssue
  readonly control: Control
  readonly seq: string
}

/** The issue of one commission, as its writes and settlements name it. */
interface Subject {
  readonly commissionKey: string
  readonly issueId: string
  readonly companyId: string
}

const subjectOf = (p: Pending): Subject => ({
  commissionKey: p.control.commissionKey,
  issueId: p.issue.id,
  companyId: p.companyId,
})

/**
 * A pending control's effect, under its commission's effect lease, so one delivery at a time changes the issue: a
 * delivery whose host call is still in flight holds it, and a resend or a later control waits (503 while it is held).
 * Every effect ends with a settlement, whether it returned or failed (`settleAfter`): a host call can land after its
 * lease ran out, or fail after its write was durable, so no delivery is answered done while a write of its commission
 * is unsettled (503 `effect_unsettled`, which the worker asks again).
 */
async function applyControl(host: CoordinationHost, p: Pending): Promise<ControlReply> {
  const s = subjectOf(p)
  const token = randomUUID()
  if (!(await takeLease(host, s.commissionKey, token)))
    refuse(503, 'control_in_progress', 'Another delivery is changing this issue; ask again later')
  let result: Settled | null = null
  try {
    const reply = await effectOf(host, p, token)
    result = await settleAfter(host, s, token)
    if (!result.settled) refuse(503, 'effect_unsettled', UNSETTLED_MESSAGE)
    return { ...reply, status: result.status ?? reply.status }
  } finally {
    // The effect failed (its write may still have landed): settle what it may have written before the error is sent.
    if (result === null) await settleAfter(host, s, token)
    await releaseLease(host, s.commissionKey, token)
  }
}

async function effectOf(host: CoordinationHost, p: Pending, token: string): Promise<ControlReply> {
  if (await superseded(host, p.control.commissionKey, p.seq)) {
    await markApplied(host, p.control.key)
    return { outcome: 'already', issueId: p.issue.id, status: p.issue.status, wakeQueued: false }
  }
  const effect = CONTROL_EFFECT[p.control.op]
  const current = (await host.issues.get(p.issue.id, p.companyId)) ?? p.issue
  const updated =
    current.status === effect.status ? current : await writeStatus(host, subjectOf(p), token, effect.status)
  const queued = effect.wake ? await wakeOnce(host, updated, p.control.key) : false
  await markApplied(host, p.control.key)
  return { outcome: 'applied', issueId: updated.id, status: updated.status, wakeQueued: queued }
}

const UNSETTLED_MESSAGE = 'A status write of this issue is not settled yet; ask again later'

/**
 * A delivery answered from its record ('already') is confirmed only once every write of its commission is settled:
 * an open one is settled first, under the lease.
 */
async function confirmSettled(host: CoordinationHost, s: Subject): Promise<string | null> {
  const open = await host.query<{ open: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM ${host.namespace}.effects WHERE commission_key = $1 AND settled_at IS NULL) AS open`,
    [s.commissionKey],
  )
  if (open[0]?.open !== true) return null
  const result = await settleLeased(host, s, LEASE_WAIT_MS)
  if (result === null) refuse(503, 'control_in_progress', 'Another delivery is changing this issue; ask again later')
  if (!result.settled) refuse(503, 'effect_unsettled', UNSETTLED_MESSAGE)
  return result.status
}

/**
 * How long one delivery holds its commission's effect lease before another may take it over: twice the pinned
 * worker's 30 s timeout for one host call (worker-rpc-host.ts, DEFAULT_RPC_TIMEOUT_MS), renewed before each write.
 */
const EFFECT_LEASE_SECONDS = 60
/** How long a delivery waits for the lease before it answers 503 (the worker asks again). */
const LEASE_WAIT_MS = 2000
const LEASE_POLL_MS = 100

async function takeLease(
  host: CoordinationHost,
  commissionKey: string,
  token: string,
  waitMs = LEASE_WAIT_MS,
): Promise<boolean> {
  const deadline = Date.now() + waitMs
  for (;;) {
    const taken = await host.execute(
      `UPDATE ${host.namespace}.commissions SET effect_holder = $2, effect_until = now() + make_interval(secs => $3)
        WHERE commission_key = $1 AND (effect_holder IS NULL OR effect_until < now())`,
      [commissionKey, token, EFFECT_LEASE_SECONDS],
    )
    if (taken.rowCount === 1) return true
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, LEASE_POLL_MS))
  }
}

/** Renews this delivery's lease if it still holds it (nobody took it over); false once another delivery has. */
async function renewLease(host: CoordinationHost, commissionKey: string, token: string): Promise<boolean> {
  const kept = await host.execute(
    `UPDATE ${host.namespace}.commissions SET effect_until = now() + make_interval(secs => $3)
      WHERE commission_key = $1 AND effect_holder = $2`,
    [commissionKey, token, EFFECT_LEASE_SECONDS],
  )
  return kept.rowCount === 1
}

async function releaseLease(host: CoordinationHost, commissionKey: string, token: string) {
  await host.execute(
    `UPDATE ${host.namespace}.commissions SET effect_holder = NULL, effect_until = NULL
      WHERE commission_key = $1 AND effect_holder = $2`,
    [commissionKey, token],
  )
}

/**
 * One status write, made only while this delivery holds the lease (renewed first) and recorded before it is asked,
 * with the host process that serves it (`host.hostProcess`). It ends when the host answers, with the issue or with an
 * error: the host answers only once it finished with the call, whatever it wrote. A call the host never answered
 * (UnansweredHostCall) may still land, however late: it stays unended. Until a settlement reads the issue after it
 * ended, the write is open. A delivery that lost the lease writes nothing (503).
 */
async function writeStatus(host: CoordinationHost, s: Subject, token: string, status: IssueStatus): Promise<HostIssue> {
  if (!(await renewLease(host, s.commissionKey, token)))
    refuse(503, 'control_in_progress', 'Another delivery took over this issue; ask again later')
  const id = randomUUID()
  await host.execute(
    `INSERT INTO ${host.namespace}.effects (effect_id, commission_key, status, host_namespace, host_process)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, s.commissionKey, status, host.hostProcess?.namespace ?? null, host.hostProcess?.process ?? null],
  )
  let updated: HostIssue
  try {
    updated = await host.issues.update(s.issueId, { status }, s.companyId)
  } catch (err: unknown) {
    if (!(err instanceof UnansweredHostCall)) await endWrite(host, id)
    throw err
  }
  await endWrite(host, id)
  return updated
}

async function endWrite(host: CoordinationHost, id: string) {
  await host.execute(`UPDATE ${host.namespace}.effects SET ended_at = now() WHERE effect_id = $1`, [id])
}

/** The reads and writes one settlement makes at most; what is left stays open for the next one. */
const SETTLE_ROUNDS = 3

interface Settled {
  /** Every open write is finished and was read after, or cannot change the status the latest control wants. */
  readonly settled: boolean
  /** The issue's status as the settlement last read it (null when it read none). */
  readonly status: string | null
}

const UNSETTLED: Settled = { settled: false, status: null }

/**
 * Settles the open writes of a commission, under its lease. The status Sophia wants is the one of the latest control
 * the plugin received (Sophia sends the next only once this one is answered). If the issue shows a status one of the
 * open writes may have made, and not the wanted one, a stale write landed after a later control: the wanted status is
 * written again (itself an open write, settled in the next round). Any other status, the host's own included, is left
 * alone. The writes that finished before the issue was read are then settled.
 *
 * A write is finished when the host answered it, or once it is fenced (`fenceGoneHosts`, or an operator's fence): a
 * process that is gone can no longer commit, so whatever it wrote is in the issue before this settlement reads it.
 * Time alone, or another process serving now, never finishes a write. An unfinished write stays open, so every later
 * settlement (each delivery's, and the settle job's every minute) still restores the wanted status if it lands.
 */
async function settle(host: CoordinationHost, s: Subject, token: string): Promise<Settled> {
  let status: string | null = null
  await fenceGoneHosts(host, s.commissionKey)
  for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
    const open = await host.query<{ status: string; finished: boolean; at: string }>(
      `SELECT status, now()::text AS at, ended_at IS NOT NULL OR fenced_at IS NOT NULL AS finished
         FROM ${host.namespace}.effects WHERE commission_key = $1 AND settled_at IS NULL`,
      [s.commissionKey],
    )
    const at = open[0]?.at
    if (at === undefined) return { settled: true, status }
    const want = await wantedStatus(host, s.commissionKey)
    status = (await host.issues.get(s.issueId, s.companyId))?.status ?? null
    if (want !== null && status !== null && status !== want && open.some((e) => e.status === status)) {
      status = (await writeStatus(host, s, token, want)).status
      continue
    }
    await host.execute(
      `UPDATE ${host.namespace}.effects SET settled_at = now()
        WHERE commission_key = $1 AND settled_at IS NULL
          AND (ended_at <= $2::timestamptz OR fenced_at <= $2::timestamptz)`,
      [s.commissionKey, at],
    )
    return { settled: open.every((e) => e.finished || e.status === want), status }
  }
  return { settled: false, status }
}

/**
 * Fences the unanswered writes whose host process is verifiably gone: recorded in this worker's own process namespace,
 * by a process other than the one serving now, and seen gone (`host.processGone`). A write recorded in another
 * namespace (another machine or container), or where the namespace is unknown, is left open: there it cannot be seen
 * whether its process still runs, and only an operator who verified that the previous instance stopped fences it.
 */
async function fenceGoneHosts(host: CoordinationHost, commissionKey: string) {
  const here = host.hostProcess
  if (here === null) return
  const rows = await host.query<{ effect_id: string; host_process: string }>(
    `SELECT effect_id, host_process FROM ${host.namespace}.effects
      WHERE commission_key = $1 AND settled_at IS NULL AND ended_at IS NULL AND fenced_at IS NULL
        AND host_namespace = $2 AND host_process IS NOT NULL AND host_process <> $3`,
    [commissionKey, here.namespace, here.process],
  )
  for (const row of rows) {
    if (!host.processGone(row.host_process)) continue
    await host.execute(
      `UPDATE ${host.namespace}.effects SET fenced_at = now(), fence = $2 WHERE effect_id = $1 AND fenced_at IS NULL`,
      [row.effect_id, `host process ${row.host_process} gone, seen by ${here.process}`],
    )
  }
}

async function wantedStatus(host: CoordinationHost, commissionKey: string): Promise<IssueStatus | null> {
  const rows = await host.query<{ op: ControlOp }>(
    `SELECT op FROM ${host.namespace}.controls WHERE commission_key = $1 ORDER BY seq DESC LIMIT 1`,
    [commissionKey],
  )
  const latest = rows[0]
  return latest === undefined ? null : CONTROL_EFFECT[latest.op].status
}

/** A settlement under a lease taken for it; null when another delivery holds the lease (it settles before it answers). */
async function settleLeased(host: CoordinationHost, s: Subject, waitMs: number): Promise<Settled | null> {
  const token = randomUUID()
  if (!(await takeLease(host, s.commissionKey, token, waitMs))) return null
  try {
    return await settle(host, s, token)
  } finally {
    await releaseLease(host, s.commissionKey, token)
  }
}

/**
 * The settlement a control effect ends with, whether it returned or failed: under this delivery's lease while it still
 * holds it, else under the lease taken again. It never fails the delivery itself: a settlement that cannot take the
 * lease, or whose own calls fail, leaves the writes open for the next delivery of the commission or the settle job.
 */
async function settleAfter(host: CoordinationHost, s: Subject, token: string): Promise<Settled> {
  try {
    if (await renewLease(host, s.commissionKey, token)) return await settle(host, s, token)
    return (await settleLeased(host, s, LEASE_WAIT_MS)) ?? UNSETTLED
  } catch {
    return UNSETTLED
  }
}

/**
 * The plugin's settle job (manifest `jobs`, every minute): every commission with an open write is settled under its
 * lease, so a write whose settlement failed or never ran (its worker died) is settled without waiting for Sophia's
 * next delivery. A commission whose lease is held is left to its holder. Returns how many commissions it settled.
 */
export async function settleOpenWrites(host: CoordinationHost): Promise<number> {
  const rows = await host.query<{ commission_key: string; company_id: string; issue_id: string }>(
    `SELECT DISTINCT c.commission_key, c.company_id, c.issue_id::text AS issue_id
       FROM ${host.namespace}.effects e JOIN ${host.namespace}.commissions c ON c.commission_key = e.commission_key
      WHERE e.settled_at IS NULL AND c.issue_id IS NOT NULL`,
    [],
  )
  let settled = 0
  for (const row of rows) {
    const s = { commissionKey: row.commission_key, issueId: row.issue_id, companyId: row.company_id }
    const result = await settleLeased(host, s, 0).catch(() => null)
    if (result?.settled === true) settled += 1
  }
  return settled
}

/**
 * The control's row, recorded 'pending' on first delivery. A resend finds the row as it stands: 'applied' only once
 * its effect was confirmed, so a failure or a crash between the record and the effect leaves it pending and the resend
 * applies it again. A key resent with another operation is refused. (The host's ctx.db.query is SELECT-only and its
 * ctx.db.execute returns a row count only, so the record and its read are two statements.)
 */
async function recordControl(host: CoordinationHost, control: Control, issueId: string) {
  await host.execute(
    `INSERT INTO ${host.namespace}.controls (delivery_key, commission_key, issue_id, op) VALUES ($1, $2, $3, $4)
     ON CONFLICT (delivery_key) DO NOTHING`,
    [control.key, control.commissionKey, issueId, control.op],
  )
  const rows = await host.query<{ state: string; seq: string; op: string }>(
    `SELECT state, seq::text AS seq, op FROM ${host.namespace}.controls WHERE delivery_key = $1`,
    [control.key],
  )
  const row = rows[0]
  if (row?.op !== control.op) refuse(409, 'key_reused', 'This delivery key was recorded for another operation')
  return row
}

/** Whether a later control of the same commission already took effect: an older pending one must not undo it. */
async function superseded(host: CoordinationHost, commissionKey: string, seq: string): Promise<boolean> {
  const rows = await host.query<{ later: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM ${host.namespace}.controls
                     WHERE commission_key = $1 AND seq > $2::bigint AND state = 'applied') AS later`,
    [commissionKey, seq],
  )
  return rows[0]?.later === true
}

async function markApplied(host: CoordinationHost, key: string) {
  await host.execute(
    `UPDATE ${host.namespace}.controls SET state = 'applied', applied_at = now() WHERE delivery_key = $1 AND state = 'pending'`,
    [key],
  )
}

const HANDLERS: Readonly<Record<string, (host: CoordinationHost, input: ApiRequest) => Promise<unknown>>> = {
  commission: handleCommission,
  lookup: handleLookup,
  control: handleControl,
}

/** The plugin's onApiRequest: a handler's reply, or its refusal as `{error: {code, message}}` with its status. */
export async function handleApiRequest(host: CoordinationHost, input: ApiRequest): Promise<ApiResponse> {
  const handler = HANDLERS[input.routeKey]
  if (!handler) return { status: 404, body: { error: { code: 'unknown_route', message: 'No such route' } } }
  try {
    return { status: 200, body: await handler(host, input) }
  } catch (err: unknown) {
    if (err instanceof Refusal) return { status: err.status, body: { error: { code: err.code, message: err.message } } }
    throw err
  }
}
