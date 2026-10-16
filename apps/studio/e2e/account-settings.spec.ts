import { expect, test, type Page } from '@playwright/test'

// Settings, in one place (docs/plans/account-settings.md): «Settings…» in the avatar's menu opens a sheet with the
// account, the theme, a call's defaults, your data and help. Every name is synthetic.

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Settings' })

async function openSettings(page: Page) {
  await page.goto('/room.html?people=2')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Settings…' }).click()
  await expect(sheet(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('settings · the avatar’s menu opens Settings, with its five parts', async ({ page }) => {
  await openSettings(page)
  for (const part of ['Account', 'Appearance', 'Calls', 'Data and privacy', 'Help'])
    await expect(sheet(page).getByRole('heading', { name: part, exact: true })).toBeVisible()
})

test('settings · Light puts the page on paper', async ({ page }) => {
  await openSettings(page)
  await sheet(page).getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('settings · a call’s defaults: the microphone on joining, and the mirror, kept', async ({ page }) => {
  await openSettings(page)
  const mic = sheet(page).getByRole('checkbox', { name: 'Join with my microphone on' })
  await expect(mic).toBeChecked()
  await mic.uncheck()
  const mirror = sheet(page).getByRole('checkbox', { name: 'Mirror my video' })
  await mirror.uncheck()
  await page.keyboard.press('Escape')
  await page.reload()
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Settings…' }).click()
  await expect(sheet(page).getByRole('checkbox', { name: 'Join with my microphone on' })).not.toBeChecked()
  await expect(sheet(page).getByRole('checkbox', { name: 'Mirror my video' })).not.toBeChecked()
})

test('settings · Keyboard shortcuts there opens the index', async ({ page }) => {
  await openSettings(page)
  await sheet(page).getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
})

test('settings · a choice is a small box beside its words on one line, and the account says each thing on its line', async ({
  page,
}) => {
  await openSettings(page)
  for (const name of ['Join with my microphone on', 'Mirror my video']) {
    const box = await sheet(page).getByRole('checkbox', { name }).boundingBox()
    const row = await sheet(page).locator('.settings-check', { hasText: name }).boundingBox()
    expect(box?.width ?? 0).toBeLessThanOrEqual(20)
    expect(row?.height ?? 99).toBeLessThanOrEqual(32)
  }
  const said = sheet(page).locator('.account-names > span')
  const first = await said.first().boundingBox()
  const last = await said.last().boundingBox()
  if (!first || !last) throw new Error('the account says nothing')
  expect(last.y).toBeGreaterThanOrEqual(first.y + first.height - 1)
})
