import { expect, test, type Page } from '@playwright/test'

// CON-01's receipt-aware confirmations use the existing kit without losing their held intent. Every record is a
// synthetic fixture record; these checks do not qualify hosted erasure or Ask.
const PAGE = '/room.html?place=conversations&conversations=1'
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const messages = (page: Page) => open(page).locator('.conv-messages > li')
const confirmation = (page: Page) => page.getByRole('group', { name: 'Remove this message' })
const writes = (page: Page) =>
  page.evaluate(() => (window.fixture?.served ?? []).filter((s) => s.startsWith('withdraw-key:')))

async function opened(page: Page, query = '') {
  await page.goto(`${PAGE}${query}`)
  if (!(await open(page).isVisible())) {
    await page
      .getByRole('region', { name: 'All conversations' })
      .getByRole('listitem')
      .getByRole('button')
      .first()
      .click()
  }
  await expect(messages(page)).toHaveCount(6)
}

async function askToRemove(page: Page) {
  const message = messages(page).nth(3)
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await message.locator('.conv-msg-body').tap()
  else await message.hover()
  await message.getByRole('button', { name: 'Remove message' }).click()
  return confirmation(page)
}

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

for (const mode of ['desktop', '@phone']) {
  test(`confirmation kit · ${mode}: a second Enter keeps the message; standard controls and conservative disclosure`, async ({
    page,
  }) => {
    await opened(page)
    const confirm = await askToRemove(page)
    await expect(confirm.getByRole('button', { name: 'Keep it' })).toBeFocused()
    await expect(confirm).toContainText('Remove this message?')
    await expect(confirm).toContainText(
      'Later Sophia answers in this conversation can also be removed, even when they didn’t use these words.',
    )
    await expect(confirm).toContainText(
      'All other human messages, other conversations and recorded project decisions stay.',
    )
    const heights = await confirm
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().height))
    expect(heights).toEqual(mode === '@phone' ? [40, 40] : [28, 28])
    await page.keyboard.press('Enter')
    await expect(confirm).toHaveCount(0)
    expect(await writes(page)).toHaveLength(0)
    await expect(messages(page)).toHaveCount(6)
    await askToRemove(page)
    await page.keyboard.press('Escape')
    await expect(confirm).toHaveCount(0)
    await expect(messages(page).nth(3).getByRole('button', { name: 'Remove message' })).toBeFocused()
  })
}

test('confirmation kit · pending moderator removal cannot be repeated or dismissed as Keep', async ({ page }) => {
  await opened(page, '&withdraw=slow')
  const confirm = await askToRemove(page)
  await confirm.getByRole('button', { name: 'Remove', exact: true }).click()
  const pending = confirm.getByRole('button', { name: 'Removing…' })
  const keep = confirm.getByRole('button', { name: 'Keep it' })
  await expect(pending).toHaveAttribute('aria-disabled', 'true')
  await expect(keep).toHaveAttribute('aria-disabled', 'true')
  await expect(keep).toHaveCSS('opacity', '0.45', { timeout: 500 })
  await expect(keep).toHaveCSS('cursor', 'default')
  const ink = await keep.evaluate((b) => ({
    color: getComputedStyle(b).color,
    bg: getComputedStyle(b).backgroundColor,
  }))
  await keep.hover()
  await expect(keep).toHaveCSS('color', ink.color)
  await expect(keep).toHaveCSS('background-color', ink.bg)
  await keep.click({ force: true })
  await expect(confirm).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirm).toBeVisible()
  await pending.click({ force: true })
  expect(await writes(page)).toHaveLength(1)
  await expect(messages(page).nth(3).getByText('This message was withdrawn.')).toBeVisible()
})

test('confirmation kit · an unknown moderator removal names Remove and reuses the original key', async ({ page }) => {
  await opened(page, '&withdraw=unreached')
  const confirm = await askToRemove(page)
  await confirm.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(confirm).toContainText('Not confirmed: Remove sends it again; it won’t be removed twice.')
  await confirm.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(messages(page).nth(3).getByText('This message was withdrawn.')).toBeVisible()
  const keys = await writes(page)
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
})

test('confirmation kit · erasure begins with safe focus and keeps focus on Escape', async ({ page }) => {
  await opened(page)
  const toggle = open(page).getByRole('button', { name: 'Context' })
  if (await toggle.isVisible()) await toggle.click()
  const erase = page.getByRole('button', { name: 'Erase this conversation', exact: true })
  await erase.click()
  const confirm = page.getByRole('group', { name: 'Erase this conversation' })
  await expect(confirm.getByRole('button', { name: 'Keep it' })).toBeFocused()
  const heights = await confirm
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().height))
  expect(heights).toEqual([28, 28])
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(erase).toBeFocused()
})

test('confirmation kit · context labels identify both projections', async ({ page }) => {
  await opened(page)
  const toggle = open(page).getByRole('button', { name: 'Context' })
  if (await toggle.isVisible()) await toggle.click()
  const context = page.getByRole('complementary', { name: 'Project context' })
  await expect(context.locator('.conv-covers').first()).toContainText('The summary covers messages')
  await expect(context.locator('.conv-covers').last()).toContainText('The questions cover messages')
})
