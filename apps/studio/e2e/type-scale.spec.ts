import { expect, test } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

// The work views keep to the app's type scale (docs/plans/type-stragglers.md): the four text sizes (label 10.5, small 12,
// body 13, title 14) and the headings' (15, 16, 18, 20); no 11, 12.5 or 13.5 left from before the scale. The fixture's
// own «Demo» label is the page's, not the app's.

/** Each view, and what is on screen once it has drawn: one text per read that fills it. */
const VIEWS = [
  ['the room', '/room.html?demo=1', ['The room is ready']],
  ['Knowledge', '/room.html?demo=1&place=knowledge', ['Pilot readout: what kept 12 of 14 teams']],
  ['Updates', '/room.html?demo=1&place=updates', ['Reports open on the answer', '38 min']],
  [
    'Conversations',
    '/room.html?demo=1&conversations=1&place=conversations',
    ['Let’s look at it together tomorrow.', 'Map first, list second'],
  ],
] as const
const SCALE = ['10.5px', '12px', '13px', '14px', '15px', '16px', '18px', '20px']

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

for (const [name, url, drawn] of VIEWS) {
  test(`type · ${name} keeps to the app's scale, its bar too`, async ({ page }) => {
    await page.goto(url)
    // The view has drawn: its heading, and what each of its reads brings (never «the network is idle»: a fixture page
    // keeps loading as it draws, and a quiet moment may not come in time on a slow runner).
    await expect(page.getByRole('heading').first()).toBeVisible()
    for (const words of drawn) await expect(page.getByText(words).first()).toBeVisible()
    await page.evaluate(() => document.querySelector('.fixture-label')?.remove())
    const sizes = await typeSizes(page, 'body')
    for (const s of sizes) expect(SCALE, sizes.join(' ')).toContain(s)
  })
}
