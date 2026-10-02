import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { linkAcceptance, startOver } from './link-accept.ts'

const WAIT_MS = 20
const UNASKED = (_signedIn: boolean) => undefined

/** An Auth service that answers when told to, counting the sign-ins it was asked for. */
function auth() {
  let answer: (signedIn: boolean) => void = UNASKED
  const asked = { set: 0 }
  const set = () => {
    asked.set += 1
    return new Promise<boolean>((resolve) => {
      answer = resolve
    })
  }
  return { set, asked, answer: (signedIn: boolean) => answer(signedIn) }
}

/** The acceptance, or "still waiting" when it hasn't settled well after its own wait: a hang fails, it never hangs. */
const settle = <T>(work: Promise<T>) =>
  Promise.race([work, new Promise<'still waiting'>((resolve) => setTimeout(() => resolve('still waiting'), 200))])

describe('signing in with a link’s session', () => {
  it('is in once the Auth service sets it, and refused when it refuses', async () => {
    const yes = auth()
    const accepting = linkAcceptance(yes.set, WAIT_MS).accept()
    yes.answer(true)
    assert.equal(await accepting, 'in')
    const no = auth()
    const refusing = linkAcceptance(no.set, WAIT_MS).accept()
    no.answer(false)
    assert.equal(await refusing, 'refused')
  })

  it('says it is late when the Auth service doesn’t answer, and the same attempt can still land', async () => {
    const silent = auth()
    const offer = linkAcceptance(silent.set, WAIT_MS)
    assert.equal(await settle(offer.accept()), 'late')
    const again = offer.accept()
    silent.answer(true)
    assert.equal(await settle(again), 'in')
    assert.equal(silent.asked.set, 1, 'one attempt: a second would spend the same refresh token')
  })

  it('hands the press a refusal that comes after the wait, so it never stays "Signing in…"', async () => {
    const slow = auth()
    const offer = linkAcceptance(slow.set, WAIT_MS)
    assert.equal(await settle(offer.accept()), 'late')
    const later = offer.outcome()
    slow.answer(false)
    assert.equal(await settle(later), 'refused')
    assert.equal(slow.asked.set, 1, 'the same attempt: nothing is asked again')
  })
})

/** A page at `href`, and the addresses it is asked to load. */
function page(href: string) {
  const loads: string[] = []
  return { location: { href, assign: (to: string) => void loads.push(to) }, loads }
}

describe('starting over from a slow link', () => {
  it('loads the same place again, so an invitation goes on (never the root)', () => {
    const { location, loads } = page('https://studio.example/join?invite=abc')
    startOver(location)
    assert.deepEqual(loads, ['/join?invite=abc'])
  })

  it('never carries a link’s session or its answer back into the address', () => {
    const { location, loads } = page('https://studio.example/join?invite=abc&code=x#access_token=a&refresh_token=b')
    startOver(location)
    assert.deepEqual(loads, ['/join?invite=abc'])
  })
})
