import jpeg from 'jpeg-js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { downscale, FRAME_INTERVAL_MS, FrameSampler, MAX_FRAME_WIDTH, type TaggedFrame, toJpeg } from './vision.ts'

const frame = (epoch: number, width = 4, height = 2): TaggedFrame => ({
  rgba: new Uint8Array(width * height * 4).fill(200),
  width,
  height,
  capturedAt: 0,
  observationEpoch: epoch,
})

describe('selected visual input', () => {
  it('sends at most one frame per second, latest only', () => {
    const s = new FrameSampler()
    const a = frame(1)
    const b = frame(1)
    s.offer(a)
    s.offer(b)
    assert.equal(s.take(FRAME_INTERVAL_MS, 1), b, 'the latest frame, not a queue')
    s.offer(frame(1))
    assert.equal(s.take(FRAME_INTERVAL_MS + 500, 1), null, 'not due yet')
    assert.notEqual(s.take(FRAME_INTERVAL_MS * 2, 1), null)
  })

  it('never sends a frame of an older observation epoch', () => {
    const s = new FrameSampler()
    s.offer(frame(1))
    assert.equal(s.take(FRAME_INTERVAL_MS, 2), null)
    s.offer(frame(2))
    s.clear()
    assert.equal(s.take(FRAME_INTERVAL_MS * 3, 2), null, 'Stop Looking drops what was sampled')
  })

  it('downscales wide frames and encodes a JPEG that decodes to the downscaled size', () => {
    const wide = frame(1, MAX_FRAME_WIDTH * 2, 20)
    const small = downscale(wide)
    assert.equal(small.width, MAX_FRAME_WIDTH)
    assert.equal(small.height, 10)
    const decoded = jpeg.decode(toJpeg(wide))
    assert.equal(decoded.width, MAX_FRAME_WIDTH)
    assert.equal(decoded.height, 10)
  })
})
