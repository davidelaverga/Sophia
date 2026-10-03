import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { modelLook } from './models.ts'

describe('a model as people say it', () => {
  it('names each family and gives it its colour', () => {
    assert.deepEqual(modelLook('claude-opus-5-5'), { label: 'Opus 5.5', family: 'opus' })
    assert.deepEqual(modelLook('claude-sonnet-5-5'), { label: 'Sonnet 5.5', family: 'sonnet' })
    assert.deepEqual(modelLook('claude-haiku-4-5-20251001'), { label: 'Haiku 4.5', family: 'haiku' })
    assert.deepEqual(modelLook('gpt-5-codex'), { label: 'GPT-5 Codex', family: 'gpt' })
    assert.deepEqual(modelLook('gpt-5.1'), { label: 'GPT-5.1', family: 'gpt' })
    assert.deepEqual(modelLook('gemini-2.5-pro'), { label: 'Gemini 2.5 Pro', family: 'gemini-pro' })
    assert.deepEqual(modelLook('gemini-2.5-flash'), { label: 'Gemini 2.5 Flash', family: 'gemini-flash' })
    assert.deepEqual(modelLook('grok-4'), { label: 'Grok 4', family: 'grok' })
  })

  it('keeps a model it doesn’t know as its own id, in a neutral colour', () => {
    assert.deepEqual(modelLook('mistral-large-2'), { label: 'mistral-large-2', family: 'other' })
  })
})
