// Her light breathes on paper (docs/plans/light-breath.md): in light the light's halo is a pseudo-element with one running
// animation, none under reduced motion; the trace canvas sits above it; Home's light blends as ink; in the room the
// light carries no CSS animation (its canvas breathes instead).
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

/** The light as drawn: its running animations (the pseudo-element's included), the halo's first stops, the trace's layer. */
const lightRead = (page: Page) =>
  page.evaluate(() => {
    const light = document.querySelector<HTMLElement>('.light')
    if (!light) return null
    const running = light.getAnimations({ subtree: true }).filter((a) => a.playState === 'running')
    const trace = light.querySelector<HTMLElement>('.light-trace')
    return {
      animations: running.length,
      names: running.map((a) => (a instanceof CSSAnimation ? a.animationName : a.constructor.name)),
      halo: getComputedStyle(light, '::after').backgroundImage.slice(0, 70),
      traceZ: trace ? getComputedStyle(trace).zIndex : null,
      haloZ: getComputedStyle(light, '::after').zIndex,
      isolation: getComputedStyle(light).isolation,
      blend: getComputedStyle(light).mixBlendMode,
    }
  })

for (const [name, url, parts] of [
  ['sign-in', '/signin.html?theme=light', DRAWN.signin],
  ['the room', '/room.html?demo=1&theme=light', DRAWN.room],
] as const) {
  test(`light · ${name}: her light breathes on paper, behind what the light holds`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    const read = await lightRead(page)
    expect(read?.animations).toBe(1)
    expect(read?.names).toEqual(['paper-breathe'])
    expect(read?.halo).toMatch(/^radial-gradient\(circle at 50% 42%, rgba\(255, 255, 255, 0\.95\) 0px/)
    // The halo at the back of the light's own stacking: the trace and the formed mark paint over it.
    expect(read?.haloZ).toBe('-1')
    expect(read?.isolation).toBe('isolate')
  })
}

test('light · without WebGL the paper halo stands alone: no dark fallback radial under it', async ({ page }) => {
  await page.goto('/signin.html?theme=light')
  await drawn(page, DRAWN.signin)
  // The engine marks the fallback itself when WebGL fails; here the mark is set as it would be.
  const read = await page.evaluate(() => {
    const light = document.querySelector<HTMLElement>('.light')
    if (!light) return null
    light.dataset['fallback'] = ''
    return {
      own: getComputedStyle(light).backgroundImage,
      halo: getComputedStyle(light, '::after').backgroundImage.slice(0, 40),
    }
  })
  expect(read?.own).toBe('none')
  expect(read?.halo).toMatch(/^radial-gradient/)
})

test('light · under reduced motion the light on paper stands still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/signin.html?theme=light')
  await drawn(page, DRAWN.signin)
  const read = await lightRead(page)
  expect(read?.animations).toBe(0)
  expect(read?.halo).toMatch(/^radial-gradient/)
})

test('light · on Home her light blends as ink on the page, and the formed mark stands over the halo', async ({
  page,
}) => {
  await page.goto('/home.html?demo=1&theme=light')
  await drawn(page, DRAWN.home)
  const read = await lightRead(page)
  expect(read?.blend).toBe('multiply')
  expect(read?.haloZ).toBe('-1')
  // The mark is a positioned child of the light, which isolates its stacking: with the halo at -1 the mark paints over
  // it (a hit test cannot say so: the light takes no pointer events).
  const mark = await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('.light > svg.threshold')
    return svg ? { position: getComputedStyle(svg).position, z: getComputedStyle(svg).zIndex } : null
  })
  expect(mark?.position).toBe('absolute')
  expect(['auto', '0', '1']).toContain(mark?.z)
})

test('the room: the light carries no CSS animation (its canvas breathes), and no halo pseudo-element', async ({
  page,
}) => {
  await page.goto('/signin.html')
  await drawn(page, DRAWN.signin)
  const read = await lightRead(page)
  expect(read?.animations).toBe(0)
  expect(read?.halo).toBe('none')
})
