import { expect, test, type Page } from '@playwright/test'

// Sophia's line says what she is doing (docs/plans/room-work-line.md): with one research task running, its note names
// it from the task's record, read again every 15 s as Work reads it. The task and its counts are synthetic.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const note = (page: Page) => page.locator('.sophia-line .line-note')

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('work · while she researches, her line says so, then how many sources she read', async ({ page }) => {
  await page.clock.install()
  await page.goto('/room.html?call=on&people=1&floor=1&research=running')
  await expect(leave(page)).toBeVisible()
  await expect(note(page)).toHaveText('Researching')
  await page.evaluate(() => window.fixture?.researchProgress(3))
  await page.clock.fastForward(16_000)
  await expect(note(page)).toHaveText('Researching · 3 sources read')
})

test('work · once it has finished (its result ready), the note goes', async ({ page }) => {
  await page.goto('/room.html?call=on&people=1&floor=1&research=running')
  await expect(note(page)).toHaveText('Researching')
  await page.evaluate(() => window.fixture?.researchDone())
  await expect(note(page)).toHaveCount(0)
})
