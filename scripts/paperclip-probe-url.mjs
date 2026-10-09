// WBC-02 (WBC-02-CX-0031, CX-0032): the service probe's --url mode. It drives a Paperclip server that is already
// running, at a loopback origin only (a disposable container whose port is published on 127.0.0.1), in three phases:
//   --phase first      health, the host-name guard, the first admin, the plugin installed from its path in the image
//                      and configured, a signed commission (and its resend: the same issue), a signed Stop (and its
//                      resend: already applied), a scheduled run of the settle job, the lookup, the config's digest;
//   --phase restart    after the same container was restarted (sign-up still open): the plugin ready again, the config
//                      unchanged, the same issue found and still cancelled, the commission's resend answered by the same
//                      issue, the host-name guard (review of 9ee7754);
//   --phase restarted  after the container was recreated (sign-up closed) on the same database and home: the same,
//                      and sign-up refused.
// It starts no process, opens no database and reads no /proc: the container's memory is the caller's to measure, from
// its cgroup. Between phases it keeps its state (the synthetic board key and Sophia key among it) in --state, which
// the caller keeps private and never uploads; the result it writes (--out) holds no credential. Every credential the
// probe makes or is given (passwords, session cookies, the board key) it appends to --secrets, one a line, and masks in
// a GitHub Actions log, so the evidence scrub can remove them wherever the server logged them (review of 215b276). Sophia's address in
// the container is closed, so this qualifies the installed plugin and the container, not a native dispatch.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { flowFor, loopbackOrigin, newIdentity, PLUGIN_READY_MS, REQUEST_TIMEOUT_MS, SETTLE_RUN_MS, until } from './paperclip-probe-flow.mjs'

const STATE_SCHEMA = 'sophia.paperclip-probe-state.v1'

/**
 * What each phase may take, from the limits its steps run under: besides the health wait (--wait-ms), each other bounded
 * wait (the plugin ready; a scheduled settle run) and each single request, at REQUEST_TIMEOUT_MS. A wait polls; a
 * request is one exchange. The unit tests count both against a stand-in server, phase by phase.
 */
export const PHASE_LIMITS = Object.freeze({
  first: Object.freeze({ waits: [PLUGIN_READY_MS, SETTLE_RUN_MS], requests: 16 }),
  restart: Object.freeze({ waits: [PLUGIN_READY_MS], requests: 5 }),
  restarted: Object.freeze({ waits: [PLUGIN_READY_MS], requests: 6 }),
})
/** What no limit bounds (signing, the state and result files, the event loop), left over above the limits. */
export const DEADLINE_SLACK_MS = 30_000

/**
 * The shortest deadline a phase may run under: the sum of every limit it permits, and the slack. A shorter one could
 * end a probe that is slow but within each of its limits, and is refused (Codex review of 63a929a).
 */
export function minimumDeadlineMs(phase, waitMs) {
  const { waits, requests } = PHASE_LIMITS[phase]
  return waitMs + waits.reduce((sum, ms) => sum + ms, 0) + requests * REQUEST_TIMEOUT_MS + DEADLINE_SLACK_MS
}

/**
 * Where the probe's credentials go: each, once, a line of `path` (created mode 600), and in a GitHub Actions job a mask
 * for its log. The file stays with the caller and is read by the evidence scrub (scripts/paperclip-image-redact.mjs).
 */
export function secretSink(path, { env = process.env, log = console.log } = {}) {
  const known = new Set()
  return (value) => {
    if (typeof value !== 'string' || value.length === 0 || known.has(value)) return
    known.add(value)
    if (env.GITHUB_ACTIONS === 'true') log(`::add-mask::${value}`)
    appendFileSync(path, `${value}\n`, { mode: 0o600 })
  }
}

export async function runUrl(values) {
  const target = loopbackOrigin(values.url ?? '')
  const phase = values.phase
  if (!['first', 'restart', 'restarted'].includes(phase)) throw new Error('--phase must be first, restart or restarted')
  if (!values.state) throw new Error('--state <file> is required')
  if (!values.secrets) throw new Error('--secrets <file> is required: the evidence scrub removes what it lists')
  const onSecret = secretSink(values.secrets)
  const waitMs = Number(values['wait-ms'] ?? 300_000)
  if (!Number.isSafeInteger(waitMs) || waitMs <= 0) throw new Error('--wait-ms must be a positive whole number of milliseconds')
  const minimum = minimumDeadlineMs(phase, waitMs)
  const deadlineMs = Number(values['deadline-ms'] ?? minimum)
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < minimum)
    throw new Error(`--deadline-ms must cover what the ${phase} phase permits: at least ${minimum} ms with --wait-ms ${waitMs}`)
  const result = { schema: 'sophia.paperclip-probe-result.v1', phase, origin: target.origin, steps: [], outcome: 'running' }
  const write = () =>
    values.out ? writeFileSync(values.out, `${JSON.stringify(result, null, 2)}\n`) : console.log(JSON.stringify(result, null, 2))
  const deadline = setTimeout(() => {
    result.outcome = 'failed'
    result.error = `the phase exceeded its deadline (${deadlineMs / 1000} s)`
    write()
    process.exit(2)
  }, deadlineMs)
  /** One step, timed; `record` says what the result keeps of its value (never a credential). */
  const step = async (name, act, record = () => undefined) => {
    const started = Date.now()
    try {
      const value = await act()
      const detail = record(value)
      result.steps.push({ step: name, ok: true, ms: Date.now() - started, ...(detail === undefined ? {} : { detail }) })
      return value
    } catch (error) {
      result.steps.push({ step: name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error).slice(0, 400) })
      throw error
    }
  }
  try {
    const pluginPath = values['plugin-path'] ?? '/opt/sophia/sophia-coordination-plugin'
    if (phase === 'first') await first({ ...target, pluginPath, onSecret }, values.state, waitMs, step)
    else await restarted({ ...target, pluginPath, onSecret }, values.state, waitMs, step, { signUpClosed: phase === 'restarted' })
    result.outcome = 'passed'
  } catch {
    result.outcome = 'failed'
    process.exitCode = 1
  } finally {
    clearTimeout(deadline)
    write()
  }
}

// Each step records what it observed (statuses, outcomes, identifiers, digests), never a constant: the receipt
// (scripts/paperclip-image-receipt.mjs) validates these facts itself, and across the two phases (WBC-02-CX-0036).
const seen = (facts) => facts

async function first(target, statePath, waitMs, step) {
  const flow = flowFor(target, newIdentity())
  await step('health', () => until('the server to report ready', flow.health, waitMs), (h) => ({ httpStatus: h.httpStatus, status: h.status }))
  await step('host-name guard', () => flow.hostGuard(), seen)
  const op = await step('first admin and board key', () => flow.bootstrap(), (o) => ({
    ...o.statuses,
    boardKeyMinted: typeof o.token === 'string' && o.token.length > 0,
  }))
  const ids = await step('plugin installed and configured', () => flow.plugin(op), (i) => ({ pluginId: i.pluginId, ...i.observed }))
  const { issueId } = await step(
    'signed commission and its resend',
    async () => {
      const sent = await flow.commission(op, ids)
      const again = (await sent.resend()).json
      const facts = { issueId: sent.reply.issueId, first: sent.reply.outcome, resend: again?.outcome, resendIssueId: again?.issueId }
      assert.equal(facts.first, 'created')
      assert.deepEqual([facts.resend, facts.resendIssueId], ['existing', facts.issueId], 'the resend answers with the same issue')
      return facts
    },
    seen,
  )
  await step(
    'signed Stop and its resend',
    async () => {
      const { first: applied, again } = await flow.stop(op, ids, issueId)
      const facts = { issueId: applied.issueId, first: applied.outcome, firstStatus: applied.status, resend: again.outcome, status: again.status }
      assert.deepEqual([facts.first, facts.firstStatus, facts.resend, facts.status], ['applied', 'cancelled', 'already', 'cancelled'])
      return facts
    },
    seen,
  )
  await step('scheduled settle job', () => flow.scheduledJob(op, ids.pluginId), (run) => ({ runId: run.id, status: run.status }))
  await step(
    'lookup',
    async () => {
      const found = await flow.lookup(op, ids)
      assert.deepEqual([found.outcome, found.issueId, found.status], ['found', issueId, 'cancelled'])
      return { outcome: found.outcome, issueId: found.issueId, status: found.status }
    },
    seen,
  )
  const configDigest = await step('config digest', () => flow.configDigest(op, ids), (digest) => ({ sha256: digest }))
  const state = { schema: STATE_SCHEMA, origin: target.origin, identity: flow.identity, op: { userId: op.userId, token: op.token }, ids, issueId, configDigest }
  writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 })
}

/** What persists across a restart or a recreation; sign-up is refused only once the recreation closed it. */
async function restarted(target, statePath, waitMs, step, { signUpClosed }) {
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  assert.equal(state.schema, STATE_SCHEMA)
  assert.equal(state.origin, target.origin, 'the restarted phase drives the server the first phase drove')
  const flow = flowFor(target, state.identity)
  const { op, ids, issueId } = state
  await step('health', () => until('the server to report ready', flow.health, waitMs), (h) => ({ httpStatus: h.httpStatus, status: h.status }))
  await step(
    'plugin ready again',
    () => until('the plugin to be ready', async () => ((await flow.pluginStatus(op, ids.pluginId)) === 'ready' ? 'ready' : null), PLUGIN_READY_MS),
    (status) => ({ pluginId: ids.pluginId, status }),
  )
  await step(
    'config unchanged',
    async () => {
      const after = await flow.configDigest(op, ids)
      assert.equal(after, state.configDigest)
      return { before: state.configDigest, after }
    },
    seen,
  )
  await step(
    'same issue found, still cancelled',
    async () => {
      const found = await flow.lookup(op, ids)
      assert.deepEqual([found.outcome, found.issueId, found.status], ['found', issueId, 'cancelled'])
      return { outcome: found.outcome, issueId: found.issueId, status: found.status }
    },
    seen,
  )
  await step(
    'commission resend answered by the same issue',
    async () => {
      const again = (await flow.commission(op, ids)).reply
      assert.deepEqual([again.outcome, again.issueId], ['existing', issueId])
      return { outcome: again.outcome, issueId: again.issueId }
    },
    seen,
  )
  if (signUpClosed) await step('sign-up refused', () => flow.signUpRefused(), (refusal) => ({ status: refusal.status, code: refusal.code }))
  await step('host-name guard', () => flow.hostGuard(), seen)
}
