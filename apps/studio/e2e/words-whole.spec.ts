import { expect, test } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// Words said whole (docs/plans/words-whole.md): a browser's own date and time read back as the Studio says them, and a
// project name's limit said before it is reached. Every name is synthetic, and the pages say they are fixtures.

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('calendar · the date and time chosen are read back on the 24-hour clock under the browser’s fields', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).first().click()
  await page.getByRole('tab', { name: 'Calendar' }).click()
  const time = page.getByLabel('Start time')
  await time.fill('18:30')
  const said = page.locator('#calendar-when-said')
  // A range's spaces may be no-break ones (\s matches them), with a word joiner after the dash.
  await expect(said).toHaveText(/ · 18:30\s–⁠?\s19:30$/)
  await expect(time).toHaveAttribute('aria-describedby', 'calendar-when-said')
  await expect(page.getByLabel('Date')).toHaveAttribute('aria-describedby', 'calendar-when-said')
})

test('goals · a target date is read back as the Studio says it, under the browser’s field', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  await drawn(page, DRAWN.goals)
  await page.locator('.goal-press').first().click()
  const date = page.locator('#goal-date')
  await expect(page.locator('#goal-date-said')).toHaveCount(0)
  await date.fill('2026-12-15')
  await expect(page.locator('#goal-date-said')).toHaveText('15 Dec 2026')
  await expect(date).toHaveAttribute('aria-describedby', 'goal-date-said')
})

test('work · a project name’s limit: its count as it comes near, and a paste past it says what was kept', async ({
  page,
}) => {
  await page.goto('/work-space.html')
  await page.getByRole('button', { name: 'New project' }).click()
  const field = page.locator('#c-newproj')
  const limit = page.locator('#c-newproj-limit')
  await field.fill('Launch plan')
  await expect(limit).toHaveText('')
  await expect(field).not.toHaveAttribute('aria-describedby')
  await field.fill('x'.repeat(165))
  await expect(limit).toHaveText('165 / 180')
  await expect(field).toHaveAttribute('aria-describedby', 'c-newproj-limit')
  await field.fill('x'.repeat(218))
  await expect(field).toHaveValue('x'.repeat(180))
  await expect(limit).toContainText('Only the first 180 characters fit.')
  await expect(limit).toContainText('180 / 180')
  // A deletion is always taken, and the cut is no longer said.
  await field.press('Backspace')
  await expect(limit).toHaveText('179 / 180')
})
