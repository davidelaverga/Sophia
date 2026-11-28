import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError, toError } from '../../api/client.ts'
import type { ConversationAsk, MessageAsk } from '../../api/conversations.ts'
import { isAddressedWrite, useHeldWrite, type Held } from './held-write.ts'
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

/** The view's held intent and safe refusal, read again as a rerender would read them. */
function view<A>(initial: Held<A> | null = null) {
  const state: { held: Held<A> | null; words: string | null; refusals: number } = {
    held: initial,
    words: null,
    refusals: 0,
  }
  const onHeld = (held: Held<A> | null) => {
    state.held = held
  }
  const response = {
    words: null,
    onWords: (words: string | null) => {
      state.words = words
    },
    say: () => {
      state.refusals += 1
      return 'That didn’t go through. Try again.'
    },
  }
  return { state, onHeld, refusal: response }
}

const addressed: readonly [string, ConversationAsk | MessageAsk][] = [
  [
    'start',
    {
      title: 'Synthetic question',
      text: 'Synthetic context',
      askSophia: false,
      addressingVersion: 1,
      mentions: ['synthetic-member'],
      artifactVersionId: 'synthetic-version',
    },
  ],
  [
    'send',
    {
      text: 'Synthetic reply',
      askSophia: false,
      addressingVersion: 1,
      mentions: ['synthetic-member'],
      artifactVersionId: 'synthetic-version',
      replyToMessageId: 'synthetic-target',
    },
  ],
]

const projectionUnavailable = () =>
  toError(
    Response.json(
      {
        code: 'projection_unavailable',
        message: 'Synthetic unavailable projection',
        retry: 'never',
        requestId: '00000000-0000-4000-8000-000000000001',
      },
      { status: 503 },
    ),
    'admission',
  )

describe('addressed held writes through a disabled route', () => {
  for (const [kind, ask] of addressed) {
    it(`${kind}: unavailable replay retains the exact key and body until an explicit retry succeeds`, async () => {
      const v = view<ConversationAsk | MessageAsk>()
      const sent: { key: string; ask: ConversationAsk | MessageAsk }[] = []
      const send = async (key: string, body: ConversationAsk | MessageAsk) => {
        sent.push({ key, ask: body })
        if (sent.length === 1) throw new TypeError('Synthetic lost response')
        if (sent.length === 2)
          throw await toError(Response.json({ message: 'Route unavailable' }, { status: 404 }), 'admission')
        if (sent.length === 3) throw await projectionUnavailable()
        return 'original receipt'
      }
      const useWrite = () => useHeldWrite(v.state.held, v.onHeld, send, v.refusal, isAddressedWrite(v.state.held))
      assert.equal(await useWrite().run(ask), undefined)
      const original = v.state.held
      assert.ok(original)
      const changed = { ...ask, text: 'Different unsent draft', mentions: [] }
      for (let retry = 0; retry < 2; retry += 1) {
        assert.equal(await useWrite().run(changed), undefined)
        assert.deepEqual(v.state.held, original)
        assert.equal(useWrite().unknown, ask)
        assert.equal(v.state.words, null, 'the existing unknown state supplies the message')
      }
      assert.equal(await useWrite().run(changed), 'original receipt')
      assert.equal(v.state.held, null)
      assert.equal(v.state.refusals, 0)
      assert.equal(sent.length, 4, 'no automatic retry')
      for (const call of sent) {
        assert.equal(call.key, original.key)
        assert.equal(call.ask, ask, 'mentions, reply target, version and words remain the exact held body')
      }
    })

    for (const [status, code] of [
      [404, 'not_found'],
      [404, 'http_404'],
      [403, 'forbidden'],
      [409, 'conflict'],
      [422, 'not_found'],
      [422, 'projection_unavailable'],
      [503, 'http_404'],
    ] as const) {
      it(`${kind}: typed refusal ${status}/${code} settles without disclosing its body`, async () => {
        const v = view({ key: 'original-key', ask, sending: false })
        const error = await toError(
          Response.json(
            {
              code,
              message: 'Synthetic private target details',
              retry: 'never',
              requestId: '00000000-0000-4000-8000-000000000001',
            },
            { status },
          ),
          'admission',
        )
        assert.equal(error.unstructuredHttp, false, 'a typed code never proves an unavailable route')
        const send = () => Promise.reject(error)
        assert.equal(await useHeldWrite(v.state.held, v.onHeld, send, v.refusal, true).run(ask), undefined)
        assert.equal(v.state.held, null)
        assert.equal(v.state.refusals, 1)
        assert.equal(v.state.words, 'That didn’t go through. Try again.')
        assert.doesNotMatch(v.state.words, /private|target details/)
      })
    }

    it(`${kind}: a matching synthetic ApiError without fallback provenance remains definitive`, async () => {
      const v = view({ key: 'original-key', ask, sending: false })
      const error = new ApiError(404, 'http_404', `${kind}: synthetic missing route`, 'never')
      assert.equal(error.unstructuredHttp, false)
      const send = () => Promise.reject(error)
      await useHeldWrite(v.state.held, v.onHeld, send, v.refusal, true).run(ask)
      assert.equal(v.state.held, null)
      assert.equal(v.state.refusals, 1)
    })

    it(`${kind}: a fresh addressed 404 is definitive even with the route policy enabled`, async () => {
      const v = view<ConversationAsk | MessageAsk>()
      const error = await toError(
        Response.json({ message: `${kind}: route unavailable` }, { status: 404 }),
        'admission',
      )
      assert.equal(error.unstructuredHttp, true)
      const send = () => Promise.reject(error)
      await useHeldWrite(v.state.held, v.onHeld, send, v.refusal, true).run(ask)
      assert.equal(v.state.held, null)
      assert.equal(v.state.refusals, 1)
    })
  }

  it('settles a fresh addressed or held legacy write on projection_unavailable', async () => {
    const addressedAsk = addressed[0]?.[1]
    assert.ok(addressedAsk)
    const legacyAsk = { text: 'Legacy message', askSophia: true }
    for (const [held, ask] of [
      [null, addressedAsk],
      [{ key: 'legacy', ask: legacyAsk, sending: false }, legacyAsk],
    ] as const) {
      const v = view<ConversationAsk | MessageAsk>(held)
      const error = await projectionUnavailable()
      const send = () => Promise.reject(error)
      await useHeldWrite(v.state.held, v.onHeld, send, v.refusal, held === null).run(ask)
      assert.equal(v.state.held, null)
      assert.equal(v.state.refusals, 1)
    }
  })

  for (const ask of ['synthetic other write', { text: 'Legacy message', askSophia: true }]) {
    it(`a legacy or other held write keeps its existing definitive 404 behavior: ${typeof ask}`, async () => {
      const v = view({ key: 'original-key', ask, sending: false })
      const error = await toError(
        Response.json({ message: `${typeof ask}: route unavailable` }, { status: 404 }),
        'admission',
      )
      assert.equal(error.unstructuredHttp, true)
      const send = () => Promise.reject(error)
      await useHeldWrite(v.state.held, v.onHeld, send, v.refusal).run(ask)
      assert.equal(v.state.held, null)
      assert.equal(v.state.refusals, 1)
    })
  }
})
