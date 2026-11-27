import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// The way back into a call (docs/plans/call-way-back.md): a reload in the call offers it in one press, as the call was;
// a Leave first offers nothing. Each tab keeps its own note, so another tab of the same person is never offered it.

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const join = (page: Page) => dock(page).getByRole('button', { name: 'Join the room' })
const leave = (page: Page) => dock(page).getByRole('button', { name: 'Leave the room' })
const LINE = 'You were in the call before the page reloaded.'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

async function inTheCall(page: Page) {
  await page.goto('/room.html')
  await drawn(page, DRAWN.room)
  await join(page).click()
  await expect(leave(page)).toBeVisible()
}

test('way back · a reload in the call says so, politely, and Join goes back in; then the line goes', async ({
  page,
}) => {
  await inTheCall(page)
  await page.reload()
  await drawn(page, DRAWN.room)
  const line = page.locator('.dock-wrap').getByRole('status').filter({ hasText: LINE })
  await expect(line).toBeVisible()
  // On the dock's one polite line, as its connection's lines are (BASE-03): never a second one beside it.
  await expect(page.locator('.dock-wrap > p[role="status"]:not(.dock-sound)')).toHaveCount(1)
  // Nothing joins on its own: the microphone is the person's to bring back.
  await expect(leave(page)).toHaveCount(0)
  await join(page).click()
  await expect(leave(page)).toBeVisible()
  await expect(page.getByText(LINE)).toHaveCount(0)
  // Spent: another reload outside the call offers nothing.
  await leave(page).click()
  await page.reload()
  await drawn(page, DRAWN.room)
  await expect(join(page)).toBeVisible()
  await expect(page.getByText(LINE)).toHaveCount(0)
})

test('way back · Leave, then a reload: nothing is offered', async ({ page }) => {
  await inTheCall(page)
  await leave(page).click()
  await expect(join(page)).toBeVisible()
  await page.reload()
  await drawn(page, DRAWN.room)
  await expect(join(page)).toBeVisible()
  await expect(page.getByText(LINE)).toHaveCount(0)
})

test('way back · another tab of the same person is never offered this tab’s call', async ({ page, context }) => {
  await inTheCall(page)
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')))
  const other = await context.newPage()
  await other.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await other.goto('/room.html')
  await drawn(other, DRAWN.room)
  await expect(join(other)).toBeVisible()
  await expect(other.getByText(LINE)).toHaveCount(0)
})

test('way back · after a reload in text mode, J goes back as the call was: typing, the microphone off (Codex P2 on #547)', async ({
  page,
}) => {
  await page.goto('/room.html?exchange=open&sophia=listening')
  await join(page).click()
  await expect(leave(page)).toBeVisible()
  await page.locator('.panel-toggles [data-panel="chat"]').click()
  const bar = page.locator('#converse-draft')
  await bar.fill('A question, typed')
  await bar.press('Enter') // typing to Sophia puts the call in text mode
  const textMode = page.getByRole('button', { name: /^Text mode/ })
  await expect(textMode).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.locator('.dock-wrap').getByRole('status').filter({ hasText: LINE })).toBeVisible()
  await page.locator('body').press('ControlOrMeta+j')
  await expect(leave(page)).toBeVisible()
  await expect(textMode).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => window.fixture?.asked)).toEqual(['connect', 'text:on'])
})
