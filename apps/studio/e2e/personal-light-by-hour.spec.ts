import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
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
