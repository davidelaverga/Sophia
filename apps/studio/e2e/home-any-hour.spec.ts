import { expect, test } from '@playwright/test'

/**
 * Home's fixture reads the same whenever a check runs (docs/plans/ci-personal-fixture-clock.md). Its clock stood at the
 * browser's: before two in the morning your talk of the day before was a weekday's, and the greeting followed the
 * runner's hour. It stands at noon of the real day; what the fixture's API answers is dated from that clock too.
 */
const RUNS = [
  ['half past midnight', new Date(2026, 9, 20, 0, 30)],
  ['five to midnight', new Date(2026, 9, 20, 23, 55)],
  ['as a year begins', new Date(2027, 0, 1, 0, 30)],
] as const

for (const [when, clock] of RUNS) {
  test(`fixture · Home reads at noon: yesterday's talk, the afternoon's greeting, the Standup in 10 min, ${when}`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(clock)
    await page.goto('/home.html')
    await expect(page.locator('.hw-you').getByRole('button', { name: /Continue/ })).toContainText(
      'Yesterday · The launch pressure',
    )
    await expect(page.locator('.hw-hello')).toHaveText(/^Good afternoon,\s*Luis\.$/)
    await expect(page.locator('.hw-says')).toHaveText('Standup in Product launch starts in 10 min.')
  })
}

test('fixture · what needs you, read from the fixture’s API, is dated from Home’s clock: due in 20 min at any hour', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(2026, 9, 20, 0, 30))
  await page.goto('/home.html?needs=api')
  await expect(page.getByRole('list', { name: 'Needs you' }).getByRole('button').first()).toContainText(
    'expires in 20 min',
  )
})
