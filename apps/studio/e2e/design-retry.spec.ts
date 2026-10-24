import { expect, test, type Page } from '@playwright/test'

// A42 (FND-B-HTML-RETAINED-RECOVERY-01, controlled room fixture, synthetic people and answers): a failed HTML design as
// its own card on Work (`designcard=on&designretry=…`). Its editor is offered Try again only under the owner's fresh spend
// approval, which the retry names; a stale or closed approval is said, with no button. A lost reply is sent again under
// the same key, so it is the same retry.

const DESIGN_TASK = '00000000-0000-4000-8000-0000000000e2'
const card = (page: Page) => page.locator(`.work-card[data-task="${DESIGN_TASK}"]`)
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const retries = async (page: Page) => (await served(page)).filter((s) => s.startsWith('html-retry:'))

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('design retry · under a fresh approval, Try again names it; a lost reply is the same retry when sent again', async ({
  page,
}) => {
  await page.goto('/room.html?place=work&designcard=on&designretry=fresh')
  await expect(card(page)).toHaveAttribute('data-state', 'failed')
  await expect(card(page)).toContainText('the renderer’s width sweep timed out')
  await page.evaluate(() => window.fixture?.loseRetry())
  await card(page).getByRole('button', { name: 'Try again' }).click()
  await expect(card(page).getByRole('status')).not.toBeEmpty()
  await card(page).getByRole('button', { name: 'Try again' }).click()
  await expect(card(page)).toContainText('Sophia designs this page again from the same report.')
  const sent = await retries(page)
  expect(sent).toHaveLength(2)
  expect(sent[0]).toMatch(/^html-retry:3:approval:owner-3:[0-9a-f-]{36}$/)
  expect(sent[1], 'the same key: the same retry').toBe(sent[0])
})

test('design retry · a stale approval is said, with no Try again and nothing sent', async ({ page }) => {
  await page.goto('/room.html?place=work&designcard=on&designretry=stale')
  await expect(card(page)).toHaveAttribute('data-state', 'failed')
  await expect(card(page)).toContainText('Trying again needs a new spend approval from the project owner.')
  await expect(card(page).getByRole('button', { name: 'Try again' })).toHaveCount(0)
  expect(await retries(page)).toEqual([])
})

test('design retry · a closed gate is said, with no Try again and nothing sent', async ({ page }) => {
  await page.goto('/room.html?place=work&designcard=on&designretry=closed')
  await expect(card(page)).toContainText('Trying again needs the project owner to switch research on.')
  await expect(card(page).getByRole('button', { name: 'Try again' })).toHaveCount(0)
  expect(await retries(page)).toEqual([])
})
