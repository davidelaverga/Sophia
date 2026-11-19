import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ownHistory, stepBack } from './own-history.ts'

/** A Navigation API with `count` entries, the current one at `index`; each traverseTo is noted, settled by `settle`. */
function navigation(count: number, index: number, settle: () => Promise<unknown> = () => Promise.resolve()) {
  const keys = Array.from({ length: count }, (_, i) => `k${String(i)}`)
  const went: string[] = []
  const nav = {
    currentEntry: { index },
    entries: () => keys.map((key) => ({ key })),
    traverseTo: (key: string) => {
      went.push(key)
      return { committed: settle(), finished: settle() }
    },
  }
  return { nav, went }
}

describe('the page’s own entries in the tab’s history (own-history.ts)', () => {
  it('has the Navigation API only where the browser has the whole of what a step needs', () => {
    const { nav } = navigation(3, 2)
    assert.equal(ownHistory({ navigation: nav }), nav)
    assert.equal(ownHistory({}), null, 'Safari 16.4: no Navigation API at all')
    assert.equal(ownHistory({ navigation: undefined }), null)
    assert.equal(ownHistory({ navigation: null }), null)
    assert.equal(ownHistory({ navigation: { ...nav, currentEntry: null } }), null, 'no current entry')
    assert.equal(ownHistory({ navigation: { ...nav, traverseTo: undefined } }), null, 'no step to an entry')
    assert.equal(ownHistory({ navigation: { ...nav, entries: undefined } }), null, 'no entries')
  })

  it('steps straight to the page’s own entry n back, whatever the frames added', () => {
    const { nav, went } = navigation(4, 3)
    const step = stepBack(2, { navigation: nav })
    assert.ok(step)
    assert.deepEqual(went, [], 'nothing moves until the step is taken')
    step()
    assert.deepEqual(went, ['k1'])
  })

  it('gives no step where the API can’t reach the entry n back: the viewer then changes its address in place', () => {
    assert.equal(stepBack(2, { navigation: navigation(4, 1).nav }), null, 'fewer entries behind than the step')
    assert.equal(stepBack(1, { navigation: { ...navigation(4, 3).nav, entries: () => [] } }), null, 'none listed')
    assert.equal(stepBack(1, { navigation: navigation(4, -1).nav }), null, 'the current entry not among them')
  })

  it('without the API, steps through the tab’s history, where no frame moves (HtmlView)', () => {
    assert.equal(typeof stepBack(1, {}), 'function')
  })

  it('a step another navigation overtakes leaves no unhandled rejection', async () => {
    const unhandled: unknown[] = []
    const note = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', note)
    try {
      const { nav } = navigation(2, 1, () => Promise.reject(new DOMException('overtaken', 'AbortError')))
      stepBack(1, { navigation: nav })?.()
      await new Promise((settled) => setTimeout(settled, 10))
      assert.deepEqual(unhandled, [])
    } finally {
      process.off('unhandledRejection', note)
    }
  })
})
