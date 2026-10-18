// The tab's mark before the Studio paints (docs/plans/light-tab-and-launch.md, D18): the tab is the browser's colour,
// not the page's, so the mark the page sets for the appearance shown (entry.js, theme.ts) reads at 3:1 or more on a tab
// of the other kind too, as Chromium draws it. The page is the Studio's own index.html (fixtures/opening.tsx).
import { expect, test, type Page } from '@playwright/test'
import { contrastOf } from './contrast.ts'

/**
 * Points of the 48-unit icon inside each half of the mark, whether it fills the icon or sits at 0.62 on a tile, and
 * one below it: the ground the mark is seen on.
 */
const AT = { you: [20, 26], her: [33.5, 17], ground: [24, 44] } as const

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** An SVG drawn at 96 px over a tab's colour, as the browser draws an image: the colours at AT, as `rgb()`. */
const drawnOn = (page: Page, svg: string, tab: string) =>
  page.evaluate(
    async ({ source, ground, at }) => {
      const image = new Image(96, 96)
      image.src = `data:image/svg+xml,${encodeURIComponent(source)}`
      await image.decode()
      const canvas = new OffscreenCanvas(96, 96)
      const context = canvas.getContext('2d')
      if (!context) return null
      context.fillStyle = ground
      context.fillRect(0, 0, 96, 96)
      context.drawImage(image, 0, 0, 96, 96)
      const read = ([x, y]: readonly [number, number]) => {
        const [r = 0, g = 0, b = 0] = context.getImageData(x * 2, y * 2, 1, 1).data
        return `rgb(${String(r)}, ${String(g)}, ${String(b)})`
      }
      return { you: read(at.you), her: read(at.her), ground: read(at.ground) }
    },
    { source: svg, ground: tab, at: AT },
  )

/** A half's ink over the ground beside it. */
const ratio = (ink: string, ground: string) => contrastOf({ words: '', ink, opacity: 1, grounds: [ground], size: 0 })

for (const [system, chosen, tab] of [
  // No choice is the room, whatever the system: its mark in a light system's white tab (1.33 and 1.12:1 before).
  ['light', null, '#ffffff'],
  // Light chosen on a dark system: paper's mark in a near-black tab strip (Chrome's).
  ['dark', 'light', '#202124'],
] as const) {
  test(`light · ${chosen ?? 'no choice'} on a ${system} system: the tab's mark reads at 3:1 on its ${tab} tab`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ colorScheme: system })
    if (chosen) await page.addInitScript((theme) => localStorage.setItem('sophia.theme', theme), chosen)
    await page.goto('/opening.html')
    const icon = page.locator('link[rel="icon"][type="image/svg+xml"]')
    await expect(icon).toHaveAttribute('href', `/favicon-${chosen ?? 'dark'}.svg`)
    const svg = await (await request.get(`/favicon-${chosen ?? 'dark'}.svg`)).text()
    const seen = await drawnOn(page, svg, tab)
    expect(seen).not.toBeNull()
    if (!seen) return
    expect.soft(ratio(seen.you, seen.ground), `your half on ${seen.ground}`).toBeGreaterThanOrEqual(3)
    expect.soft(ratio(seen.her, seen.ground), `Sophia's half on ${seen.ground}`).toBeGreaterThanOrEqual(3)
  })
}
