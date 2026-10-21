import { expect, test } from '@playwright/test'

/**
 * The personal fixture's talk reads the same whenever a check runs (docs/plans/ci-personal-fixture-clock.md). Its
 * turns are dated from its clock; given no `at=HH:MM`, that clock stood at the browser's, and a run just after
 * midnight (CI, in UTC) found today's turns on yesterday and yesterday's two days back.
 */
const RUNS = [
  ['just after midnight', new Date(2026, 9, 20, 0, 3)],
  ['a quarter past midnight', new Date(2026, 9, 20, 0, 13)],
  ['half past midnight', new Date(2026, 9, 20, 0, 30)],
  ['a minute to midnight', new Date(2026, 9, 20, 23, 59)],
  ['as a year begins', new Date(2027, 0, 1, 0, 3)],
] as const

for (const [when, clock] of RUNS) {
  test(`fixture · given no hour, the talk is yesterday's and today's, in the day's light, ${when}`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(clock)
    await page.goto('/personal.html')
    await expect(page.locator('.msgs > .c3-day')).toHaveText(['Yesterday · Where you began', 'Today'])
    await expect(page.locator('.c3-space.you')).toHaveAttribute('data-hour', 'day')
  })
}

test('fixture · given an hour that is not one (at=, at=7, at=25:00), the talk stands at noon too', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 20, 0, 3))
  for (const at of ['', '7', '25:00']) {
    await page.goto(`/personal.html?at=${at}`)
    await expect(page.locator('.msgs > .c3-day')).toHaveText(['Yesterday · Where you began', 'Today'])
    await expect(page.locator('.c3-space.you')).toHaveAttribute('data-hour', 'day')
  }
})
