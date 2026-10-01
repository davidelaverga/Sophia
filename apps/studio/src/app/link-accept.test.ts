import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { linkAcceptance, type SessionPort } from './link-accept.ts'

const WAIT_MS = 20
const UNASKED = (_signedIn: boolean) => undefined

/** An Auth service that answers when told to, counting what it was asked; its sign-out may leave the session. */
function auth(signsOut = true) {
  let answer: (signedIn: boolean) => void = UNASKED
  const asked = { set: 0, signOut: 0 }
  const port: SessionPort = {
    set: () => {
      asked.set += 1
      return new Promise((resolve) => {
        answer = resolve
      })
    },
    signOut: () => {
      asked.signOut += 1
      return signsOut ? Promise.resolve() : Promise.reject(new Error('still on this device'))
    },
  }
  return { port, asked, answer: (signedIn: boolean) => answer(signedIn) }
}

/** The acceptance, or "still waiting" when it hasn't settled well after its own wait: a hang fails, it never hangs. */
const settle = <T>(work: Promise<T>) =>
  Promise.race([work, new Promise<'still waiting'>((resolve) => setTimeout(() => resolve('still waiting'), 200))])

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('signing in with a link’s session', () => {
  it('is in once the Auth service sets it, and refused when it refuses', async () => {
    const yes = auth()
    const accepting = linkAcceptance(yes.port, WAIT_MS).accept()
    yes.answer(true)
    assert.equal(await accepting, 'in')
    const no = auth()
    const refusing = linkAcceptance(no.port, WAIT_MS).accept()
    no.answer(false)
    assert.equal(await refusing, 'refused')
  })

  it('gives the offer back when the Auth service doesn’t answer, and a retry waits on the same attempt', async () => {
    const silent = auth()
    const offer = linkAcceptance(silent.port, WAIT_MS)
    assert.equal(await settle(offer.accept()), 'late')
    const again = offer.accept()
    silent.answer(true)
    assert.equal(await settle(again), 'in')
    assert.equal(silent.asked.set, 1, 'one attempt, not two')
  })

  it('signs out a session that lands after the person said it isn’t theirs, and shows nothing of it meanwhile', async () => {
    const slow = auth()
    const offer = linkAcceptance(slow.port, WAIT_MS)
    assert.equal(await settle(offer.accept()), 'late')
    assert.equal(offer.decline(), true, 'an attempt is still under way')
    assert.equal(offer.refusing(), true)
    slow.answer(true)
    await tick()
    assert.equal(slow.asked.signOut, 1)
    assert.equal(offer.refusing(), false)
  })

  it('keeps refusing a declined session it couldn’t sign out, so it never shows', async () => {
    const stuck = auth(false)
    const offer = linkAcceptance(stuck.port, WAIT_MS)
    await settle(offer.accept())
    offer.decline()
    stuck.answer(true)
    await tick()
    assert.deepEqual([stuck.asked.signOut, offer.refusing()], [1, true])
  })

  it('refuses nothing once a declined attempt fails, and nothing when none was made', async () => {
    const failing = auth()
    const offer = linkAcceptance(failing.port, WAIT_MS)
    await settle(offer.accept())
    offer.decline()
    failing.answer(false)
    await tick()
    assert.deepEqual([offer.refusing(), failing.asked.signOut], [false, 0])
    const untouched = linkAcceptance(auth().port, WAIT_MS)
    assert.equal(untouched.decline(), false)
    assert.equal(untouched.refusing(), false)
  })
})
