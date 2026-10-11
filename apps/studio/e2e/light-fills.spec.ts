// Accents as tints on paper (docs/plans/light-fills.md): a box with words painted in an accent is a tint of it with the
// accent as the ink on paper, and the accent itself with the void's ink in the room; the primary press on paper is
// the brand's violet, hovering a step darker, its ink at 4.5:1 or more.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const rgb = (s: string) => /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(s)
/** One sRGB channel, linear. */
const channel = (c: number) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const lum = ([r, g, b]: readonly [number, number, number]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
/** The contrast of an ink over a fill laid on a paper: the fill's alpha is composited first. */
function contrast(ink: string, fill: string, paper: string): number {
  const i = rgb(ink),
    f = rgb(fill),
    p = rgb(paper)
  if (!i || !f || !p) return 0
  const a = f[4] === undefined ? 1 : Number(f[4])
  const mix = (k: number) => Number(f[k]) * a + Number(p[k]) * (1 - a)
  const l1 = lum([Number(i[1]), Number(i[2]), Number(i[3])])
  const l2 = lum([mix(1), mix(2), mix(3)])
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/** The first box of `selector`: its fill, its ink, the paper behind it. */
const box = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (!el) return null
    const cs = getComputedStyle(el)
    return { fill: cs.backgroundColor, ink: cs.color, paper: getComputedStyle(document.body).backgroundColor }
  }, selector)

const PAPER = 'rgb(251, 248, 243)'

test('light · Tasks: a report tile is a tint with the accent as ink, at 4.5:1 or more', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work&theme=light')
  await drawn(page, DRAWN.tasks)
  const tile = await box(page, '.report-tile')
  expect(tile).not.toBeNull()
  const alpha = Number(rgb(tile?.fill ?? '')?.[4] ?? 1)
  expect(alpha).toBeLessThan(0.2)
  expect(tile?.ink).not.toBe(PAPER)
  expect(contrast(tile?.ink ?? '', tile?.fill ?? '', PAPER)).toBeGreaterThanOrEqual(4.5)
})

test('light · Knowledge: the cover’s format tag is a tint of the amber with the amber as ink', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=knowledge&theme=light')
  await drawn(page, DRAWN.knowledge)
  const tag = await box(page, '.report-cover-tag')
  expect(tag).not.toBeNull()
  expect(tag?.fill).toBe('rgba(143, 87, 23, 0.14)')
  expect(tag?.ink).toBe('rgb(143, 87, 23)')
  expect(contrast(tag?.ink ?? '', tag?.fill ?? '', PAPER)).toBeGreaterThanOrEqual(4.5)
})

test('light · the primary press is the brand’s violet, a step darker hovered, its ink at 4.5:1 or more', async ({
  page,
}) => {
  await page.goto('/signin.html?theme=light')
  await drawn(page, DRAWN.signin)
  const primary = page.getByRole('button', { name: 'Email me a link' })
  await expect(primary).toHaveCSS('background-color', 'rgb(85, 70, 184)')
  const at = await box(page, '.pill.primary')
  expect(contrast(at?.ink ?? '', at?.fill ?? '', PAPER)).toBeGreaterThanOrEqual(4.5)
  await primary.hover()
  await expect(primary).toHaveCSS('background-color', 'rgb(74, 60, 166)')
})

test('the room keeps its tiles: the accent itself as the fill, the void as the ink', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  const tile = await box(page, '.report-tile')
  expect(tile?.fill).toBe('rgb(127, 214, 196)')
  expect(tile?.ink).toBe('rgb(5, 4, 8)')
})
