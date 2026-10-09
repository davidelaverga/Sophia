import { expect, test } from '@playwright/test'

// The grain stays still (docs/plans/still-grain.md): the film grain over every page keeps its texture and its 3 %, and
// never moves. Motion in the Studio is for events.

const PAGES = [
  ['the sign-in', '/signin.html'],
  ['home', '/home.html?demo=1'],
  ['the room', '/room.html?demo=1'],
] as const

for (const [name, url] of PAGES) {
  test(`grain · on ${name}, the grain is there and still`, async ({ page }) => {
    await page.goto(url)
    await expect(page.locator('body')).toBeVisible()
    const grain = await page.evaluate(() => {
      const s = getComputedStyle(document.body, '::after')
      return { image: s.backgroundImage.startsWith('url('), opacity: s.opacity, animation: s.animationName }
    })
    expect(grain).toEqual({ image: true, opacity: '0.03', animation: 'none' })
    // Nothing on the body's own layer runs for ever.
    const forever = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations === Infinity)
          .filter((a) => a.effect instanceof KeyframeEffect && a.effect.target === document.body).length,
    )
    expect(forever).toBe(0)
  })
}
