import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'

// Personal says Sophia is an AI, and help is one press away (docs/plans/personal-ai-disclosure.md): a line that stays
// under the field and in a talk by voice, and «Help now», a sheet of crisis lines to call, text or open. Every other
// origin is aborted, so no call, text or site is ever reached: the checks read the links, they never follow them.

const line = (page: Page) => page.locator('.c3-ai-line').first()
const help = (page: Page) => line(page).getByRole('button', { name: 'Help now' })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Help now' })
const way = (page: Page, name: string) => sheet(page).getByRole('link', { name, exact: true })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

declare global {
  interface Window {
    /** The composer's form submits this check counted. */
    submits?: number
  }
}

/** Counts the composer's form submits, so a press on «Help now» can be shown to send nothing. */
async function countSubmits(page: Page) {
  await page.evaluate(() => {
    window.submits = 0
    document
      .querySelector('.ps-composer')
      ?.addEventListener('submit', () => (window.submits = (window.submits ?? 0) + 1), true)
  })
  return async () => page.evaluate(() => window.submits)
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Two presses side by side or one above the other, never over each other. */
const apart = (a: Box, b: Box) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y

test('ai · under the field, a line says Sophia is an AI, not a person', async ({ page }) => {
  await page.goto('/personal.html')
  await expect(page.locator('#c-input')).toBeVisible()
  await expect(line(page)).toContainText('Sophia is an AI, not a person.')
  const field = await page.locator('#c-input').boundingBox()
  const said = await line(page).boundingBox()
  expect(said && field && said.y >= field.y + field.height, 'the line under the field').toBe(true)
})

test('ai · «Help now» opens the crisis lines, each one press away; Esc gives the focus back', async ({ page }) => {
  await page.goto('/personal.html')
  await help(page).click()
  await expect(sheet(page)).toBeVisible()
  // R2-420-COPY-1/2: 112 where its source holds it, the EU; a service's own charge told apart from a phone plan's.
  await expect(sheet(page)).toContainText('911 in the US and Canada, 112 in the EU.')
  await expect(sheet(page)).toContainText('These services don’t charge for their help, though your phone plan’s usual')
  await expect(sheet(page)).not.toContainText('112 in Europe')
  await expect(sheet(page)).not.toContainText('These lines are free')
  await expect(sheet(page).getByRole('listitem')).toHaveCount(5)
  await expect(way(page, 'Call 988').first()).toHaveAttribute('href', 'tel:988')
  await expect(way(page, 'Text 988').first()).toHaveAttribute('href', 'sms:988')
  await expect(way(page, 'Call 116 123')).toHaveAttribute('href', 'tel:116123')
  await expect(way(page, 'Call 024')).toHaveAttribute('href', 'tel:024')
  for (const name of ['988lifeline.org', 'findahelpline.com']) {
    await expect(way(page, name)).toHaveAttribute('href', `https://${name}`)
    await expect(way(page, name)).toHaveAttribute('target', '_blank')
    await expect(way(page, name)).toHaveAttribute('rel', 'noopener noreferrer')
  }
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(help(page)).toBeFocused()
})

test('ai · «Help now» sends nothing: Tab stays in the sheet, Close gives the focus back, the draft stays', async ({
  page,
}) => {
  await page.goto('/personal.html')
  await page.locator('#c-input').fill('words not to send')
  const submits = await countSubmits(page)
  // From the keyboard too: Enter on «Help now», inside the composer's form, opens the sheet and submits nothing.
  await help(page).focus()
  await page.keyboard.press('Enter')
  await expect(sheet(page)).toBeVisible()
  for (const key of [...Array.from({ length: 12 }, () => 'Tab'), 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    expect(await sheet(page).evaluate((s) => s.contains(document.activeElement)), `${key}: focus in the sheet`).toBe(
      true,
    )
  }
  await sheet(page).getByRole('button', { name: 'Close' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(help(page)).toBeFocused()
  await expect(page.locator('#c-input')).toHaveValue('words not to send')
  expect(await submits()).toBe(0)
  expect(await page.evaluate(() => window.personalFixture?.sent)).toEqual([])
  expect(await page.evaluate(() => window.personalFixture?.pressed)).toEqual([])
})

test('ai · offline, the line and its help stay, and need nothing from a server', async ({ page, context }) => {
  await page.goto('/personal.html')
  await context.setOffline(true)
  await expect(page.locator('.ps-composer .chat-line')).toHaveText('You’re offline. Your words wait here.')
  await expect(line(page)).toContainText('Sophia is an AI, not a person.')
  await help(page).click()
  await expect(way(page, 'Call 988').first()).toHaveAttribute('href', 'tel:988')
  await page.keyboard.press('Escape')
  await expect(help(page)).toBeFocused()
  await context.setOffline(false)
})

test('ai · with Sophia unable to answer, the line and its help stay', async ({ page }) => {
  await page.goto('/personal.html?unavailable=1')
  await expect(line(page)).toContainText('Sophia is an AI, not a person.')
  await help(page).click()
  await expect(sheet(page).getByRole('listitem')).toHaveCount(5)
  await page.keyboard.press('Escape')
  await expect(help(page)).toBeFocused()
})

test('ai · the line turns nothing on: without a voice there is no talk to start', async ({ page }) => {
  await page.goto('/personal.html')
  await expect(line(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Talk with her' })).toHaveCount(0)
})

test('ai · in a talk by voice, the line alone (no help there yet), and End still ends it', async ({ page }) => {
  await page.goto('/personal.html?voice=1&step=150')
  await page.getByRole('button', { name: 'Talk with her' }).click()
  const talk = page.getByRole('dialog', { name: 'Talking with Sophia' })
  await expect(talk).toBeVisible()
  await expect(talk.locator('.c3-ai-line')).toHaveText('Sophia is an AI, not a person.')
  await expect(talk.getByRole('button', { name: 'Help now' })).toHaveCount(0)
  await talk.getByRole('button', { name: 'End' }).click()
  await expect(talk).toHaveCount(0)
  await expect(help(page)).toBeVisible()
})

for (const scheme of ['dark', 'light'] as const) {
  test(`ai · readable in ${scheme}: the line and the sheet`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/personal.html?theme=${scheme}`)
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? 'dark')).toBe(scheme)
    expect(await lowContrast(page, '.c3-ai-line')).toEqual([])
    await help(page).click()
    expect(await lowContrast(page, '.sheet')).toEqual([])
  })
}

test('@phone · ai · on a touch screen, «Help now» is a full-size target, and the line keeps its height', async ({
  page,
}) => {
  await page.goto('/personal.html')
  expect((await help(page).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40)
  expect((await line(page).boundingBox())?.height ?? 0).toBeLessThanOrEqual(28)
})

test('@phone · ai · the sheet: every press 40 px or more, none over another, the last in reach, Close in sight', async ({
  page,
}) => {
  await page.goto('/personal.html')
  await help(page).click()
  // Measured at rest: the sheet rises from the bottom on a phone, and a box read while it moves is scaled.
  await page.evaluate(async () => {
    const moving = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity)
    await Promise.all(moving.map((a) => a.finished.catch(() => null)))
  })
  const links = sheet(page).locator('.help-ways').getByRole('link')
  expect(await links.allInnerTexts()).toEqual([
    'Call 988',
    'Text 988',
    '988lifeline.org',
    'Call 988',
    'Text 988',
    'Call 116 123',
    'Call 024',
    'findahelpline.com',
  ])
  const boxes: Box[] = []
  for (const link of await links.all()) {
    const box = await link.boundingBox()
    expect(box?.height ?? 0, await link.innerText()).toBeGreaterThanOrEqual(40)
    if (box) boxes.push(box)
  }
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(apart(a, b)).toBe(true)
  const close = sheet(page).getByRole('button', { name: 'Close' })
  expect((await close.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40)
  await links.last().scrollIntoViewIfNeeded()
  await expect(links.last()).toBeInViewport()
  await expect(close).toBeInViewport()
})
