// Personal's new conversation on a wide screen (docs/plans/personal-first-talk.md): it starts at the page's optical
// centre, keeps that start once the first message is sent, and a conversation in progress still rests on the field. On
// a phone it rests on the field (personal.spec «her first greeting and the ways in sit just above where you write»).
import { expect, test, type Page } from '@playwright/test'

const intro = (page: Page) => page.locator('.msgs .msg.sophia').first()

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
})

test('personal · a new conversation starts at the optical centre, and keeps its start once something is said', async ({
  page,
}) => {
  await page.goto('/personal.html?talk=new')
  await expect(page.getByRole('button', { name: /Something’s on my mind/ })).toBeVisible()
  // Read once her words have arrived: their entrance rises a few pixels.
  await intro(page).evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished),
    ),
  )
  const top = (await intro(page).boundingBox())?.y ?? 0
  expect(top).toBeGreaterThan(900 * 0.25)
  expect(top).toBeLessThan(900 * 0.45)
  await page.locator('#c-input').fill('Today I want to plan the week calmly.')
  await page.keyboard.press('Enter')
  await expect(page.locator('.msgs .msg.me')).toHaveCount(1)
  // Her answer comes 900 ms later: the start stays where it was through both.
  await expect(page.locator('.msgs .msg.sophia:not(.typing)')).toHaveCount(2)
  expect(Math.abs(((await intro(page).boundingBox())?.y ?? 0) - top)).toBeLessThanOrEqual(2)
})

test('personal · a conversation in progress still rests on the field', async ({ page }) => {
  // At midday: today's turns are dated back from now, and before 00:06 none is today's, so nothing is in progress.
  await page.goto('/personal.html?at=12:00')
  const last = page.locator('.msgs .msg').last()
  await expect(last).toBeVisible()
  const [turn, field] = await Promise.all([last.boundingBox(), page.locator('.ps-composer').boundingBox()])
  expect(turn && field ? field.y - (turn.y + turn.height) : 999).toBeLessThanOrEqual(64)
})

test('personal · a conversation begun here rests on the field again once Personal was left and come back to (Codex P2 on #290)', async ({
  page,
}) => {
  await page.goto('/personal.html?talk=new')
  await page.locator('#c-input').fill('Today I want to plan the week calmly.')
  await page.keyboard.press('Enter')
  await expect(page.locator('.msgs .msg.sophia:not(.typing)')).toHaveCount(2)
  await expect(page.locator('[data-begins]')).toHaveCount(1)
  await page.evaluate(() => window.personalFixture?.away?.())
  await page.evaluate(() => window.personalFixture?.back?.())
  await expect(page.locator('[data-begins]')).toHaveCount(0)
})

test('personal · left with its ways in still offered and come back to, the first message keeps the centred start (Codex P2 on #320)', async ({
  page,
}) => {
  await page.goto('/personal.html?talk=new')
  await expect(page.getByRole('button', { name: /Something’s on my mind/ })).toBeVisible()
  await page.evaluate(() => window.personalFixture?.away?.())
  await page.evaluate(() => window.personalFixture?.back?.())
  await page.locator('#c-input').fill('Today I want to plan the week calmly.')
  await page.keyboard.press('Enter')
  await expect(page.locator('.msgs .msg.sophia:not(.typing)')).toHaveCount(2)
  await expect(page.locator('[data-begins]')).toHaveCount(1)
})
