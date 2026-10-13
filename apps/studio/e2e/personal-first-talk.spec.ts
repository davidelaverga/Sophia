// Personal's new conversation (docs/plans/personal-first-talk.md): it starts at the page's optical centre, keeps that
// start once the first message is sent, and a conversation in progress still rests on the field.
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
  await page.goto('/personal.html')
  const last = page.locator('.msgs .msg').last()
  await expect(last).toBeVisible()
  const [turn, field] = await Promise.all([last.boundingBox(), page.locator('.ps-composer').boundingBox()])
  expect(turn && field ? field.y - (turn.y + turn.height) : 999).toBeLessThanOrEqual(64)
})
