import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AUDIBLE_RMS,
  base64ToPcm,
  FormatError,
  INPUT_BACKLOG,
  INPUT_CHUNK,
  InputChunker,
  isAudible,
  OUTPUT_BACKLOG_FRAMES,
  OUTPUT_FRAME,
  OutputFramer,
  pcmRate,
  pcmToBase64,
  ReplyAudio,
} from './audio.ts'

const ramp = (n: number, from = 0) => Int16Array.from({ length: n }, (_, i) => ((from + i) % 32767) - 16000)
/** A square wave of this amplitude: its RMS level is exactly `v`. */
const level = (v: number) => Int16Array.from({ length: INPUT_CHUNK }, (_, i) => (i % 2 ? v : -v))

describe('audio framing', () => {
  it('round-trips little-endian 16-bit PCM through base64', () => {
    const samples = Int16Array.from([0, 1, -1, 32767, -32768])
    assert.deepEqual(base64ToPcm(pcmToBase64(samples)), samples)
    assert.equal(Buffer.from(pcmToBase64(Int16Array.from([1])), 'base64').toString('hex'), '0100')
    assert.throws(() => base64ToPcm(Buffer.from([1, 2, 3]).toString('base64')), FormatError)
  })

  it('reads the declared output rate and refuses anything that is not raw PCM', () => {
    assert.equal(pcmRate('audio/pcm;rate=24000'), 24000)
    assert.equal(pcmRate('audio/pcm; rate=16000'), 16000)
    assert.equal(pcmRate('audio/pcm'), 24000)
    assert.throws(() => pcmRate('audio/webm;codecs=opus'), FormatError)
    assert.throws(() => pcmRate(undefined), FormatError)
  })

  it('chunks 16 kHz mono input into 100 ms pieces and refuses other formats rather than relabelling them', () => {
    const c = new InputChunker()
    c.push(ramp(1000), 16000, 1)
    assert.equal(c.take(), undefined)
    c.push(ramp(700, 1000), 16000, 1)
    assert.deepEqual(c.take(), ramp(INPUT_CHUNK))
    assert.throws(() => c.push(ramp(480), 48000, 1), FormatError)
    assert.throws(() => c.push(ramp(1600), 16000, 2), FormatError)
  })

  it('bounds the input backlog and counts what it dropped as a gap', () => {
    const c = new InputChunker()
    c.push(ramp(INPUT_CHUNK * (INPUT_BACKLOG + 2)), 16000, 1)
    assert.equal(c.dropped, INPUT_CHUNK * 2)
    let n = 0
    while (c.take()) n += 1
    assert.equal(n, INPUT_BACKLOG)
    c.push(ramp(100), 16000, 1)
    c.clear()
    c.push(ramp(INPUT_CHUNK - 100), 16000, 1)
    assert.equal(c.take(), undefined, 'a cleared chunker keeps nothing of the old holder')
  })

  it('frames output in 20 ms at 24 kHz and drops frames of an older generation', () => {
    const f = new OutputFramer()
    f.push(ramp(OUTPUT_FRAME * 2 + 10), 1)
    assert.equal(f.queued, 2)
    f.push(ramp(OUTPUT_FRAME), 2)
    assert.equal(f.next(2)?.length, OUTPUT_FRAME, 'generation 1 frames are skipped on the way')
    assert.equal(f.next(2), undefined)
    assert.equal(f.queued, 0)
  })

  it('holds a whole long reply, and past the bound refuses the newest frames, never the oldest', () => {
    const f = new OutputFramer()
    f.push(ramp(OUTPUT_FRAME * (OUTPUT_BACKLOG_FRAMES + 3)), 1)
    assert.equal(f.queued, OUTPUT_BACKLOG_FRAMES)
    assert.equal(f.dropped, 3)
    assert.deepEqual(f.next(1)?.slice(0, 2), ramp(OUTPUT_FRAME).slice(0, 2), 'the reply still starts at its start')
    f.clear()
    assert.equal(f.next(1), undefined, 'a clear leaves nothing to play')
  })

  it('once a turn overflows, the rest of it is refused whole, not let through in holes as the queue drains', () => {
    const f = new OutputFramer()
    f.push(ramp(OUTPUT_FRAME * (OUTPUT_BACKLOG_FRAMES + 1)), 1)
    assert.equal(f.dropped, 1)
    f.next(1)
    f.next(1)
    f.push(ramp(OUTPUT_FRAME * 2), 1)
    assert.equal(f.queued, OUTPUT_BACKLOG_FRAMES - 2, 'room freed by playback does not take the rest of that turn')
    assert.equal(f.dropped, 3)
    f.flush(1)
    f.push(ramp(OUTPUT_FRAME), 1)
    assert.equal(f.queued, OUTPUT_BACKLOG_FRAMES - 1, 'the next turn is queued again')
    f.push(ramp(OUTPUT_FRAME * 2), 1)
    assert.equal(f.dropped, 4, 'and refused again once the backlog is full')
    f.next(1)
    f.push(ramp(OUTPUT_FRAME), 2)
    assert.equal(f.queued, OUTPUT_BACKLOG_FRAMES, 'a new generation is a new reply')
  })

  it('at a turn’s end, queues its last partial frame padded with silence, and splices nothing onto the next', () => {
    const f = new OutputFramer()
    f.push(new Int16Array(OUTPUT_FRAME + 10).fill(7), 1)
    assert.equal(f.queued, 1)
    assert.equal(f.flush(1), true)
    assert.equal(f.flush(1), false, 'nothing left to flush')
    f.next(1)
    const last = f.next(1)
    assert.deepEqual(
      [last?.length, last?.[9], last?.[10], last?.[OUTPUT_FRAME - 1]],
      [OUTPUT_FRAME, 7, 0, 0],
      'the tail, then silence',
    )
    f.push(new Int16Array(OUTPUT_FRAME).fill(9), 1)
    assert.equal(f.next(1)?.[0], 9, 'the next reply starts with its own audio')
    f.push(new Int16Array(10).fill(7), 1)
    assert.equal(f.flush(2), false, 'a tail of a generation since cut is not played')
    assert.equal(f.queued, 0)
  })

  it('tallies one reply’s continuity: received, played, dropped and cleared, in ms, once', () => {
    const r = new ReplyAudio()
    assert.equal(r.end('played', 0, 0), null, 'no audio, no line')
    r.received(OUTPUT_FRAME * 3, 3, 5, 1000)
    r.received(OUTPUT_FRAME + 240, 4, 5, 1040)
    r.played()
    r.played()
    assert.equal(r.complete, false)
    r.generated()
    assert.equal(r.complete, true)
    assert.deepEqual(r.end('stopped', 2, 6), {
      ended: 'stopped',
      turns: 1,
      receivedMs: 90,
      arrivalMs: 40,
      playedMs: 40,
      droppedMs: 20,
      clearedMs: 40,
      maxQueuedMs: 80,
    })
    assert.equal(r.end('played', 0, 6), null, 'logged once')
  })

  it('a turn that begins before the last one played out joins its reply, which is complete only when both are', () => {
    const r = new ReplyAudio()
    r.received(OUTPUT_FRAME, 1, 0, 1000)
    r.generated()
    r.received(OUTPUT_FRAME, 2, 0, 1500)
    assert.equal(r.complete, false, 'the second turn has not ended')
    r.played()
    r.played()
    r.generated()
    assert.deepEqual(r.end('played', 0, 0), {
      ended: 'played',
      turns: 2,
      receivedMs: 40,
      arrivalMs: 500,
      playedMs: 40,
      droppedMs: 0,
      clearedMs: 0,
      maxQueuedMs: 40,
    })
  })

  it('tells sound Google may answer from a quiet room by its RMS level', () => {
    assert.equal(isAudible(new Int16Array(INPUT_CHUNK)), false, 'digital silence')
    assert.equal(isAudible(level(AUDIBLE_RMS - 1)), false, 'just under the floor')
    assert.equal(isAudible(level(AUDIBLE_RMS)), true, 'at the floor')
    assert.equal(isAudible(ramp(INPUT_CHUNK)), true, 'speech-level signal')
    assert.equal(isAudible(new Int16Array(0)), false)
  })
})
