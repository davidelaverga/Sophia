import { expect, test, type Locator, type Page } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

// The work views keep to the app's type scale (docs/plans/type-stragglers.md): the four text sizes (label 10.5, small 12,
// body 13, title 14) and the headings' (15, 16, 18, 20); no 11, 12.5 or 13.5 left from before the scale. The fixture's
// own «Demo» label is the page's, not the app's.

/**
 * Each view, and what is on screen once it has drawn: a part for each read that fills it, the last of a chain
 * included (Knowledge's covers draw three reads after its list; Conversations' thread after its list).
 */
const VIEWS: readonly (readonly [string, string, readonly ((page: Page) => Locator)[]])[] = [
  ['the room', '/room.html?demo=1', [(page) => page.getByText('The room is ready')]],
  [
    'Knowledge',
    '/room.html?demo=1&place=knowledge',
    [
      (page) => page.getByText('Pilot readout: what kept 12 of 14 teams').first(),
      (page) => page.locator('.report-cover-page').first(),
    ],
  ],
  [
    'Updates',
    '/room.html?demo=1&place=updates',
    [(page) => page.getByText('Reports open on the answer'), (page) => page.getByText('38 min')],
  ],
  [
    'Conversations',
    '/room.html?demo=1&conversations=1&place=conversations',
    [
      // A message no row shows as its last: only the thread's own read brings it.
      (page) => page.getByRole('region', { name: 'Messages' }).getByText('Added them, cited.'),
      (page) => page.getByText('Map first, list second'),
    ],
  ],
]
const SCALE = ['10.5px', '12px', '13px', '14px', '15px', '16px', '18px', '20px']

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

for (const [name, url, drawn] of VIEWS) {
  test(`type · ${name} keeps to the app's scale, its bar too`, async ({ page }) => {
    await page.goto(url)
    // The view has drawn: the bar's Invite (the membership's read), and what each of the view's reads brings. Never
    // «the network is idle»: a fixture page keeps loading as it draws, and a quiet moment may not come in time.
    await expect(page.getByRole('button', { name: 'Invite' })).toBeVisible()
    for (const part of drawn) await expect(part(page)).toBeVisible()
    await page.evaluate(() => document.querySelector('.fixture-label')?.remove())
    const sizes = await typeSizes(page, 'body')
    for (const s of sizes) expect(SCALE, sizes.join(' ')).toContain(s)
  })
}
