// Sending voice qualification receipts (evidence-sender.ts, A15) against a FAKE API: queued, never awaited by the caller,
// sent one at a time in the order queued, each with its own write identity and never a number of its own; the service
// numbers them (0051). A lost answer is sent again with the same identity and body, a bounded number of times, then
// dropped and counted; a refusal is not sent again.
import assert from 'node:assert/strict'
import http from 'node:http'
import { describe, it } from 'node:test'
import type { MediaEvidenceAck, MediaEvidenceWrite } from '@sophia/contracts'
import { EvidenceSender, type SenderDeps } from './evidence-sender.ts'
import type { Receipt } from './qualification-recorder.ts'
import { httpMediaService, ServiceError } from './service.ts'

const EXCHANGE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GRANT = '77777777-7777-4777-8777-777777777777'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

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

/**
 * The service's numbering as 0051 gives it, for one exchange: a new write identity takes the next number, a repeat of
 * one its own number again (replayed). Shared by every sender that writes to it, as the database is.
 */
function numbering() {
  const given = new Map<string, number>()
  return (w: MediaEvidenceWrite, over: Partial<MediaEvidenceAck> = {}): MediaEvidenceAck => {
    const own = given.get(w.writeId)
    const seq = own ?? given.size + 1
    given.set(w.writeId, seq)
    return { seq, replayed: own !== undefined, ended: false, reason: null, ...over }
  }
}

function sender(record: SenderDeps['record'], over: Partial<SenderDeps> = {}) {
  const logs: Array<[string, Record<string, unknown>]> = []
  const ended: Array<MediaEvidenceAck['reason']> = []
  const s = new EvidenceSender({
    exchangeId: EXCHANGE,
    grantId: GRANT,
    record,
    retryMs: [0, 0],
    ended: (reason) => ended.push(reason),
    log: (event, detail) => logs.push([event, detail ?? {}]),
    ...over,
  })
  return { s, logs, ended }
}

describe('evidence sender', () => {
  it('queues without waiting, and sends one write at a time, in the order queued, each with its own identity and no number', async () => {
    const writes: MediaEvidenceWrite[] = []
    const answers: Array<() => void> = []
    const service = numbering()
    const { s } = sender(async (w) => {
      writes.push(w)
      await new Promise<void>((resolve) => answers.push(resolve))
      return service(w)
    })
    s.send(closed(1))
    s.send(closed(2))
    s.send(closed(3))
    await settle()
    assert.deepEqual(
      writes.map((w) => w.receipt.atMs),
      [1],
      'the second waits for the first',
    )
    for (let i = 0; i < 3; i += 1) {
      answers.shift()?.()
      await settle()
    }
    assert.deepEqual(
      writes.map((w) => [w.exchangeId, w.grantId, w.receipt.atMs, Object.keys(w).toSorted().join()]),
      [
        [EXCHANGE, GRANT, 1, 'exchangeId,grantId,receipt,writeId'],
        [EXCHANGE, GRANT, 2, 'exchangeId,grantId,receipt,writeId'],
        [EXCHANGE, GRANT, 3, 'exchangeId,grantId,receipt,writeId'],
      ],
      'a write names its identity, never a number',
    )
    assert.ok(writes.every((w) => UUID.test(w.writeId)))
    assert.equal(new Set(writes.map((w) => w.writeId)).size, 3, 'each receipt its own identity')
    assert.deepEqual(s.numbers, [1, 2, 3], 'the numbers the service gave')
    assert.deepEqual([s.sent, s.dropped], [3, 0])
  })

  it('a restarted process, or a second one for the same exchange, takes the service’s next numbers: none is given twice', async () => {
    const service = numbering()
    const kept: Array<[number, number]> = []
    const record: SenderDeps['record'] = async (w) => {
      await Promise.resolve()
      const ack = service(w)
      kept.push([ack.seq, w.receipt.atMs])
      return ack
    }
    const first = sender(record)
    first.s.send(closed(1))
    first.s.send(closed(2))
    await first.s.flush(1000)
    // the process restarts (a new sender, nothing remembered), and another serves the exchange alongside it
    const restarted = sender(record)
    const overlap = sender(record)
    restarted.s.send(closed(3))
    overlap.s.send(closed(4))
    restarted.s.send(closed(5))
    await Promise.all([restarted.s.flush(1000), overlap.s.flush(1000)])
    assert.deepEqual(first.s.numbers, [1, 2])
    assert.deepEqual(
      [...restarted.s.numbers, ...overlap.s.numbers].toSorted((x, y) => x - y),
      [3, 4, 5],
    )
    assert.deepEqual(
      kept.map(([seq]) => seq),
      [1, 2, 3, 4, 5],
      'dense, in the order the service took them',
    )
    assert.deepEqual(
      [first, restarted, overlap].map(({ s }) => [s.sent, s.dropped]),
      [
        [2, 0],
        [2, 0],
        [1, 0],
      ],
    )
  })

  it('a lost answer or a 5xx is sent again with the same identity and the same body, then dropped and counted', async () => {
    const writes: MediaEvidenceWrite[] = []
    const service = numbering()
    // the first answer is lost after the service numbered the write; the second is a 503 before it was read
    const failures = [
      (w: MediaEvidenceWrite) => {
        service(w)
        return new Error('socket hang up')
      },
      () => new ServiceError(503, 'POST /v1/media/evidence-writes: 503'),
    ]
    const acks: MediaEvidenceAck[] = []
    const { s, logs } = sender(async (w) => {
      await Promise.resolve()
      writes.push(structuredClone(w))
      const failure = failures.shift()
      if (failure) throw failure(w)
      const ack = service(w)
      acks.push(ack)
      return ack
    })
    s.send(closed(1))
    await s.flush(1000)
    assert.equal(writes.length, 3)
    assert.deepEqual(writes[1], writes[0])
    assert.deepEqual(writes[2], writes[0], 'the same identity and body each time: the service numbers it once')
    assert.deepEqual(acks, [{ seq: 1, replayed: true, ended: false, reason: null }], 'its own number, replayed')
    assert.deepEqual(s.numbers, [1])
    assert.deepEqual([s.sent, s.dropped], [1, 0])

    const lost = sender(async () => {
      await Promise.resolve()
      throw new ServiceError(502, 'POST /v1/media/evidence-writes: 502')
    })
    lost.s.send(closed(2))
    lost.s.send(closed(3))
    await lost.s.flush(1000)
    assert.deepEqual([lost.s.sent, lost.s.dropped], [0, 2])
    const dropped = lost.logs.filter(([event]) => event === 'evidence.dropped').map(([, d]) => d)
    assert.deepEqual(
      dropped.map((d) => [d.why, d.dropped, 'seq' in d]),
      [
        ['unanswered', 1, false],
        ['unanswered', 2, false],
      ],
    )
    assert.ok(dropped.every((d) => typeof d.writeId === 'string' && UUID.test(d.writeId)))
    assert.notEqual(dropped[0]?.writeId, dropped[1]?.writeId)
    assert.equal(JSON.stringify(logs).includes('session_closed'), false, 'nothing was dropped there')
  })

  it('a refusal (4xx) is not sent again: it is dropped and counted at once', async () => {
    const writes: MediaEvidenceWrite[] = []
    const { s, logs } = sender(async (w) => {
      await Promise.resolve()
      writes.push(w)
      throw new ServiceError(409, 'POST /v1/media/evidence-writes: 409 idempotency_conflict')
    })
    s.send(closed(1))
    await s.flush(1000)
    assert.equal(writes.length, 1)
    assert.equal(s.dropped, 1)
    assert.deepEqual(
      logs.map(([event, d]) => [event, d.writeId, d.kind, d.why]),
      [['evidence.dropped', writes[0]?.writeId, 'session_closed', 'refused']],
    )
  })

  it('passes on once that the API’s guard ended the exchange, and keeps sending what is queued', async () => {
    const service = numbering()
    const { s, ended } = sender(async (w) => {
      await Promise.resolve()
      const ack = service(w)
      return ack.seq >= 2 ? { ...ack, ended: true, reason: 'usage' } : ack
    })
    for (let i = 1; i <= 3; i += 1) s.send(closed(i))
    await s.flush(1000)
    assert.deepEqual(ended, ['usage'])
    assert.deepEqual(s.numbers, [1, 2, 3])
  })

  it('a write the service refuses once its numbers are spent (422) is dropped, not sent again; a closed session’s queue is dropped and counted, not retried', async () => {
    const attempts: number[] = []
    const service = numbering()
    const { s, logs } = sender(async (w) => {
      await Promise.resolve()
      attempts.push(w.receipt.atMs)
      if (w.receipt.atMs === 1) throw new ServiceError(422, 'POST /v1/media/evidence-writes: 422 invalid_request')
      return service(w)
    })
    s.send(closed(1))
    s.send(closed(2))
    await s.flush(1000)
    assert.deepEqual(attempts, [1, 2], 'the refused write once; the next still goes')
    assert.deepEqual([s.sent, s.dropped], [1, 1])
    assert.deepEqual(
      logs.map(([event, d]) => [event, d.why]),
      [['evidence.dropped', 'refused']],
    )

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
    const writes: MediaEvidenceWrite[] = []
    const { s, logs } = sender(
      async (w) => {
        await Promise.resolve()
        writes.push(w)
        throw new ServiceError(503, 'POST /v1/media/evidence-writes: 503')
      },
      { retryMs: [30] },
    )
    s.send(closed(1))
    await settle()
    assert.equal(writes.length, 1)
    s.abandon()
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(writes.length, 1, 'not sent again after the close')
    assert.deepEqual(
      logs.map(([event, d]) => [event, d.writeId, d.why]),
      [['evidence.dropped', writes[0]?.writeId, 'abandoned']],
    )
  })
})

/**
 * A loopback HTTP endpoint standing in for the API's POST /v1/media/evidence-writes (Codex P2 r4235355799): each request
 * is answered as `answer` says for its order of arrival (1, 2, ...) and its receipt (its atMs): 'ok' at once, numbered
 * as the service numbers it, 'silent' (accepts, never answers, no headers), or 'hanging' (200 and the start of its JSON,
 * never finished). It records each request's receipt, write identity and body, when it came, and when its socket closed.
 */
async function evidencePeer(answer: (n: number, receipt: number) => 'ok' | 'silent' | 'hanging') {
  const requests: Array<{ receipt: number; writeId: string; body: string; at: number; socketClosed: Promise<number> }> =
    []
  const service = numbering()
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    req.on('end', () => {
      const write = JSON.parse(body) as MediaEvidenceWrite
      const socketClosed = new Promise<number>((resolve) => req.socket.once('close', () => resolve(Date.now())))
      requests.push({ receipt: write.receipt.atMs, writeId: write.writeId, body, at: Date.now(), socketClosed })
      const how = answer(requests.length, write.receipt.atMs)
      if (how === 'ok') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(service(write)))
      } else if (how === 'hanging') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.write('{"seq":')
      }
    })
  })
  server.keepAliveTimeout = 60_000
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address !== null && typeof address === 'object')
  const client = httpMediaService(`http://127.0.0.1:${String(address.port)}`, 'media-bridge-capability-for-tests')
  return {
    requests,
    record: client.recordEvidence,
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
  async function twoReceipts(answer: (n: number, receipt: number) => 'ok' | 'silent' | 'hanging') {
    const peer = await evidencePeer(answer)
    const { s, logs } = sender(peer.record, { retryMs: [50], attemptMs: ATTEMPT_MS })
    s.send(closed(1))
    s.send(closed(2))
    await s.flush(5000)
    return { peer, s, logs }
  }

  for (const stall of ['silent', 'hanging'] as const) {
    it(`a ${stall === 'silent' ? 'request never answered (no headers)' : 'body that never finishes (headers sent)'}: given up within its bound, its socket closed; sent again with the same identity and body; the next receipt follows`, async () => {
      const { peer, s, logs } = await twoReceipts((n) => (n === 1 ? stall : 'ok'))
      try {
        assert.deepEqual(
          peer.requests.map((r) => r.receipt),
          [1, 1, 2],
          'the stalled one again, then the next, in order',
        )
        const [first, again, next] = peer.requests
        assert.ok(first && again && next)
        assert.equal(again.body, first.body, 'the same identity and the same body')
        assert.notEqual(next.writeId, first.writeId)
        assert.deepEqual(s.numbers, [1, 2], 'numbered by the service, once each')
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
    const { peer, s, logs } = await twoReceipts((_, receipt) => (receipt === 1 ? 'silent' : 'ok'))
    try {
      assert.deepEqual(
        peer.requests.map((r) => r.receipt),
        [1, 1, 2],
      )
      assert.deepEqual([s.sent, s.dropped], [1, 1])
      assert.deepEqual(
        logs.map(([event, d]) => [event, d.writeId, d.why]),
        [['evidence.dropped', peer.requests[0]?.writeId, 'unanswered']],
      )
      const stalled = peer.requests.filter((r) => r.receipt === 1)
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
        peer.requests.map((r) => r.receipt),
        [1, 2],
      )
      assert.deepEqual(s.numbers, [1, 2])
      assert.deepEqual([s.sent, s.dropped], [2, 0])
      assert.deepEqual(logs, [])
    } finally {
      await peer.end()
    }
  })

  it('an attempt leaves no timer of its own behind, answered or given up', async () => {
    const before = timers()
    let n = 0
    const service = numbering()
    const { s } = sender(
      async (w, signal) => {
        n += 1
        if (n === 1) {
          // given up: settles only once its signal aborts
          await new Promise((_resolve, reject) =>
            signal?.addEventListener('abort', () => reject(new Error('given up'))),
          )
        }
        return service(w)
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
