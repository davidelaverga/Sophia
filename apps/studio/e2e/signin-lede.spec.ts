// What opens, said at the door (docs/plans/sign-in-lede.md): under «Sign in to Sophia», one line says what Sophia is, in
// the body's size and ink, inside the column, on a wide screen and a phone; once the link is sent it is gone; and the
// screen still speaks in three text sizes.
import { expect, test, type Page } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

const PAGE = '/signin.html'
const LEDE = 'Where your team and Sophia think together.'

/** The line as drawn: its size and ink, where it sits against the heading and the column, and the page's overflow. */
const ledeRead = (page: Page) =>
  page.evaluate(() => {
    const lede = document.querySelector<HTMLElement>('.screen-lede')
    const heading = document.querySelector<HTMLElement>('.screen-title')
    const column = document.querySelector<HTMLElement>('.screen-body')
    if (!lede || !heading || !column) return null
    const cs = getComputedStyle(lede)
    const l = lede.getBoundingClientRect()
    const h = heading.getBoundingClientRect()
    const c = column.getBoundingClientRect()
    const muted = document.querySelector<HTMLElement>('.screen-body p.muted')
    return {
      type: `${cs.fontSize}/${cs.lineHeight}`,
      // One line of 20 px: the contract is a single line (Codex on #247).
      height: Math.round(l.height),
      // The same ink as the body's other line («New here? …»): the second ink, resolved by the browser.
      sameInk: muted !== null && getComputedStyle(muted).color === cs.color,
      underHeading: l.top >= h.bottom && lede.previousElementSibling === heading,
      inColumn: l.left >= c.left - 0.5 && l.right <= c.right + 0.5 && l.bottom <= window.innerHeight,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    }
  })

// At 1440, at 375, and at 320, the narrowest phone the Studio is checked at (Codex on #247).
for (const width of [0, 375, 320]) {
  test(`sign-in${width ? ` @phone ${String(width)}` : ''} · one line under the title says what opens`, async ({
    page,
  }) => {
    if (width) await page.setViewportSize({ width, height: 812 })
    await page.goto(PAGE)
    await expect(page.getByRole('heading', { name: 'Sign in to Sophia' })).toBeVisible()
    await expect(page.getByText(LEDE)).toBeVisible()
    const read = await ledeRead(page)
    expect(read).not.toBeNull()
    expect(read?.type).toBe('14px/20px')
    expect(read?.height).toBe(20)
    expect(read?.underHeading).toBe(true)
    expect(read?.inColumn).toBe(true)
    expect(read?.overflowX).toBe(false)
    // The screen keeps its three text sizes: the title, the text, a label.
    const sizes = await typeSizes(page, '.screen-body')
    expect(sizes.length, sizes.join(' ')).toBeLessThanOrEqual(3)
  })
}

test('sign-in · the line is in the second ink, and gone once the link is sent', async ({ page }) => {
  await page.goto(PAGE)
  const read = await ledeRead(page)
  expect(read?.sameInk).toBe(true)
  await page.getByPlaceholder('you@company.com').fill('luis@example.com')
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByText(LEDE)).toHaveCount(0)
})

declare global {
  interface Window {
    /** Set by `holdFonts`: lets the held fonts' readiness go. */
    releaseFonts?: () => void
  }
}

/** The fonts' readiness held by the page until the test lets it go: the late font, on demand. */
async function holdFonts(page: Page) {
  await page.addInitScript(() => {
    const held: { release?: () => void } = {}
    const ready = new Promise<FontFaceSet>((resolve) => {
      held.release = () => resolve(document.fonts)
    })
    Object.defineProperty(document.fonts, 'ready', { configurable: true, get: () => ready })
    window.releaseFonts = () => held.release?.()
  })
}
const releaseFonts = (page: Page) => page.evaluate(() => window.releaseFonts?.())
/** The lede set as a wider face would set it: on more lines, the body taller, the field lower. */
const widen = (page: Page, on: boolean) =>
  page.evaluate((wide) => {
    const lede = document.querySelector<HTMLElement>('.screen-lede')
    if (lede) lede.style.width = wide ? '7em' : ''
  }, on)
/** How far her attention is from the field's centre, in the light's box (px, x and y added). */
const offField = (page: Page) =>
  page.evaluate(() => {
    const light = document.querySelector<HTMLElement>('.light')
    const field = document.querySelector('#email')
    if (!light || !field) return Number.POSITIVE_INFINITY
    const b = light.getBoundingClientRect()
    const f = field.getBoundingClientRect()
    const [x = Number.NaN, y = Number.NaN] = (light.dataset['attention'] ?? '').split(' ').map(Number)
    return Math.abs(x - (f.left + f.width / 2 - b.left)) + Math.abs(y - (f.top + f.height / 2 - b.top))
  })
/** The title's and the providers' tops, with the lede shown or taken out of the flow. */
const tops = (page: Page, lede: boolean) =>
  page.evaluate((shown) => {
    const line = document.querySelector<HTMLElement>('.screen-lede')
    if (line) line.style.display = shown ? '' : 'none'
    const title = document.querySelector('.screen-title')?.getBoundingClientRect().top ?? Number.NaN
    const providers = document.querySelector('.screen-lede + *')?.getBoundingClientRect()
    return { title: Math.round(title), providers: Math.round(providers?.top ?? Number.NaN) }
  }, lede)

test('sign-in · the controls sit one line and the gap lower, the title where it was (Codex on #247)', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(page.getByText(LEDE)).toBeVisible()
  // The title arrives (`.arrive`, 0.36 s): read once it has, or its rise reads as a move of a pixel.
  await page.locator('.screen-title').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const withLine = await tops(page, true)
  const without = await tops(page, false)
  // The line and the gap under it (20 + 14): the controls' only move; the title stands.
  expect(withLine.providers - without.providers).toBe(34)
  expect(withLine.title).toBe(without.title)
})

test('sign-in · the late font moving the field: her attention follows it (Codex on #247)', async ({ page }) => {
  await holdFonts(page)
  await page.goto(PAGE)
  await page.getByPlaceholder('you@company.com').focus()
  await expect(page.locator('.light')).toHaveAttribute('data-mode', 'listen')
  await widen(page, true)
  await releaseFonts(page)
  await expect.poll(() => offField(page)).toBeLessThan(3)
})
test('sign-in · a rest lifted only by the fallback face comes down when the font arrives (Codex on #247)', async ({
  page,
}) => {
  // The words' height with the font, and with the lede on more lines: a window tall enough for the first, not the second.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(PAGE)
  const words = () => page.evaluate(() => document.querySelector<HTMLElement>('.screen-body')?.offsetHeight ?? 0)
  const set = await words()
  await widen(page, true)
  const wide = await words()
  // restsHigh at 1440 wide, under 941 tall: words + 16 > 0.41 × height (screen-rest.ts with the engine's default rest).
  const height = Math.ceil((set + 16) / 0.41) + 2
  expect(height).toBeLessThan((wide + 16) / 0.41)
  expect(height).toBeLessThan(941)
  await holdFonts(page)
  await page.setViewportSize({ width: 1440, height })
  await page.goto(PAGE)
  const screen = page.locator('.screen')
  await expect(screen).not.toHaveAttribute('data-rest-high')
  await widen(page, true) // the fallback's extra line: the rest lifts
  await expect(screen).toHaveAttribute('data-rest-high')
  await widen(page, false) // the font's own line: the growth's latch keeps it high
  await expect(screen).toHaveAttribute('data-rest-high')
  await releaseFonts(page) // the font arrived: decided afresh
  await expect(screen).not.toHaveAttribute('data-rest-high')
})
