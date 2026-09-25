import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSse } from './sse.ts'

const P = '00000000-0000-0000-0000-000000000001'
const advance = (sequence: string) => JSON.stringify({ projectId: P, type: 'cursor.advanced', sequence })

describe('parseSse', () => {
  it('returns complete frames and keeps the incomplete tail', () => {
    const { frames, ids, rest } = parseSse(`retry: 3000\n\nid: 1\ndata: ${advance('1')}\n\nid: 2\ndata: {"proj`)
    assert.deepEqual(
      frames.map((f) => f.sequence),
      ['1'],
    )
    assert.deepEqual(ids, ['1'])
    assert.equal(rest, 'id: 2\ndata: {"proj')
  })

  it('ignores heartbeats and joins multi-line data', () => {
    const multi = `data: {"projectId":"${P}",\ndata: "type":"cursor.advanced","sequence":"7"}`
    const { frames, rest } = parseSse(`: ping\n\n${multi}\n\n`)
    assert.deepEqual(frames, [{ projectId: P, type: 'cursor.advanced', sequence: '7' }])
    assert.equal(rest, '')
  })

  it('produces the same frames however the text is chunked', () => {
    const text = `id: 1\ndata: ${advance('1')}\n\n: ping\n\nid: 2\ndata: ${advance('2')}\n\n`
    for (let cut = 1; cut < text.length; cut += 7) {
      const a = parseSse(text.slice(0, cut))
      const b = parseSse(a.rest + text.slice(cut))
      assert.deepEqual(
        [...a.frames, ...b.frames].map((f) => f.sequence),
        ['1', '2'],
      )
    }
  })
})
