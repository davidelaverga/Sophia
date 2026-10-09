import { expect, test, type Locator, type Page } from '@playwright/test'

// Updates tells what happened (docs/plans/updates-digest.md): in the demo, «Since you last looked» names the readout
// made, the brief's own decision and open question, and what the meetings' people said. Every word is synthetic.

const PAGE = '/room.html?demo=1&place=updates'
const since = (page: Page) => page.getByRole('region', { name: 'Since you last looked' })
const part = (page: Page, name: string) => since(page).getByRole('region', { name })

/** Where an element's words are inked, not its box: a box may stretch across its track (the words', or a press's). */
const ink = (l: Locator) =>
  l.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const r = range.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('digest · in the demo, the readout made, the brief’s decision and open question, and what was said', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(part(page, 'Made')).toContainText('Pilot readout: what kept 12 of 14 teams')
  await expect(part(page, 'Decided')).toContainText('Reports open on the answer')
  await expect(part(page, 'Kept')).toContainText('Both teams that left changed their admin in week three.')
  await expect(part(page, 'Still open')).toContainText('Map first, list second')
  // The brief has no other decision: what Conversations shows is what Updates says.
  await expect(since(page)).not.toContainText('Translate the checklist')
  // What was made opens from beside its words, on their line, not from the column's far edge.
  const words = await ink(part(page, 'Made').locator('.recap-line').first())
  const open = await ink(part(page, 'Made').getByRole('button', { name: 'Open' }))
  expect(open.x - (words.x + words.width)).toBeGreaterThanOrEqual(0)
  expect(open.x - (words.x + words.width)).toBeLessThanOrEqual(24)
  expect(Math.abs(open.y + open.height / 2 - (words.y + words.height / 2))).toBeLessThanOrEqual(4)
})

test('digest · in the demo, the Oct 2 meeting’s recap says what was said', async ({ page }) => {
  await page.goto(PAGE)
  await page
    .getByRole('region', { name: 'Meetings' })
    .getByRole('button', { name: /^Oct 2/ })
    .click()
  await expect(page.getByRole('dialog', { name: 'This meeting' })).toContainText(
    'The second region starts on the translated checklist.',
  )
})

test('digest · in the demo, the meeting left now made nothing: the readout is the project’s, not this meeting’s', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&call=on')
  await page.getByRole('button', { name: 'Leave the room' }).click()
  const recap = page.getByRole('dialog', { name: 'This meeting' })
  // The recap read back first (the sheet opens while it is put together): then no «Made» in it.
  await expect(recap.getByRole('region', { name: 'Decided' })).toContainText('Run the pilot with fourteen teams')
  await expect(recap.getByRole('region', { name: 'Made' })).toHaveCount(0)
})
