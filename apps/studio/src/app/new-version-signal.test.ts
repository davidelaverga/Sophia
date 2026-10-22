import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { newVersionSignal } from './new-version-signal.ts'

// A new version, heard from the first moment (docs/plans/new-version.md, Codex P2 on #415): Vite's word that a part is
// gone can come before the notice is drawn, so it is kept for it.
describe('a new version heard', () => {
  it('keeps a word that came before anyone listened', () => {
    const page = new EventTarget()
    const signal = newVersionSignal(page)
    assert.equal(signal.heard(), false)
    page.dispatchEvent(new Event('vite:preloadError'))
    assert.equal(signal.heard(), true)
  })

  it('tells a listener each word after, until it stops listening', () => {
    const page = new EventTarget()
    const signal = newVersionSignal(page)
    let words = 0
    const stop = signal.onHeard(() => {
      words += 1
    })
    page.dispatchEvent(new Event('vite:preloadError'))
    page.dispatchEvent(new Event('vite:preloadError'))
    stop()
    page.dispatchEvent(new Event('vite:preloadError'))
    assert.equal(words, 2)
  })

  // The notice reads `heard()` as it is drawn and listens only after (Codex P2 on #432): a word between the two must
  // still reach it, so a listener that comes after a word is told of it as it starts listening, once.
  it('tells a listener that comes after a word of that word, once', () => {
    const page = new EventTarget()
    const signal = newVersionSignal(page)
    page.dispatchEvent(new Event('vite:preloadError'))
    page.dispatchEvent(new Event('vite:preloadError'))
    let words = 0
    signal.onHeard(() => {
      words += 1
    })
    assert.equal(words, 1)
    page.dispatchEvent(new Event('vite:preloadError'))
    assert.equal(words, 2)
  })

  // A tab left open that asks the host for its version (version-probe.md) says the same word.
  it('hears the version probe’s word as it hears Vite’s', () => {
    const signal = newVersionSignal(new EventTarget())
    let words = 0
    signal.onHeard(() => {
      words += 1
    })
    signal.tell()
    assert.equal(signal.heard(), true)
    assert.equal(words, 1)
  })

  // «Esperar a que termine» (Luis 2026-10-22, version-probe.md): the probe's news waits while a call is on, and is said
  // once when the last call ends. Vite's word is a press that failed: it is said at once, call or not.
  it('keeps the probe’s word while a call holds it, and says it once when the call ends', () => {
    const page = new EventTarget()
    const signal = newVersionSignal(page)
    let words = 0
    signal.onHeard(() => {
      words += 1
    })
    const call = signal.holdWhile()
    signal.tell()
    signal.tell()
    assert.equal(signal.heard(), false, 'not during the call')
    assert.equal(words, 0)
    call()
    assert.equal(signal.heard(), true)
    assert.equal(words, 1, 'once, as the call ends')
    call()
    assert.equal(words, 1, 'a call ended twice says nothing more')
  })

  it('waits for every call that holds it, and says nothing at a call’s end when no word came', () => {
    const signal = newVersionSignal(new EventTarget())
    let words = 0
    signal.onHeard(() => {
      words += 1
    })
    const first = signal.holdWhile()
    first()
    assert.equal(words, 0, 'no word, nothing said')
    const one = signal.holdWhile()
    const two = signal.holdWhile()
    signal.tell()
    one()
    assert.equal(words, 0, 'another call still on')
    two()
    assert.equal(words, 1)
  })

  it('says Vite’s word at once, even during a call', () => {
    const page = new EventTarget()
    const signal = newVersionSignal(page)
    const call = signal.holdWhile()
    page.dispatchEvent(new Event('vite:preloadError'))
    assert.equal(signal.heard(), true)
    call()
  })
})
