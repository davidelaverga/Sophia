// Her light breathes on paper (docs/plans/light-breath.md): in light she is an orb drawn by the light's pseudo-elements
// (docs/plans/paper-orb.md), drifting and breathing, still under reduced motion; the trace canvas sits above it; Home's
// light blends as ink; on the dark page the light carries no CSS animation (its canvas breathes instead).
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

/** The light as drawn: its running animations (the pseudo-elements' included), the orb's first layer, the trace's layer. */
const lightRead = (page: Page) =>
  page.evaluate(() => {
    const light = document.querySelector<HTMLElement>('.light')
    if (!light) return null
    // Its loops, not the transitions its states ease through as the page arrives.
    const running = light
      .getAnimations({ subtree: true })
      .filter((a) => a.playState === 'running' && a instanceof CSSAnimation)
    const trace = light.querySelector<HTMLElement>('.light-trace')
    return {
      animations: running.length,
      names: running.map((a) => (a instanceof CSSAnimation ? a.animationName : a.constructor.name)),
      halo: getComputedStyle(light, '::after').backgroundImage.slice(0, 100),
      traceZ: trace ? getComputedStyle(trace).zIndex : null,
      haloZ: getComputedStyle(light, '::after').zIndex,
      isolation: getComputedStyle(light).isolation,
      blend: getComputedStyle(light).mixBlendMode,
    }
  })

// Sign-in and the room alike: the orb's glass begins with its glint (paper-orb.md), and it drifts and breathes.
const GLINT = /^radial-gradient\(13% 8% at 34% 24%, rgba?\(255,? 255,? 255,? \/? ?0\.92\)/
// The demo's room has her work running, so she is here at work (orb-presence.md): she drifts and breathes there too.
for (const [name, url, parts, loops] of [
  ['sign-in', '/signin.html?theme=light', DRAWN.signin, ['gc-drift', 'gc-breathe']],
  ['the room', '/room.html?demo=1&theme=light', DRAWN.room, ['gc-drift', 'gc-breathe']],
] as const) {
  test(`light · ${name}: her light breathes on paper, behind what the light holds`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    const read = await lightRead(page)
    expect(read?.names).toEqual(loops)
    expect(read?.halo).toMatch(GLINT)
    // The halo at the back of the light's own stacking: the trace and the formed mark paint over it.
    expect(read?.haloZ).toBe('-1')
    expect(read?.isolation).toBe('isolate')
  })
}

test('light · without WebGL the paper orb stands alone: no dark fallback radial under it', async ({ page }) => {
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

test('light · on Home her light is laid on the page unblended, and the formed mark stands over the halo', async ({
  page,
}) => {
  await page.goto('/home.html?demo=1&theme=light')
  await drawn(page, DRAWN.home)
  const read = await lightRead(page)
  expect(read?.blend).toBe('normal')
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

/** The mark's pixels as drawn: how many are exactly the brand's violet, and how many its paper-multiplied shade. */
async function markPixels(page: Page) {
  const mark = page.locator('.light > svg.threshold')
  await expect(mark).toBeVisible()
  const png = (await mark.screenshot({ animations: 'disabled' })).toString('base64')
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return { brand: 0, tinted: 0 }
    ctx.drawImage(bitmap, 0, 0)
    const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
    let brand = 0
    let tinted = 0
    for (let i = 0; i < px.length; i += 4) {
      const hex = [px[i], px[i + 1], px[i + 2]].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')
      if (hex === '8468ee') brand += 1
      if (hex === '8265e3') tinted += 1
    }
    return { brand, tinted }
  }, png)
}

for (const [name, url] of [
  ['without needs', '/home.html?theme=light'],
  ['with needs', '/home.html?demo=1&theme=light'],
] as const) {
  test(`light · on Home ${name} the formed mark draws in the brand's violet, not tinted by the paper (Codex on #251)`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(url)
    const read = await markPixels(page)
    expect(read.brand).toBeGreaterThan(20)
    expect(read.tinted).toBe(0)
  })
}

test('light · Talk on paper: no screen blend on the light, the formed mark in the brand’s violet (Codex on #251)', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/personal.html?voice=1&step=150&theme=light')
  await page.getByRole('button', { name: 'Talk with her' }).click()
  const light = page.getByRole('dialog', { name: 'Talking with Sophia' }).locator('.c3-talk-light .light')
  await expect(light).toHaveAttribute('data-mark', /\d+ \d+ \d+/)
  await expect(light).toHaveCSS('mix-blend-mode', 'normal')
  const read = await markPixels(page)
  expect(read.brand).toBeGreaterThan(20)
  expect(read.tinted).toBe(0)
})
