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

test('settings · Keyboard shortcuts there hands over to the index, one sheet at a time (Codex P1 on #398)', async ({
  page,
}) => {
  await openSettings(page)
  await sheet(page).getByRole('button', { name: 'Keyboard shortcuts' }).click()
  const index = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(index).toBeVisible()
  await expect(sheet(page)).toHaveCount(0)
  // Nothing covers it, and the keys are in it.
  const box = await index.boundingBox()
  if (!box) throw new Error('the index has no box')
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  expect(await index.evaluate((el, p) => el.contains(document.elementFromPoint(p.x, p.y)), at)).toBe(true)
  expect(await index.evaluate((el) => el.contains(document.activeElement))).toBe(true)
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

// Sign out signs out this device; all of them only when asked, in Settings, and after asking (sign-out-scope.md). On
// the fixture page both go to the sign-in, the second saying so (?everywhere=1).
test('settings · Sign out of all devices asks first; staying keeps you; confirmed, it signs out everywhere', async ({
  page,
}) => {
  await openSettings(page)
  const everywhere = sheet(page).getByRole('button', { name: 'Sign out of all devices' })
  await everywhere.click()
  await expect(
    sheet(page).getByText('This one signs out now. Your other devices are signed out within an hour', { exact: false }),
  ).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: 'Stay signed in' })).toBeFocused()
  await sheet(page).getByRole('button', { name: 'Stay signed in' }).click()
  await expect(everywhere).toBeFocused()
  await everywhere.click()
  await sheet(page).getByRole('button', { name: 'Sign out everywhere' }).click()
  await expect(page).toHaveURL(/signin\.html\?everywhere=1$/)
})

test('settings · the account menu’s Sign out is this device’s', async ({ page }) => {
  await page.goto('/room.html?people=2')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/signin\.html$/)
})
