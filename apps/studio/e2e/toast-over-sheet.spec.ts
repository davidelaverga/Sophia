// A notice never lies over an open sheet (docs/plans/toast-over-sheet.md): on a phone it goes to the top, on a wider
// screen it is centred in what the panel leaves.
import { expect, test, type Page } from '@playwright/test'

/** A notice as the Studio's Toast draws it, shown now: its words, its press when it has one. Its frame is measured. */
const notice = (page: Page, words = 'Deleted. Sophia starts fresh.', act?: string) =>
  page.evaluate(
    ([said, press]) => {
      const toast = document.createElement('div')
      toast.className = 'toast'
      toast.dataset['shown'] = ''
      const line = document.createElement('span')
      line.textContent = said
      toast.append(line)
      if (press) {
        const button = document.createElement('button')
        button.className = 'text-button'
        button.type = 'button'
        button.textContent = press
        toast.append(button)
      }
      document.body.append(toast)
    },
    [words, act] as const,
  )

/** The notice's frame once it rests: its edges, its centre, the lines its words take, how far the page scrolls sideways. */
const frame = async (page: Page) => {
  const toast = page.locator('.toast')
  await expect.poll(() => toast.evaluate((t) => t.getAnimations().length)).toBe(0)
  return toast.evaluate((t) => {
    const box = t.getBoundingClientRect()
    const words = t.querySelector('span')
    return {
      left: box.left,
      width: box.width,
      centre: box.left + box.width / 2,
      lines: words
        ? Math.round(words.getBoundingClientRect().height / parseFloat(getComputedStyle(words).lineHeight))
        : 0,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
}

/** #466's line with two real projects' titles, each well under the 180 characters a title may take. */
const LONG =
  'Your call in “Quarterly planning for the regional partnerships programme and the spring launch” ended when you opened “Research notes on onboarding interviews with the first twelve teams in the pilot”.'

const meet = (page: Page) =>
  page.evaluate(() => {
    const t = document.querySelector('.toast')?.getBoundingClientRect()
    const s = document.querySelector('.sheet')?.getBoundingClientRect()
    if (!t || !s) return null
    return !(t.right <= s.left || t.left >= s.right || t.bottom <= s.top || t.top >= s.bottom)
  })

test('toast · in a window both narrow and short (500×400), the sheet leaves the notice its band at the top (Codex P2 on #293)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 400 })
  await page.goto('/room.html?demo=1')
  await page.getByRole('button', { name: 'Invite' }).first().click()
  await page.getByRole('tab', { name: 'Calendar' }).click()
  await expect(page.locator('.sheet')).toBeVisible()
  await notice(page)
  await page.waitForTimeout(400)
  expect(await meet(page)).toBe(false)
  await expect(page.locator('.toast')).toBeInViewport()
})

for (const width of [390, 900]) {
  test(`toast · with a sheet open at ${String(width)} px, a notice stands clear of it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/room.html?demo=1')
    await page.getByRole('button', { name: 'Invite' }).first().click()
    await expect(page.locator('.sheet')).toBeVisible()
    await notice(page)
    // Its entrance (a rise of 8 px) ended.
    await page.waitForTimeout(400)
    expect(await meet(page)).toBe(false)
    await expect(page.locator('.toast')).toBeInViewport()
  })
}

test('toast · with no sheet open, a notice keeps its place at the bottom', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/room.html?demo=1')
  await notice(page)
  await page.waitForTimeout(400)
  const box = await page.locator('.toast').boundingBox()
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(844 / 2)
})

test('toast · with the command palette open, a notice keeps its place (Codex on #293)', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 844 })
  await page.goto('/room.html?demo=1')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible()
  await notice(page)
  await page.waitForTimeout(400)
  const box = await page.locator('.toast').boundingBox()
  // Centred on the screen, at the bottom: the palette is not a sheet.
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 450)).toBeLessThanOrEqual(1)
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(844 / 2)
})

test('toast · just above a phone, with a sheet open, a notice keeps a width it can be read in, clear of the sheet’s head (Codex on #293)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 844 })
  await page.goto('/room.html?demo=1')
  await page.getByRole('button', { name: 'Invite' }).first().click()
  await expect(page.locator('.sheet')).toBeVisible()
  await notice(page)
  await page.waitForTimeout(400)
  const [t, head] = await Promise.all([
    page.locator('.toast').boundingBox(),
    page.locator('.sheet').evaluate((s) => {
      const r = s.getBoundingClientRect()
      return { top: r.top, bottom: r.top + 64 }
    }),
  ])
  expect(t?.width ?? 0).toBeGreaterThanOrEqual(240)
  expect((t?.y ?? 0) >= head.bottom || (t?.y ?? 0) + (t?.height ?? 0) <= head.top).toBe(true)
  await expect(page.locator('.toast')).toBeInViewport()
})

test('toast · on a phone with a sheet open, a long notice takes the width the gutters leave, at the top, centred (toast-phone-width.md)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/room.html?demo=1')
  await page.getByRole('button', { name: 'Invite' }).first().click()
  await expect(page.locator('.sheet')).toBeVisible()
  await notice(page, 'Your call in “Fixture project” ended when you opened “Research notes”.', 'Rejoin')
  const at = await frame(page)
  expect(await meet(page)).toBe(false)
  // At 390 px the gutters are 16 px: 358 px for the notice, on two lines, where it had 195 px and four.
  expect(at.lines).toBeLessThanOrEqual(2)
  expect(at.width).toBeCloseTo(390 - 2 * 16, 0)
  expect(at.left).toBeCloseTo(16, 0)
})

// On a computer a long line keeps the width it always had: left: 50% gave the toast the half of the screen right of its
// anchor, and over a sheet the room from its anchor to the screen's edge. Between a phone and that half it reads in
// 560 px, about 80 characters (toast-phone-width.md, after the review).
for (const { width, height, measure } of [
  { width: 1280, height: 800, measure: 640 },
  { width: 1920, height: 1080, measure: 960 },
  { width: 900, height: 800, measure: 560 },
]) {
  test(`toast · at ${String(width)} px a long notice reads in ${String(measure)} px, centred (toast-phone-width.md)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/room.html?demo=1')
    await notice(page, LONG, 'Rejoin')
    const at = await frame(page)
    expect(at.width).toBeCloseTo(measure, 0)
    expect(Math.abs(at.centre - width / 2)).toBeLessThanOrEqual(1)
    expect(at.sideways).toBe(0)
  })
}

test('toast · on a wide screen with a sheet open, a long notice keeps the width it had, centred in what the panel leaves (toast-phone-width.md)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/room.html?demo=1')
  await page.getByRole('button', { name: 'Invite' }).first().click()
  await expect(page.locator('.sheet')).toBeVisible()
  await notice(page, LONG, 'Rejoin')
  const at = await frame(page)
  expect(await meet(page)).toBe(false)
  // Its anchor is at (1920 − 420) / 2 = 750, and the screen's edge (1920 + 420) / 2 = 1170 px right of it.
  expect(at.width).toBeCloseTo(1170, 0)
  expect(Math.abs(at.centre - 750)).toBeLessThanOrEqual(1)
  expect(at.sideways).toBe(0)
})
