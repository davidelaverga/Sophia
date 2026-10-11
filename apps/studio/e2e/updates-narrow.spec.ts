// Updates narrowed (docs/plans/updates-narrow.md): the digest by kind and by person, and a destination on every line,
// on the room fixture behind the vision flag.
import { expect, test, type Page } from '@playwright/test'

const since = (page: Page) => page.getByRole('region', { name: 'Since you last looked' })
const kinds = (page: Page) => since(page).getByRole('radiogroup', { name: 'Kind' })

test.beforeEach(async ({ page }) => {
  await page.goto('/room.html?place=updates')
  await expect(since(page).getByRole('region', { name: 'Decided' })).toBeVisible()
})

test('updates · narrowed by kind: the kinds with lines, each with its count; one kind alone; back to all', async ({
  page,
}) => {
  const radios = kinds(page).getByRole('radio')
  await expect(radios.first()).toHaveText(/^All$/)
  await expect(radios.filter({ hasText: /^Decided/ })).toHaveText(/Decided\s*1$/)
  await expect(radios.filter({ hasText: /^Still open/ })).toHaveText(/Still open\s*1$/)
  await expect(radios.filter({ hasText: /^Work/ })).toHaveCount(0) // nothing of that kind: no press for it
  await kinds(page)
    .getByRole('radio', { name: /Still open/ })
    .click()
  await expect(since(page).getByRole('region', { name: 'Decided' })).toHaveCount(0)
  await expect(since(page).getByRole('region', { name: 'Still open' })).toBeVisible()
  await expect(since(page).getByRole('button', { name: 'Mark as seen' })).toBeVisible() // the whole digest, still
  await kinds(page).getByRole('radio', { name: 'All' }).click()
  await expect(since(page).getByRole('region', { name: 'Decided' })).toBeVisible()
})

test('updates · narrowed by person: what Lucía proposed stays, what names nobody goes; back to everyone', async ({
  page,
}) => {
  await since(page).getByRole('button', { name: 'By everyone' }).click()
  await page.getByRole('menuitemradio', { name: 'Lucía' }).click()
  await expect(since(page).getByRole('button', { name: 'By Lucía' })).toBeVisible()
  await expect(since(page).getByRole('region', { name: 'Decided' })).toContainText('Keep the room checks on fixtures')
  await expect(since(page).getByRole('region', { name: 'Still open' })).toHaveCount(0)
  await since(page).getByRole('button', { name: 'By Lucía' }).click()
  await page.getByRole('menuitemradio', { name: 'Everyone' }).click()
  await expect(since(page).getByRole('region', { name: 'Still open' })).toBeVisible()
})

test('updates · every line goes where it lives: a decision to the brief, open in the Studio view', async ({ page }) => {
  const decided = since(page).getByRole('region', { name: 'Decided' })
  await expect(decided.getByRole('button', { name: 'In the brief' })).toHaveCount(1)
  await expect(
    since(page).getByRole('region', { name: 'Still open' }).getByRole('button', { name: 'In the brief' }),
  ).toHaveCount(1)
  await decided.getByRole('button', { name: 'In the brief' }).click()
  await expect(page.getByRole('link', { name: 'Studio' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.side-panel [role="tab"][aria-selected="true"]')).toHaveText(/Brief/)
})
