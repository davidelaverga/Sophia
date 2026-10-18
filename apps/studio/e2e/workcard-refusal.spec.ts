import { expect, test, type Page } from '@playwright/test'

// R top-level review on WorkCard (controlled room fixture, synthetic people and words, no call or provider): a research
// task's card whose own detail read is refused (403, refuseTask) shows only that refusal and its Try again, never its
// normal Researching/Completed state, progress or read-failure note; a fresh allowed read restores it; an ordinary 503
// keeps the card's normal (retained) state with no refusal.

const card = (page: Page) => page.locator('.work-card').first()
const REFUSED = 'This task isn’t available to you.'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

async function refuseNow(page: Page) {
  await page.evaluate(() => window.fixture?.refuseTask(true))
  await page.evaluate(() => window.fixture?.refetch(['native-task']))
}

async function shown(page: Page) {
  return {
    state: await card(page).getAttribute('data-state'),
    refused: await card(page).getByText(REFUSED).count(),
    tryAgain: await card(page).getByRole('button', { name: 'Try again' }).count(),
    phaseWords: await card(page)
      .getByText(/Researching|Completed|Done|Reading/)
      .count(),
    // TaskRefused's own line is a .goal-outcome too: only other notes count.
    note: await card(page).locator('.goal-outcome').filter({ hasNotText: REFUSED }).count(),
    progress: await card(page).locator('.work-card-progress, progress, [role="progressbar"]').count(),
  }
}

for (const [label, query, allowed] of [
  ['completed', '/room.html?place=work', /./],
  ['active', '/room.html?place=work&research=running', /researching|reading/],
] as const) {
  test(`work card · ${label} research, its own read refused: refusal only; allowed again, it restores`, async ({
    page,
  }) => {
    await page.goto(query)
    await expect(card(page)).toBeVisible({ timeout: 15_000 })
    const before = await card(page).getAttribute('data-state')
    console.log(`WORK-${label} allowed state=${String(before)}`)
    expect(before ?? '').toMatch(allowed)
    await refuseNow(page)
    await expect(card(page).getByText(REFUSED)).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1500)
    const s = await shown(page)
    console.log(`WORK-${label} refused ${JSON.stringify(s)}`)
    expect(s).toEqual({ state: 'refused', refused: 1, tryAgain: 1, phaseWords: 0, note: 0, progress: 0 })
    await page.evaluate(() => window.fixture?.refuseTask(false))
    await card(page).getByRole('button', { name: 'Try again' }).press('Enter') // keyboard (fixture dock overlap history)
    await expect(card(page)).not.toHaveAttribute('data-state', 'refused', { timeout: 15_000 })
    console.log(`WORK-${label} restored state=${String(await card(page).getAttribute('data-state'))}`)
  })
}

test('work card · an ordinary 503 after an allowed read keeps its normal state, no refusal', async ({ page }) => {
  await page.goto('/room.html?place=work')
  await expect(card(page)).toBeVisible({ timeout: 15_000 })
  const before = await card(page).getAttribute('data-state')
  await page.evaluate(() => window.fixture?.failTask(true))
  await page.evaluate(() => window.fixture?.refetch(['native-task']))
  await page.waitForTimeout(3000)
  const s = await shown(page)
  console.log(`WORK-503 before=${String(before)} after ${JSON.stringify(s)}`)
  expect(s.refused).toBe(0)
  expect(s.state).not.toBe('refused')
})

test('work card · its HTML design child task refused: the row says only that refusal, never Designing; allowed again, it restores', async ({
  page,
}) => {
  await page.goto('/room.html?place=work&design=designing')
  const row = page.locator('.work-card .output-row[data-design]')
  await expect(row).toContainText('HTML page · Designing', { timeout: 15_000 })
  await page.evaluate(() => window.fixture?.failDesign('forbidden'))
  await page.evaluate(() => window.fixture?.refetch(['native-task']))
  await expect(row).toHaveAttribute('data-design', 'refused', { timeout: 15_000 })
  const s = {
    designing: await page.locator('.work-card').getByText('HTML page · Designing').count(),
    refused: await row.getByText(REFUSED).count(),
    tryAgain: await row.getByRole('button', { name: 'Try again' }).count(),
    parentState: await card(page).getAttribute('data-state'),
  }
  console.log(`WORK-design-child refused ${JSON.stringify(s)}`)
  expect(s).toEqual({ designing: 0, refused: 1, tryAgain: 1, parentState: s.parentState })
  expect(s.parentState).not.toBe('refused')
  await page.evaluate(() => window.fixture?.failDesign(false))
  await row.getByRole('button', { name: 'Try again' }).press('Enter')
  await expect(page.locator('.work-card .output-row[data-design]')).not.toHaveAttribute('data-design', 'refused', {
    timeout: 15_000,
  })
})
