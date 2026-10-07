/**
 * LABELLED FIXTURE — stands in for S1-02's Sophia service until it lands.
 *
 * Speaks the bridge's runtime wire protocol (packages/dsh-bundle/src/transport.ts)
 * over plain HTTP on 127.0.0.1: an in-memory command outbox with sequence
 * numbers, receipts and observations logs, bearer-token checks, and a
 * configurable binding set returned by `hello`. It is not durable admission,
 * not authentication, and not evidence for S1-02's acceptance.
 */

import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'

/** The receipt of the fixture's review page (WBC-02, Codex on #107): a review cites a source with it. */
export const REVIEW_RECEIPT = 'fedcba9876543210fedcba9876543210'

export async function startFixtureService({ token = randomUUID(), runtimeUnitId, bindings = [] } = {}) {
  const outbox = [] // { seq, command }
  const receipts = []
  const observations = []
  const hellos = []
  const readiness = []
  const waiters = new Set()
  let seq = 0
  let polls = 0
  const state = { bindings: [...bindings], refuseReady: false, refuseObservations: false, refuseReceipts: false, research: {}, design: {}, review: {} }
  // The runtime research operations (SMC-M03 S4, A11): every call recorded; each answered by a test's handler, or by
  // a well-formed default (an empty task, a reservation, its settlement, a capture, a draft).
  const research = []
  let researchSeq = 0
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const researchDefaults = {
    context: (body) => body.sourceId === undefined
      ? { taskId: uuid(1), rootTaskId: uuid(1), question: 'Fixture question?', outputs: ['markdown'], preferences: {}, assumptions: [], inputs: [], urls: [], base: null,
          allowance: { capUsd: 5, headroomUsd: 0.5, committedUsd: 0, searchesLeft: 5, readsLeft: 8 }, draft: null, roster: [] }
      : { sourceId: body.sourceId, offset: 0, nextOffset: null, totalChars: 0, truncated: false, text: '' },
    reserve: (body) => ({ reservationId: uuid(1000 + ++researchSeq), state: 'reserved', kind: body.kind, purpose: body.purpose ?? 'call', amountUsd: body.amountUsd,
      target: body.kind === 'read' ? { ref: body.targetRef, url: 'https://example.org/page' } : null }),
    settle: (body) => ({ reservationId: body.reservationId, state: body.outcome, settledUsd: body.costUsd ?? null }),
    capture: (body) => ({ sourceId: uuid(2000 + ++researchSeq), sha256: 'a'.repeat(64), byteLength: 1, kind: body.kind, refs: [] }),
    draft: () => ({ sourceId: uuid(3000 + ++researchSeq), sha256: 'b'.repeat(64), seq: 1 }),
    submit: (body) => body.result
      ? { taskId: uuid(1), outcome: 'published', artifactId: uuid(4000), versionId: uuid(4001), versionNumber: 1, sourceId: uuid(4002), sha256: body.result.draftSha256, resultSourceId: uuid(4003) }
      : { taskId: uuid(1), outcome: 'blocked', resultSourceId: uuid(4004) },
    render: (body) => ({ renderJobId: uuid(5000 + ++researchSeq), state: 'queued', repair: 'none', layout: 'standard', draftSha256: body.draftSha256 }),
    'render-result': (body) => ({ renderJobId: body.renderJobId ?? uuid(5000), state: 'succeeded', repair: 'none', layout: 'standard', draftSha256: 'b'.repeat(64),
      pdf: { sourceId: uuid(5999), sha256: 'c'.repeat(64), bytes: 2048, pages: 2 } }),
  }

  // The runtime design and review operations (SDD-01, A12), recorded and answered the same way. A capture is a real
  // PNG (a 3x2 one, so its dimensions survive dsh's normalization recognisably).
  const design = []
  const CAPTURE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGP4z8DAAMH//4PohoYGAEfPB3vT+rJCAAAAAElFTkSuQmCC'
  const CAPTURE_SHA256 = createHash('sha256').update(Buffer.from(CAPTURE_PNG, 'base64')).digest('hex')
  const designDefaults = {
    'design/record': (body) => ({ entries: (body.expectedEntries ?? 0) + body.entries.length, replayed: false }),
    'design/reserve': researchDefaults.reserve,
    'design/settle': researchDefaults.settle,
    'design/capture': (body) => ({
      renderJobId: body.renderJobId ?? uuid(6100),
      deliveryId: uuid(6200 + design.length),
      captures: body.names.map((name) => ({ name, target: 'w390-light', kind: 'overview', section: null, tile: 1, tiles: 1, width: 3, height: 2, scale: 0.5,
        sha256: CAPTURE_SHA256, bytes: 78, mime: 'image/png', data: CAPTURE_PNG })),
    }),
    'design/delivered': (body) => ({ deliveryId: body.deliveryId, renderJobId: uuid(6100), state: 'delivered', captures: body.attachments.map((a) => a.name) }),
    'review/submit': (body) => ({ outcome: 'recorded', verdict: body.result?.verdict ?? 'blocked', candidateId: uuid(6000) }),
  }
  designDefaults['review/capture'] = designDefaults['design/capture']
  designDefaults['review/delivered'] = designDefaults['design/delivered']
  // The source reviewer's operations (WBC-02, A13), recorded and answered the same way: a one-source task, a page of
  // fixture text with its receipt (REVIEW_RECEIPT), a reservation and its settlement, and a published review.
  const review = []
  const reviewDefaults = {
    context: (body) => body.sourceId === undefined
      ? { workId: uuid(7000), goal: { id: uuid(7001), revision: 1, title: 'Fixture goal', outcome: 'A fixture outcome', criteriaRef: 'criteria:fixture', criteria: [{ id: 'c1', description: 'The dates agree', required: true }] },
          purpose: null, sources: [{ ref: 'S1', sourceId: uuid(7002), sha256: 'a'.repeat(64), mime: 'text/markdown', byteLength: 26, readable: true }],
          limits: { maxSources: 3, maxInputBytes: 32768, maxModelRequests: 8, maxReportBytes: 16384, web: false, shell: false, connectors: false },
          allowance: { capUsd: 0.5, committedUsd: 0, modelCallsLeft: 8 } }
      : { sourceId: body.sourceId, offset: 0, nextOffset: null, totalChars: 26, truncated: false, text: 'The launch is on 3 March.', receipt: REVIEW_RECEIPT },
    reserve: (body) => ({ reservationId: uuid(8000 + ++researchSeq), state: 'reserved', kind: body.kind, purpose: body.purpose ?? 'call', amountUsd: body.amountUsd, target: null }),
    settle: (body) => ({ reservationId: body.reservationId, state: body.outcome, settledUsd: body.costUsd ?? null }),
    submit: (body) => body.result
      ? { outcome: 'published', resultId: uuid(9000), sourceId: uuid(9001), sha256: 'd'.repeat(64), verdict: body.result.verdict, replayed: false }
      : { outcome: 'blocked', sourceId: uuid(9002), reason: body.blocker.reason },
  }

  const notify = () => { for (const wake of waiters) wake(); waiters.clear() }

  const server = createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(body === undefined ? '' : JSON.stringify(body))
    }
    if (req.headers.authorization !== `Bearer ${token}`) return reply(401, { error: 'bad token' })
    if (req.headers['x-sophia-runtime-unit'] !== runtimeUnitId) return reply(403, { error: 'wrong runtime unit' })
    const url = new URL(req.url, 'http://fixture')
    let body = ''
    for await (const chunk of req) body += chunk
    const json = body ? JSON.parse(body) : undefined
    if (req.method === 'POST' && url.pathname === '/v1/runtime/hello') {
      hellos.push(json)
      return reply(200, { projectId: 'proj-fixture', leaseId: `lease-${hellos.length}`, authorityEpoch: 1, bindings: state.bindings, cursor: 0 })
    }
    if (req.method === 'GET' && url.pathname === '/v1/runtime/commands') {
      polls += 1
      const after = Number(url.searchParams.get('after') ?? 0)
      const waitMs = Math.min(Number(url.searchParams.get('waitMs') ?? 0), 2000)
      const pending = () => outbox.filter((c) => c.seq > after)
      if (pending().length === 0 && waitMs > 0) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, waitMs)
          waiters.add(() => { clearTimeout(timer); resolve() })
          req.on('close', () => { clearTimeout(timer); resolve() })
        })
      }
      return reply(200, { commands: pending(), cursor: Math.max(after, ...pending().map((c) => c.seq), 0) })
    }
    if (req.method === 'POST' && url.pathname === '/v1/runtime/receipts') {
      if (state.refuseReceipts) return reply(503, { error: 'fixture refuses receipts' })
      receipts.push(...json.receipts)
      notify()
      return reply(204)
    }
    if (req.method === 'POST' && url.pathname === '/v1/runtime/observations') {
      if (state.refuseObservations) return reply(503, { error: 'fixture refuses observations' })
      observations.push(...json.observations)
      notify()
      return reply(204)
    }
    const op = req.method === 'POST' && /^\/v1\/runtime\/research\/(context|reserve|settle|capture|draft|submit|render|render-result)$/.exec(url.pathname)?.[1]
    if (op) {
      research.push({ op, body: json })
      notify()
      const answer = (state.research[op] ?? researchDefaults[op])(json)
      return answer && answer.status ? reply(answer.status, answer.body) : reply(200, answer)
    }
    const designOp = req.method === 'POST' && /^\/v1\/runtime\/((?:design|review)\/[a-z-]+)$/.exec(url.pathname)?.[1]
    if (designOp) {
      design.push({ op: designOp, body: json })
      notify()
      const handler = state.design[designOp] ?? designDefaults[designOp]
      if (!handler) return reply(404, { error: 'not found' })
      const answer = handler(json)
      return answer && answer.status ? reply(answer.status, answer.body) : reply(200, answer)
    }
    const reviewOp = req.method === 'POST' && /^\/v1\/runtime\/source-review\/(context|reserve|settle|submit)$/.exec(url.pathname)?.[1]
    if (reviewOp) {
      review.push({ op: reviewOp, body: json })
      notify()
      const answer = (state.review[reviewOp] ?? reviewDefaults[reviewOp])(json)
      return answer && answer.status ? reply(answer.status, answer.body) : reply(200, answer)
    }
    if (req.method === 'POST' && url.pathname === '/v1/runtime/ready') {
      if (state.refuseReady) return reply(503, { error: 'fixture refuses the ready report' })
      readiness.push(json)
      notify()
      return reply(204)
    }
    return reply(404, { error: 'not found' })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  /** Wait until `predicate()` returns a truthy value, or fail after `timeoutMs`. */
  const waitFor = async (predicate, timeoutMs = 20000, what = 'condition') => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const value = predicate()
      if (value) return value
      const left = deadline - Date.now()
      if (left <= 0) throw new Error(`fixture: timed out waiting for ${what}`)
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, Math.min(left, 100))
        waiters.add(() => { clearTimeout(timer); resolve() })
      })
    }
  }

  return {
    url: `http://127.0.0.1:${port}`,
    token,
    receipts,
    observations,
    hellos,
    readiness,
    /** Every research operation the runtime called, in order: `{ op, body }`. */
    research,
    /**
     * Answer one research operation with `handler(body)`: a reply body, or `{ status, body }` for a refusal such as
     * `{ status: 409, body: { code: 'research_limit_reached' } }`. Null restores the default.
     */
    onResearch: (op, handler) => { state.research[op] = handler ?? undefined },
    /** Every design or review operation the runtime called, in order: `{ op, body }`, op like `design/capture`. */
    design,
    /** Answer one design or review operation (`design/render`, `review/submit`, ...) with `handler(body)`, as onResearch. */
    onDesign: (op, handler) => { state.design[op] = handler ?? undefined },
    /** The PNG every default capture carries, base64. */
    capturePng: CAPTURE_PNG,
    /** Every source-review operation the runtime called, in order: `{ op, body }`. */
    review,
    /** Answer one source-review operation with `handler(body)`, as onResearch. */
    onReview: (op, handler) => { state.review[op] = handler ?? undefined },
    setBindings: (next) => { state.bindings = [...next] },
    /** Make `POST ready` fail (adverse tests). */
    refuseReady: (value = true) => { state.refuseReady = value },
    /** Make `POST observations` fail, as during a network outage (adverse tests). */
    refuseObservations: (value = true) => { state.refuseObservations = value },
    /** Make `POST receipts` fail (adverse tests). */
    refuseReceipts: (value = true) => { state.refuseReceipts = value },
    /** How many command polls the runtime has made. */
    get polls() { return polls },
    /** Enqueue a command exactly as S1-02's outbox would (same object may be enqueued twice). */
    enqueue(command) {
      seq += 1
      outbox.push({ seq, command })
      notify()
      return seq
    },
    receiptsFor: (commandId) => receipts.filter((r) => r.commandId === commandId),
    waitForReceipt: (commandId, stage, timeoutMs) =>
      waitFor(() => receipts.find((r) => r.commandId === commandId && (!stage || r.stage === stage)), timeoutMs, `${stage ?? 'any'} receipt for ${commandId}`),
    waitForReady: (timeoutMs) => waitFor(() => readiness.find((r) => r.state === 'ready'), timeoutMs, 'bridge readiness'),
    waitFor,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/** Build a well-formed runtime command for the fixture. */
export function command(kind, { attemptId, runtimeUnitId, epoch = 1, text, role, route, commandId = `cmd-${randomUUID()}`, expectedNativeSessionId = null } = {}) {
  return {
    schema: 'sophia.runtime-command.v1',
    commandId,
    binding: { projectId: 'proj-fixture', goalId: 'goal-fixture', goalRevision: 1, attemptId, resourceId: 'dsh-native', authorityEpoch: epoch, runtimeUnitId },
    kind,
    expectedNativeSessionId,
    contextPacketId: null,
    payload: { ...(text === undefined ? {} : { text }), ...(role === undefined ? {} : { role }), ...(route === undefined ? {} : { route }) },
  }
}
