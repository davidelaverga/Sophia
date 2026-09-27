import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BATCH_BYTES, BATCH_ITEMS, headBatch, RetainedQueue } from '../../packages/dsh-bundle/dist/retained-queue.js'

// The API's body limit for /v1/runtime/receipts and /v1/runtime/observations (apps/api/src/routes/runtime.ts).
const API_BODY_LIMIT = 8 * 1024 * 1024
// The bridge's bound on one assistant message's text (control-bridge.ts ASSISTANT_TEXT_LIMIT).
const ASSISTANT_TEXT_LIMIT = 120_000

const observation = (seq, text) => ({ seq, type: 'message', payload: { role: 'assistant', text } })

test('a batch is bounded by items and by serialized bytes, and always carries at least one item', () => {
  const small = Array.from({ length: BATCH_ITEMS + 1 }, (_, i) => observation(i, 'ok'))
  assert.equal(headBatch(small).length, BATCH_ITEMS)

  // Three-byte characters at the text bound: about 360 kB each, so a 500-item batch would be about 180 MB.
  const large = Array.from({ length: 100 }, (_, i) => observation(i, '€'.repeat(ASSISTANT_TEXT_LIMIT)))
  const head = headBatch(large)
  assert.ok(head.length > 1 && head.length < large.length, `took ${head.length}`)
  assert.ok(Buffer.byteLength(JSON.stringify({ observations: head })) <= BATCH_BYTES + 64)

  assert.equal(headBatch([observation(0, 'x'.repeat(100))], 10).length, 1, 'one oversized item still goes alone')
  assert.deepEqual(headBatch([]), [])
})

test('after an outage, a backlog of large observations reaches a size-limited API in order', async () => {
  const stop = new AbortController()
  const delivered = []
  let rejected = 0
  let apiUp = false
  const queue = new RetainedQueue(
    'observation',
    async (batch) => {
      await Promise.resolve()
      if (!apiUp) throw new Error('fetch failed')
      if (Buffer.byteLength(JSON.stringify({ observations: batch })) > API_BODY_LIMIT) {
        rejected += 1
        throw new Error('413 Payload Too Large')
      }
      delivered.push(...batch.map((o) => o.seq))
    },
    { delayMs: 0, signal: stop.signal, log: () => undefined },
  )
  const backlog = Array.from({ length: 120 }, (_, i) => observation(i, 'x'.repeat(ASSISTANT_TEXT_LIMIT)))
  queue.push(...backlog)
  await new Promise((resolve) => setTimeout(resolve, 20))
  apiUp = true
  try {
    const deadline = Date.now() + 8000
    while (delivered.length < backlog.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
    assert.equal(rejected, 0, 'no batch exceeded the API limit')
    assert.deepEqual(
      delivered,
      backlog.map((o) => o.seq),
    )
  } finally {
    stop.abort()
  }
})
