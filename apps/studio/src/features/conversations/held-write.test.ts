import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { useHeldWrite, type Held } from './held-write.ts'
import { forgetKept } from './talk-store.ts'

const refusal = { words: null, onWords: () => undefined, say: () => 'refused' }

/** A write whose reply comes only when the check lets it (`answer`). */
function pending() {
  const reply: { answer?: (value: string) => void } = {}
  const send = () =>
    new Promise<string>((resolve) => {
      reply.answer = resolve
    })
  return { send, answer: (value: string) => reply.answer?.(value) }
}

describe('useHeldWrite', () => {
  it('a reply to the account still here is what the press gets', async () => {
    const held: (Held<string> | null)[] = []
    const write = pending()
    const run = useHeldWrite<string, string>(null, (h) => held.push(h), write.send, refusal).run('words')
    write.answer('receipt')
    assert.equal(await run, 'receipt')
    assert.equal(held.at(-1), null)
  })

  it('a reply after the account was forgotten (signed out, another identity) leads to nothing on the page', async () => {
    const write = pending()
    const run = useHeldWrite<string, string>(null, () => undefined, write.send, refusal).run('words')
    forgetKept()
    write.answer('receipt')
    assert.equal(await run, undefined)
  })
})
