import { expect, test, type Page } from '@playwright/test'
import { contrastOf, lowContrast } from './contrast.ts'
import { DRAWN, drawn } from './drawn.ts'

// Her light by the hour, read (docs/plans/ci-light-by-hour-contrast.md). Given no hour, the personal fixture stands at
// noon (ci-personal-fixture-clock.md), so the ink and light checks read the day's light only. Here each of her lights
// (`lightOf`: morning from 5, the day from 11, evening from 18, night from 22) is asked for by `at=HH:MM`, in the dark
// room and on paper, on a desktop and a phone: every word in the space reads at 4.5:1 (its night field's «Still up?»
// included), and that longer placeholder fits its line. lowContrast composites background colours only: her light
// itself, a gradient in a sibling of the words (`.c3-ambient`), is not under what it measures (the note says how much it
// takes, measured from the page's pixels).

const HOURS = [
  ['night', '23:30'],
  ['morning', '07:30'],
  ['evening', '19:30'],
  ['day', '14:00'],
] as const

const THEMES = [
  ['dark', ''],
  ['light', '&theme=light'],
] as const

/** The space at `address`, drawn, in `light`. */
async function open(page: Page, light: string, address: string) {
  await page.goto(`/personal.html?demo=1&${address}`)
  await drawn(page, DRAWN.personal)
  await expect(page.locator('.c3-space.you')).toHaveAttribute('data-hour', light)
}

for (const phone of [false, true]) {
  for (const [light, hour] of HOURS) {
    for (const [theme, asked] of THEMES) {
      test(`${phone ? '@phone · ' : ''}light by hour · ${light} (${hour}), ${theme}: every word in the space reads at 4.5:1`, async ({
        page,
      }) => {
        await open(page, light, `at=${hour}${asked}`)
        if (light === 'night') await expect(page.locator('#c-input')).toHaveAttribute('placeholder', /^Still up\?/)
        expect(await lowContrast(page, '.c3-space', '.c3-edge')).toEqual([])
        // The notes open: beside the conversation on a desktop, over it on a phone.
        await open(page, light, `at=${hour}${asked}&notes=open`)
        expect(await lowContrast(page, '.c3-space', '.c3-edge')).toEqual([])
      })
    }
  }
}

test('@phone · light by hour · at night the field’s «Still up?» fits its line', async ({ page }) => {
  await open(page, 'night', 'at=23:30')
  const field = page.locator('#c-input')
  await expect(field).toHaveAttribute('placeholder', /^Still up\?/)
  await page.evaluate(() => document.fonts.ready)
  // The placeholder's width in the field's own type against the room inside its padding (as phone-fits measures).
  const fit = await field.evaluate((input: HTMLTextAreaElement) => {
    const s = getComputedStyle(input)
    const canvas = document.createElement('canvas').getContext('2d')
    if (!canvas) return null
    canvas.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
    canvas.letterSpacing = s.letterSpacing
    const room = input.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
    return { words: Math.ceil(canvas.measureText(input.placeholder).width), room }
  })
  expect(fit).not.toBeNull()
  expect(fit?.words ?? Infinity).toBeLessThanOrEqual(fit?.room ?? 0)
  // One line: the field stands as high as by day.
  const night = await field.evaluate((f) => f.getBoundingClientRect().height)
  await open(page, 'day', 'at=14:00')
  expect(await field.evaluate((f) => f.getBoundingClientRect().height)).toBe(night)
})

// What her light takes, read from the page's pixels (the plan note's Measured): lowContrast composites background
// colours, and her light is a gradient beside the words. On paper it darkens the ground under the first day's words at
// the start of a talk, right under the head, most by day. Here the words are made transparent, the light held at the
// peak of its breath, and the ground under each line of the words read from a screenshot: its darkest pixel against the
// words' ink.

interface Line {
  ink: string
  opacity: number
  box: { x: number; y: number; width: number; height: number }
}

/** In the page: each line of the first day's words at the start of the talk, with its ink and opacity. */
function firstDayLines(): Line[] {
  const lines: Line[] = []
  const day = document.querySelector('.msgs > .c3-day')
  const walk = day ? document.createTreeWalker(day, NodeFilter.SHOW_TEXT) : null
  for (let n = walk?.nextNode(); n; n = walk?.nextNode()) {
    const el = n.parentElement
    if (!el || !n.textContent?.trim()) continue
    let opacity = 1
    for (let up: Element | null = el; up; up = up.parentElement) opacity *= parseFloat(getComputedStyle(up).opacity)
    const range = document.createRange()
    range.selectNodeContents(n)
    // Line by line: a wrapped divider's box would take in its hairlines.
    for (const r of range.getClientRects())
      lines.push({
        ink: getComputedStyle(el).color,
        opacity,
        box: { x: r.x, y: r.y, width: r.width, height: r.height },
      })
  }
  return lines
}

/** In the page: the colours of a screenshot's pixels under each box (CSS px, at the screenshot's scale). */
async function groundsUnder([png, boxes, scale]: readonly [string, Line['box'][], number]): Promise<string[][]> {
  const img = new Image()
  img.src = `data:image/png;base64,${png}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const pen = canvas.getContext('2d')
  pen?.drawImage(img, 0, 0)
  return boxes.map((b) => {
    const at = (v: number) => Math.max(0, Math.floor(v * scale))
    const px = pen?.getImageData(at(b.x), at(b.y), Math.max(1, at(b.width)), Math.max(1, at(b.height))).data ?? []
    const seen = new Set<string>()
    for (let i = 0; i < px.length; i += 4) seen.add(`rgb(${String(px[i])}, ${String(px[i + 1])}, ${String(px[i + 2])})`)
    return [...seen]
  })
}

/** The lowest contrast of the first day's words over the ground under them, her light at its fullest. */
async function firstDayOverHerLight(page: Page): Promise<number> {
  await page.locator('.msgs').evaluate((list) => {
    list.style.scrollBehavior = 'auto'
    list.scrollTop = 0
  })
  await expect(page.locator('.c3-convo')).not.toHaveClass(/scrolled/)
  await page.evaluate(async () => {
    await document.fonts.ready
    const arriving = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity)
    await Promise.all(arriving.map((a) => a.finished.catch(() => null)))
  })
  const lines = await page.evaluate(firstDayLines)
  expect(lines.length).toBeGreaterThan(0)
  // The words gone, the breath held at its peak (halfway through), the grain off.
  const held = await page.addStyleTag({
    content: `.c3-space, .c3-space * { color: transparent !important; text-shadow: none !important }
      .c3-ambient { animation-duration: 2s !important; animation-delay: -1s !important;
        animation-play-state: paused !important }
      body::after { display: none !important }`,
  })
  const png = (await page.screenshot()).toString('base64')
  await held.evaluate((tag: HTMLStyleElement) => tag.remove())
  const scale = await page.evaluate(() => devicePixelRatio)
  const grounds = await page.evaluate(groundsUnder, [png, lines.map((l) => l.box), scale] as const)
  const ratios = lines.flatMap(({ ink, opacity }, i) =>
    (grounds[i] ?? []).map((ground) => contrastOf({ words: '', ink, opacity, grounds: [ground], size: 0 })),
  )
  return Math.min(...ratios)
}

for (const phone of [false, true]) {
  test(`${phone ? '@phone · ' : ''}light by hour · on paper, at a talk's start the first day's words read at 4.5:1 over her light at its fullest, at every hour`, async ({
    page,
  }) => {
    const below: string[] = []
    for (const [light, hour] of HOURS) {
      await page.goto(`/personal.html?all=1&at=${hour}&theme=light`)
      await expect(page.locator('.c3-space.you')).toHaveAttribute('data-hour', light)
      await expect(page.locator('.msgs > .c3-day').first()).toBeVisible()
      const lowest = await firstDayOverHerLight(page)
      if (lowest < 4.5) below.push(`${light} (${lowest.toFixed(2)})`)
    }
    expect(below).toEqual([])
  })
}
