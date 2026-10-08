import { expect, test, type Page } from '@playwright/test'

// Updates tells what happened (docs/plans/updates-digest.md): in the demo, «Since you last looked» names the readout
// made, the brief's own decision and open question, and what the meetings' people said. Every word is synthetic.

const PAGE = '/room.html?demo=1&place=updates'
const since = (page: Page) => page.getByRole('region', { name: 'Since you last looked' })
const part = (page: Page, name: string) => since(page).getByRole('region', { name })

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
