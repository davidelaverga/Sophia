// Sending voice qualification receipts (evidence-sender.ts, A15) against a FAKE API: queued, never awaited by the caller,
// sent one at a time in sequence order; a lost answer is sent again with the same number and body, a bounded number of
// times, then dropped and counted; a refusal is not sent again.
import assert from 'node:assert/strict'
import http from 'node:http'
import { describe, it } from 'node:test'
import type { MediaEvidenceAck, MediaEvidenceWrite } from '@sophia/contracts'
import { EvidenceSender, MAX_SEQ, type SenderDeps } from './evidence-sender.ts'
import type { Receipt } from './qualification-recorder.ts'
import { httpMediaService, ServiceError } from './service.ts'

const EXCHANGE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GRANT = '77777777-7777-4777-8777-777777777777'
const OK: MediaEvidenceAck = { ended: false, reason: null }

const closed = (atMs: number): Receipt => ({
  kind: 'session_closed',
  schema: 'sophia.bridge.voice_qualification.v1',
  grantId: GRANT,
  runBindingSha256: 'ab'.repeat(32),
  atMs,
  providerClosed: true,
  windows: 0,
  turns: 0,
  replies: 0,
  toolCalls: 0,
  typedMessages: 0,
  transcriptRetained: false,
  reason: 'ended',
})

const settle = () => new Promise((resolve) => setImmediate(resolve))

function sender(record: SenderDeps['record'], over: Partial<SenderDeps> = {}) {
  const logs: Array<[string, Record<string, unknown>]> = []
  const ended: Array<MediaEvidenceAck['reason']> = []
  let seq = 0
  const s = new EvidenceSender({
    exchangeId: EXCHANGE,
    grantId: GRANT,
    record,
    nextSeq: () => (seq += 1),
    retryMs: [0, 0],
    ended: (reason) => ended.push(reason),
    log: (event, detail) => logs.push([event, detail ?? {}]),
    ...over,
  })
  return { s, logs, ended }
}

describe('evidence sender', () => {
  it('queues without waiting, and sends one write at a time, in sequence order', async () => {
    const writes: MediaEvidenceWrite[] = []
    const answers: Array<() => void> = []
    const { s } = sender(async (w) => {
      writes.push(w)
      await new Promise<void>((resolve) => answers.push(resolve))
      return OK
    })
    s.send(closed(1))
    s.send(closed(2))
    s.send(closed(3))
    await settle()
    assert.deepEqual(
      writes.map((w) => w.seq),
      [1],
      'the second waits for the first',
    )
    for (let i = 0; i < 3; i += 1) {
      answers.shift()?.()
      await settle()
    }
    assert.deepEqual(
      writes.map((w) => [w.exchangeId, w.grantId, w.seq, w.receipt.atMs]),
      [
        [EXCHANGE, GRANT, 1, 1],
        [EXCHANGE, GRANT, 2, 2],
        [EXCHANGE, GRANT, 3, 3],
      ],
    )
    assert.deepEqual([s.sent, s.dropped], [3, 0])
  })

  it('a lost answer or a 5xx is sent again with the same number and the same body, then dropped and counted', async () => {
    const writes: MediaEvidenceWrite[] = []
    const failures = [new Error('socket hang up'), new ServiceError(503, 'POST /v1/media/evidence: 503')]
    const { s, logs } = sender(async (w) => {
      await Promise.resolve()
      writes.push(structuredClone(w))
      const failure = failures.shift()
      if (failure) throw failure
      return OK
    })
    s.send(closed(1))
    await s.flush(1000)
    assert.equal(writes.length, 3)
    assert.deepEqual(writes[1], writes[0])
    assert.deepEqual(writes[2], writes[0], 'the same number and body each time: the API keeps it once')
    assert.deepEqual([s.sent, s.dropped], [1, 0])

    const lost = sender(async () => {
      await Promise.resolve()
      throw new ServiceError(502, 'POST /v1/media/evidence: 502')
    })
    lost.s.send(closed(2))
    lost.s.send(closed(3))
    await lost.s.flush(1000)
    assert.deepEqual([lost.s.sent, lost.s.dropped], [0, 2])
    const dropped = lost.logs
      .filter(([event]) => event === 'evidence.dropped')
      .map(([, d]) => [d.seq, d.why, d.dropped])
    assert.deepEqual(dropped, [
      [1, 'unanswered', 1],
      [2, 'unanswered', 2],
    ])
    assert.equal(JSON.stringify(logs).includes('session_closed'), false, 'nothing was dropped there')
  })

  it('a refusal (4xx) is not sent again: it is dropped and counted at once', async () => {
    let attempts = 0
    const { s, logs } = sender(async () => {
      await Promise.resolve()
      attempts += 1
      throw new ServiceError(409, 'POST /v1/media/evidence: 409 idempotency_conflict')
    })
    s.send(closed(1))
    await s.flush(1000)
    assert.equal(attempts, 1)
    assert.equal(s.dropped, 1)
    assert.deepEqual(
      logs.map(([event, d]) => [event, d.seq, d.kind, d.why]),
      [['evidence.dropped', 1, 'session_closed', 'refused']],
    )
  })

  it('passes on once that the API’s guard ended the exchange, and keeps sending what is queued', async () => {
    const seqs: number[] = []
    const { s, ended } = sender(async (w) => {
      await Promise.resolve()
      seqs.push(w.seq)
      return { ended: w.seq >= 2, reason: w.seq >= 2 ? 'usage' : null }
    })
    for (let i = 1; i <= 3; i += 1) s.send(closed(i))
    await s.flush(1000)
    assert.deepEqual(ended, ['usage'])
    assert.deepEqual(seqs, [1, 2, 3])
  })

  it('past 99,999 nothing is sent; a closed session’s queue is dropped and counted, not retried', async () => {
    let seq = MAX_SEQ - 1
    const sent: number[] = []
    const { s } = sender(
      async (w) => {
        await Promise.resolve()
        sent.push(w.seq)
        return OK
      },
      { nextSeq: () => (seq += 1) },
    )
    s.send(closed(1))
    s.send(closed(2))
    await s.flush(1000)
    assert.deepEqual(sent, [MAX_SEQ])
    assert.equal(s.dropped, 1)

    const pending = sender(() => new Promise<MediaEvidenceAck>(() => undefined))
    pending.s.send(closed(1))
    pending.s.send(closed(2))
    pending.s.send(closed(3))
    const started = Date.now()
    await pending.s.flush(20)
    assert.ok(Date.now() - started < 1000, 'a close waits no longer than its bound')
    pending.s.abandon()
    pending.s.send(closed(4))
    assert.equal(pending.s.dropped, 3, 'the two still queued, and the one sent after')
  })

  it('a write waiting to be sent again when the session closes is dropped, not sent again', async () => {
    let attempts = 0
    const { s, logs } = sender(
      async () => {
        await Promise.resolve()
        attempts += 1
        throw new ServiceError(503, 'POST /v1/media/evidence: 503')
      },
      { retryMs: [30] },
    )
    s.send(closed(1))
    await settle()
    assert.equal(attempts, 1)
    s.abandon()
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(attempts, 1, 'not sent again after the close')
    assert.deepEqual(
      logs.map(([event, d]) => [event, d.seq, d.why]),
      [['evidence.dropped', 1, 'abandoned']],
    )
  })
})

/**
 * A loopback HTTP endpoint standing in for the API's POST /v1/media/evidence (Codex P2 r4235355799): each request is
 * answered as `answer` says for its order of arrival (1, 2, ...): 'ok' at once, 'silent' (accepts, never answers, no
 * headers), or 'hanging' (200 and the start of its JSON, never finished). It records each request's sequence number and
 * body, when it came, and when its socket closed.
 */
async function evidencePeer(answer: (n: number, seq: number) => 'ok' | 'silent' | 'hanging') {
  const requests: Array<{ seq: number; body: string; at: number; socketClosed: Promise<number> }> = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    req.on('end', () => {
      const parsed: unknown = JSON.parse(body)
      const seq = typeof parsed === 'object' && parsed !== null && 'seq' in parsed ? Number(parsed.seq) : 0
      const socketClosed = new Promise<number>((resolve) => req.socket.once('close', () => resolve(Date.now())))
      requests.push({ seq, body, at: Date.now(), socketClosed })
      const how = answer(requests.length, seq)
      if (how === 'ok') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(OK))
      } else if (how === 'hanging') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.write('{"ended":')
      }
    })
  })
  server.keepAliveTimeout = 60_000
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address !== null && typeof address === 'object')
  const service = httpMediaService(`http://127.0.0.1:${String(address.port)}`, 'media-bridge-capability-for-tests')
  return {
    requests,
    record: service.recordEvidence,
    end: async () => {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

/** The timers this process holds now. */
const timers = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length

/** One attempt's bound in these tests, and how late past it an attempt may be given up: timer and loop latency. */
const ATTEMPT_MS = 300
const MARGIN_MS = 250

describe('each evidence attempt is bounded, its request cancelled, and the next receipt goes (Codex r4235355799)', () => {
  /** Two receipts through the real service client, each attempt bounded at ATTEMPT_MS, one retry after 50 ms. */
  async function twoReceipts(answer: (n: number, seq: number) => 'ok' | 'silent' | 'hanging') {
    const peer = await evidencePeer(answer)
    const { s, logs } = sender(peer.record, { retryMs: [50], attemptMs: ATTEMPT_MS })
    s.send(closed(1))
    s.send(closed(2))
    await s.flush(5000)
    return { peer, s, logs }
  }

  for (const stall of ['silent', 'hanging'] as const) {
    it(`a ${stall === 'silent' ? 'request never answered (no headers)' : 'body that never finishes (headers sent)'}: given up within its bound, its socket closed; sent again with the same number and body; the next receipt follows`, async () => {
      const { peer, s, logs } = await twoReceipts((n) => (n === 1 ? stall : 'ok'))
      try {
        assert.deepEqual(
          peer.requests.map((r) => r.seq),
          [1, 1, 2],
          'the stalled one again, then the next, in order',
        )
        const [first, again] = peer.requests
        assert.ok(first && again)
        assert.equal(again.body, first.body, 'the same number and the same body')
        const closedAt = await Promise.race([
          first.socketClosed,
          new Promise<number>((resolve) => setTimeout(() => resolve(Number.POSITIVE_INFINITY), 2000)),
        ])
        assert.ok(
          closedAt - first.at < ATTEMPT_MS + MARGIN_MS,
          `the first attempt’s socket closed at ${String(closedAt - first.at)} ms`,
        )
        assert.ok(again.at - first.at >= ATTEMPT_MS, 'the retry came after the bound and its wait')
        assert.deepEqual([s.sent, s.dropped], [2, 0])
        assert.deepEqual(logs, [])
      } finally {
        await peer.end()
      }
    })
  }

  it('its attempts spent: dropped and counted as unanswered, never answered; every stalled socket closed; the next receipt is delivered', async () => {
    const { peer, s, logs } = await twoReceipts((_, seq) => (seq === 1 ? 'silent' : 'ok'))
    try {
      assert.deepEqual(
        peer.requests.map((r) => r.seq),
        [1, 1, 2],
      )
      assert.deepEqual([s.sent, s.dropped], [1, 1])
      assert.deepEqual(
        logs.map(([event, d]) => [event, d.seq, d.why]),
        [['evidence.dropped', 1, 'unanswered']],
      )
      const stalled = peer.requests.filter((r) => r.seq === 1)
      const closedAt = await Promise.race([
        Promise.all(stalled.map((r) => r.socketClosed)),
        new Promise<'open'>((resolve) => setTimeout(() => resolve('open'), 2000)),
      ])
      assert.notEqual(closedAt, 'open', 'both stalled requests’ sockets closed')
    } finally {
      await peer.end()
    }
  })

  it('a normal answer is unchanged (control): one request per receipt, in order', async () => {
    const { peer, s, logs } = await twoReceipts(() => 'ok')
    try {
      assert.deepEqual(
        peer.requests.map((r) => r.seq),
        [1, 2],
      )
      assert.deepEqual([s.sent, s.dropped], [2, 0])
      assert.deepEqual(logs, [])
    } finally {
      await peer.end()
    }
  })

  it('an attempt leaves no timer of its own behind, answered or given up', async () => {
    const before = timers()
    let n = 0
    const { s } = sender(
      async (_, signal) => {
        n += 1
        if (n === 1) {
          // given up: settles only once its signal aborts
          await new Promise((_resolve, reject) =>
            signal?.addEventListener('abort', () => reject(new Error('given up'))),
          )
        }
        return OK
      },
      { retryMs: [0], attemptMs: 50 },
    )
    for (let i = 0; i < 5; i += 1) s.send(closed(i))
    await s.flush(5000)
    await settle()
    assert.deepEqual([s.sent, s.dropped], [5, 0])
    assert.equal(timers(), before, 'no timer left')
  })
})
