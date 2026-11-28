import { expect, test, type Page } from '@playwright/test'

// «You're muted» when talking with the microphone off (docs/plans/muted-speech.md): the dock says so for a few seconds,
// and only while the microphone is off. The fake room says when speech is heard on a muted microphone.

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const mic = (page: Page) => dock(page).getByRole('button', { name: 'Microphone' })
const hint = (page: Page) => page.getByRole('status').filter({ hasText: 'You’re muted' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.goto('/room.html?call=on&people=2')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'true')
})

test('muted · talking with the microphone off is said in the dock, and goes once it is on', async ({ page }) => {
  await mic(page).click()
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.fixture?.speakMuted())
  await expect(hint(page)).toHaveText('You’re muted. Hold Space to talk, or turn the microphone on.')
  await mic(page).click()
  await expect(hint(page)).toHaveCount(0)
})

test('muted · with the microphone on, nothing is said', async ({ page }) => {
  await page.evaluate(() => window.fixture?.speakMuted())
  await expect(hint(page)).toHaveCount(0)
})

test('muted · the hint goes with its call (Codex P2 on #357)', async ({ page }) => {
  await mic(page).click()
  await page.evaluate(() => window.fixture?.speakMuted())
  await expect(hint(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.drop())
  await expect(hint(page)).toHaveCount(0)
})

test('muted · in text mode nothing is listened to, so nothing is said (text-chat-no-mic.md)', async ({ page }) => {
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await page.getByRole('button', { name: 'Chat with Sophia' }).click()
  await expect(page.getByRole('button', { name: /^Text mode/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.fixture?.speakMuted())
  await expect(hint(page)).toHaveCount(0)
})
