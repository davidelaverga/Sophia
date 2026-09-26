// A multi-field Gemini Live server message: every field reaches its handler (architecture 06 §8).
import { LiveServerMessage } from '@google/genai'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dispatchServerMessage, type LiveHandlers } from './live-messages.ts'

function recorder(): { calls: string[]; h: LiveHandlers } {
  const calls: string[] = []
  const h: LiveHandlers = {
    setupComplete: () => calls.push('setup'),
    toolCalls: (c) => calls.push(`tools:${c.map((x) => x.name).join(',')}`),
    toolCancellations: (ids) => calls.push(`cancel:${ids.join(',')}`),
    interrupted: () => calls.push('interrupted'),
    audio: (_d, m) => calls.push(`audio:${m ?? ''}`),
    inputTranscript: (t, f) => calls.push(`in:${t}:${String(f)}`),
    outputTranscript: (t, f) => calls.push(`out:${t}:${String(f)}`),
    generationComplete: () => calls.push('generationComplete'),
    turnComplete: () => calls.push('turnComplete'),
    goAway: (t) => calls.push(`goAway:${t ?? ''}`),
    resumption: (handle, ok) => calls.push(`resume:${handle ?? 'none'}:${String(ok)}`),
    usage: (u) => calls.push(`usage:${u.totalTokenCount ?? 0}`),
  }
  return { calls, h }
}

describe('Gemini Live message dispatch', () => {
  it('handles every field of one message, interruption before audio and audio before turn completion', () => {
    const { calls, h } = recorder()
    const msg = Object.assign(new LiveServerMessage(), {
      toolCall: { functionCalls: [{ id: 'c1', name: 'project_status', args: {} }] },
      toolCallCancellation: { ids: ['c0'] },
      serverContent: {
        interrupted: true,
        modelTurn: { parts: [{ inlineData: { data: 'AAA=', mimeType: 'audio/pcm;rate=24000' } }] },
        inputTranscription: { text: 'hello', finished: true },
        outputTranscription: { text: 'hi' },
        generationComplete: true,
        turnComplete: true,
      },
      goAway: { timeLeft: '10s' },
      sessionResumptionUpdate: { newHandle: 'h2', resumable: true },
      usageMetadata: { totalTokenCount: 42 },
    })
    dispatchServerMessage(msg, h)
    assert.deepEqual(calls, [
      'tools:project_status',
      'cancel:c0',
      'interrupted',
      'audio:audio/pcm;rate=24000',
      'in:hello:true',
      'out:hi:false',
      'generationComplete',
      'turnComplete',
      'goAway:10s',
      'resume:h2:true',
      'usage:42',
    ])
  })

  it('a non-resumable update carries no handle', () => {
    const { calls, h } = recorder()
    const msg = Object.assign(new LiveServerMessage(), {
      setupComplete: {},
      sessionResumptionUpdate: { newHandle: 'x', resumable: false },
    })
    dispatchServerMessage(msg, h)
    assert.deepEqual(calls, ['setup', 'resume:none:false'])
  })
})
