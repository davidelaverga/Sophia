import assert from 'node:assert/strict'
import { describe, it, type TestContext } from 'node:test'
import { ASK_LIMIT_MS, askedAgain, asking, type Ask, type AskEvent, type Question } from './ask.ts'
import { asksOf, sendQuestion, subscribe } from './ask-store.ts'

const question = (id: string): Question => ({
  question_id: id,
  work_id: 'w',
  plan_id: 'p',
  plan_revision: 1,
  candidate_version_ref: null,
  text: 'Why is it waiting?',
})
let n = 0
/** A space of its own for each check: the store lives as long as the module. */
const fresh = () => `ask-store-test-${String(++n)}`

/** The conversation, as the check speaks for it: each send's listener, kept in order. */
function conversation() {
  const listeners: ((e: AskEvent) => void)[] = []
  const port: Ask = (_question, on) => {
    listeners.push(on)
  }
  return { port, say: (send: number, e: AskEvent) => listeners[send - 1]?.(e) }
}

/** How many times the store tells its listeners anything, from now until stopped. */
function told() {
  const heard = { count: 0 }
  const stop = subscribe(() => {
    heard.count += 1
  })
  return { heard, stop }
}

/** The waits begun and not yet ended or cleared, counted around the (mocked) timers the store uses. */
function waits(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const begin = globalThis.setTimeout
  const end = globalThis.clearTimeout
  const live = new Set<ReturnType<typeof setTimeout>>()
  t.mock.method(globalThis, 'setTimeout', (fn: () => void, ms?: number) => {
    const id = begin(() => {
      live.delete(id)
      fn()
    }, ms)
    live.add(id)
    return id
  })
  t.mock.method(globalThis, 'clearTimeout', (id?: ReturnType<typeof setTimeout>) => {
    if (id !== undefined) live.delete(id)
    end(id)
  })
  return live
}

const chunk = (id: string, seq: number): AskEvent => ({ question_id: id, seq, kind: 'chunk', text: 'more ' })

describe('one wait per send of a question (Codex F-031)', () => {
  it('after 200 chunks and the whole answer, nothing is left waiting, and nothing more is told', (t) => {
    const live = waits(t)
    const space = fresh()
    const talk = conversation()
    sendQuestion(space, asking(question('q1')), talk.port)
    for (let seq = 1; seq <= 200; seq++) talk.say(1, chunk('q1', seq))
    assert.equal(live.size, 1) // one wait, begun again by each chunk
    talk.say(1, { question_id: 'q1', seq: 201, kind: 'complete', text: 'Whole.' })
    assert.equal(live.size, 0)
    assert.equal(asksOf(space).w?.state, 'answered')
    const { heard, stop } = told()
    t.mock.timers.tick(ASK_LIMIT_MS * 3)
    stop()
    assert.equal(heard.count, 0)
    assert.equal(asksOf(space).w?.answer, 'Whole.')
  })

  it('fails 30 s after the last event that moved the answer on: a repeat, or another question’s, puts nothing off', (t) => {
    const live = waits(t)
    const space = fresh()
    const talk = conversation()
    sendQuestion(space, asking(question('q1')), talk.port)
    talk.say(1, chunk('q1', 1))
    t.mock.timers.tick(20_000)
    talk.say(1, chunk('q1', 1)) // a repeat
    talk.say(1, chunk('q0', 2)) // another question's
    assert.equal(live.size, 1)
    t.mock.timers.tick(ASK_LIMIT_MS - 20_000 - 1)
    assert.equal(asksOf(space).w?.state, 'answering')
    t.mock.timers.tick(1)
    assert.deepEqual(
      [asksOf(space).w?.state, asksOf(space).w?.reason],
      ['failed', 'No answer came in time. Nothing was changed.'],
    )
  })

  it('a send that ended as said, failed or unavailable, leaves nothing waiting', (t) => {
    const live = waits(t)
    for (const kind of ['failed', 'unavailable'] as const) {
      const space = fresh()
      const talk = conversation()
      sendQuestion(space, asking(question('q1')), talk.port)
      talk.say(1, { question_id: 'q1', seq: 1, kind, text: 'Not now.' })
      assert.equal(live.size, 0)
      const { heard, stop } = told()
      t.mock.timers.tick(ASK_LIMIT_MS * 2)
      stop()
      assert.deepEqual([heard.count, asksOf(space).w?.state], [0, kind])
    }
  })

  it('a send another took the place of says nothing when its wait ends; Ask again’s next send waits its own', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const space = fresh()
    const talk = conversation()
    sendQuestion(space, asking(question('q1')), talk.port)
    t.mock.timers.tick(10_000)
    sendQuestion(space, asking(question('q2')), talk.port) // a new question for the same task, at 10 s
    const { heard, stop } = told()
    t.mock.timers.tick(20_000) // 30 s: q1's wait ends, q1 no longer the task's
    assert.equal(heard.count, 0)
    t.mock.timers.tick(10_000) // 40 s: q2's own wait ends
    assert.deepEqual([heard.count, asksOf(space).w?.question.question_id, asksOf(space).w?.state], [1, 'q2', 'failed'])
    // Asked again, the next send has its own wait: 30 s from now, not before.
    const failed = asksOf(space).w
    if (!failed) throw new Error('no question')
    sendQuestion(space, askedAgain(failed), talk.port)
    t.mock.timers.tick(ASK_LIMIT_MS - 1)
    assert.equal(asksOf(space).w?.state, 'waiting')
    t.mock.timers.tick(1)
    assert.equal(asksOf(space).w?.state, 'failed')
    stop()
  })
})
