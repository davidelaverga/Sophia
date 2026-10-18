import { expect, test, type Page } from '@playwright/test'

// R-C1 r4307386729 (controlled room fixture, synthetic people and answers): the design task as its own card on Work
// (`designcard=on&designed=on`), read through the real owned task helper and query cache. Its own read refused (a 403) shows only
// that refusal and its retry, never the fallback Designing status or the design's header; a later allowed read set
// out by Try again restores it; an ordinary 503 is not a refusal; an allowed read shows its normal state.

const DESIGN_TASK = '00000000-0000-4000-8000-0000000000e2'
const card = (page: Page) => page.locator(`.work-card[data-task="${DESIGN_TASK}"]`)
const REFUSED = 'This task isn’t available to you.'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('design refusal · an allowed read shows the design’s own state and header', async ({ page }) => {
  await page.goto('/room.html?place=work&designcard=on&designed=on')
  await expect(card(page)).toHaveAttribute('data-state', 'published')
  await expect(card(page)).toContainText('HTML page design · from report v1')
  await expect(card(page)).not.toContainText(REFUSED)
})

test('design refusal · its own read refused shows only the refusal; Try again, allowed, restores it', async ({
  page,
}) => {
  await page.goto('/room.html?place=work&designcard=on&designed=on&designfail=forbidden')
  await expect(card(page)).toContainText(REFUSED)
  await expect(card(page)).toHaveAttribute('data-state', 'refused')
  await expect(card(page)).not.toContainText('Designing')
  await expect(card(page)).not.toContainText('HTML page design')
  await page.evaluate(() => window.fixture?.failDesign(false))
  await card(page).getByRole('button', { name: 'Try again' }).click()
  await expect(card(page)).toHaveAttribute('data-state', 'published')
  await expect(card(page)).toContainText('HTML page design · from report v1')
  await expect(card(page)).not.toContainText(REFUSED)
})

test('design refusal · an ordinary 503 is not a refusal', async ({ page }) => {
  await page.goto('/room.html?place=work&designcard=on&designed=on&designfail=unavailable')
  await expect
    .poll(async () => (await page.evaluate(() => [...(window.fixture?.served ?? [])])).includes('design:unavailable'))
    .toBe(true)
  await expect(card(page)).toBeVisible()
  await expect(card(page)).not.toContainText(REFUSED)
  await expect(card(page)).not.toHaveAttribute('data-state', 'refused')
})
