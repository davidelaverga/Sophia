import { expect, test } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'
import { typeSizes } from './type-sizes.ts'

// The work views keep to the app's type scale (docs/plans/type-stragglers.md): the four text sizes (label 10.5, small 12,
// body 13, title 14) and the headings' (15, 16, 18, 20); no 11, 12.5 or 13.5 left from before the scale. The fixture's
// own «Demo» label is the page's, not the app's. Home and the personal space keep to it too
// (docs/plans/type-places.md), on a phone as on a wide screen; only Home's greeting is a size of its own, a display line
// that grows with the screen.

const VIEWS = [
  ['the room', '/room.html?demo=1', DRAWN.room],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates],
  ['Conversations', '/room.html?demo=1&conversations=1&place=conversations', DRAWN.conversations],
] as const
const SCALE = ['10.5px', '12px', '13px', '14px', '15px', '16px', '18px', '20px']

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

for (const [name, url, parts] of VIEWS) {
  test(`type · ${name} keeps to the app's scale, its bar too`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    await page.evaluate(() => document.querySelector('.fixture-label')?.remove())
    const sizes = await typeSizes(page, 'body')
    for (const s of sizes) expect(SCALE, sizes.join(' ')).toContain(s)
  })
}

const PLACES = [
  ['Home', '/home.html?demo=1', DRAWN.home],
  ['the personal space', '/personal.html?demo=1', DRAWN.personal],
] as const

for (const [name, url, parts] of PLACES) {
  for (const phone of [false, true]) {
    test(`type${phone ? ' @phone' : ''} · ${name} keeps to the app's scale`, async ({ page }) => {
      await page.goto(url)
      await drawn(page, parts)
      // The fixture's label is the page's; Home's greeting is its one display size.
      await page.evaluate(() => document.querySelectorAll('.fixture-label, .hw-hello').forEach((el) => el.remove()))
      const sizes = await typeSizes(page, 'body')
      for (const s of sizes) expect(SCALE, sizes.join(' ')).toContain(s)
    })
  }
}
