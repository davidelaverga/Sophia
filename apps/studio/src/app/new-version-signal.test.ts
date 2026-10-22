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
})
