// WBC-02 (WBC-02-CX-0031, CX-0032): the service probe's --url mode. It drives a Paperclip server that is already
// running, at a loopback origin only (a disposable container whose port is published on 127.0.0.1), in two phases:
//   --phase first      health, the host-name guard, the first admin, the plugin installed from its path in the image
//                      and configured, a signed commission (and its resend: the same issue), a signed Stop (and its
//                      resend: already applied), a scheduled run of the settle job, the lookup, the config's digest;
//   --phase restarted  after the server was restarted or recreated (sign-up closed) on the same database and home:
//                      the plugin ready again, the config unchanged, the same issue found and still cancelled, the
//                      commission's resend answered by the same issue, sign-up refused, the host-name guard.
// It starts no process, opens no database and reads no /proc: the container's memory is the caller's to measure, from
// its cgroup. Between phases it keeps its state (the synthetic board key and Sophia key among it) in --state, which
// the caller keeps private and never uploads; the result it writes (--out) holds no credential. Every credential the
// probe makes or is given (passwords, session cookies, the board key) it appends to --secrets, one a line, and masks in
// a GitHub Actions log, so the evidence scrub can remove them wherever the server logged them (review of 215b276). Sophia's address in
// the container is closed, so this qualifies the installed plugin and the container, not a native dispatch.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { flowFor, loopbackOrigin, newIdentity, until } from './paperclip-probe-flow.mjs'

const STATE_SCHEMA = 'sophia.paperclip-probe-state.v1'

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
  if (phase !== 'first' && phase !== 'restarted') throw new Error('--phase must be first or restarted')
  if (!values.state) throw new Error('--state <file> is required')
  if (!values.secrets) throw new Error('--secrets <file> is required: the evidence scrub removes what it lists')
  const onSecret = secretSink(values.secrets)
  const waitMs = Number(values['wait-ms'] ?? 300_000)
  const deadlineMs = Number(values['deadline-ms'] ?? 600_000)
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
    else await restarted({ ...target, pluginPath, onSecret }, values.state, waitMs, step)
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
  await step('health', () => until('the server to report ready', flow.health, waitMs), (h) => ({ status: h.status }))
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

async function restarted(target, statePath, waitMs, step) {
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  assert.equal(state.schema, STATE_SCHEMA)
  assert.equal(state.origin, target.origin, 'the restarted phase drives the server the first phase drove')
  const flow = flowFor(target, state.identity)
  const { op, ids, issueId } = state
  await step('health', () => until('the server to report ready', flow.health, waitMs), (h) => ({ status: h.status }))
  await step(
    'plugin ready again',
    () => until('the plugin to be ready', async () => ((await flow.pluginStatus(op, ids.pluginId)) === 'ready' ? 'ready' : null), 60_000),
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
  await step('sign-up refused', () => flow.signUpRefused(), (refusal) => ({ status: refusal.status, code: refusal.code }))
  await step('host-name guard', () => flow.hostGuard(), seen)
}
