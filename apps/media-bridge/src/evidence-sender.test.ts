// Sending voice qualification receipts (evidence-sender.ts, A15) against a FAKE API: queued, never awaited by the caller,
// sent one at a time in sequence order; a lost answer is sent again with the same number and body, a bounded number of
// times, then dropped and counted; a refusal is not sent again.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MediaEvidenceAck, MediaEvidenceWrite } from '@sophia/contracts'
import { EvidenceSender, MAX_SEQ, type SenderDeps } from './evidence-sender.ts'
import type { Receipt } from './qualification-recorder.ts'
import { ServiceError } from './service.ts'

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
