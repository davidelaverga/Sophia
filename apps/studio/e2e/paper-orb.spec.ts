// On paper Sophia is a solid orb, glass with a heart of clouds (docs/plans/paper-orb.md; Luis, 2026-10-17: «un orbe
// sólido, tipo ChatGPT»): it stands where the engine draws her, clear of the words under her, and the room moves it:
// her state, her voice while she is heard, whom she attends to. Where the light forms the mark, the mark is her. Every
// name is synthetic.
import { expect, test, type Page } from '@playwright/test'

const stage = (page: Page) => page.locator('.room-stage > .light')

/** The orb as drawn, from its glass's computed geometry, beside her place and size as the engine wrote them. */
const orbRead = (page: Page) =>
  stage(page).evaluate((el) => {
    const glass = getComputedStyle(el, '::after')
    const box = getComputedStyle(el)
    const num = (name: string) => parseFloat(box.getPropertyValue(name))
    const [x = Number.NaN, y = Number.NaN] = glass.translate.split(' ').map((v) => parseFloat(v))
    const scale = parseFloat(glass.scale)
    const words = el.parentElement?.querySelector('.sophia-line')?.getBoundingClientRect()
    return {
      round: glass.borderRadius,
      x,
      y,
      scale,
      r: (parseFloat(glass.width) / 2) * scale,
      lx: num('--lx'),
      ly: num('--ly'),
      lr: num('--lr'),
      ls: num('--ls'),
      wordsTop: words ? words.top - el.getBoundingClientRect().top : Number.NaN,
    }
  })

/** One pixel of the page as drawn, decoded in the page (the room fixture answers fetches itself). */
async function pixelAt(page: Page, x: number, y: number) {
  const png = (await page.screenshot({ clip: { x, y, width: 1, height: 1 }, animations: 'disabled' })).toString(
    'base64',
  )
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    ctx?.drawImage(img, 0, 0)
    const [r = 0, g = 0, b = 0] = ctx ? Array.from(ctx.getImageData(0, 0, 1, 1).data) : []
    return { r, g, b }
  }, png)
}

const voice = (page: Page, level: number) => page.evaluate((l) => window.fixture?.voiceLevel('sophia', l), level)

/** The inner light's brightness filter (her voice lifts it). */
const brightness = (page: Page) =>
  stage(page).evaluate((el) => Number(/brightness\(([\d.]+)\)/.exec(getComputedStyle(el, '::before').filter)?.[1] ?? 0))

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('orb · on paper Sophia is a solid orb where the engine draws her, clear of her words', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/room.html?theme=light')
  await expect(stage(page)).toHaveAttribute('data-mode', 'rest')
  await expect.poll(async () => (await orbRead(page)).lr).toBeGreaterThan(100)
  const o = await orbRead(page)
  expect(o.round).toBe('50%')
  expect(Math.abs(o.x - o.lx)).toBeLessThanOrEqual(1)
  expect(Math.abs(o.y - o.ly)).toBeLessThanOrEqual(1)
  // 0.6 of her radius across, times her size now.
  expect(Math.abs(o.r * 2 - 0.6 * o.lr * Math.min(o.ls, 1.2))).toBeLessThanOrEqual(1)
  expect(o.y + o.r).toBeLessThan(o.wordsTop)
  // Solid: its centre is her violet, not the paper seen through a glow.
  const at = await stage(page).boundingBox()
  const px = await pixelAt(page, (at?.x ?? 0) + o.lx, (at?.y ?? 0) + o.ly + o.r * 0.5)
  expect(px.b - px.g, JSON.stringify(px)).toBeGreaterThanOrEqual(25)
  expect(px.r + px.g + px.b, JSON.stringify(px)).toBeLessThan(700)
})

test('orb · the dark page keeps its canvas: no orb is drawn there', async ({ page }) => {
  await page.goto('/room.html')
  await expect(stage(page)).toBeVisible()
  expect(await stage(page).evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none')
})

for (const [query, mode, heart] of [
  ['&call=on&sophia=here', 'rest', '24%'],
  ['&call=on&people=2&floor=1&sophia=listening', 'listen', '32%'],
  ['&call=on&people=2&floor=1&sophia=answering', 'think', '14%'],
  ['&call=on&sophia=speaking', 'speak', '28%'],
  ['&research=running', 'work', '20%'],
] as const) {
  test(`orb · her state reads in her heart: ${mode}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/room.html?theme=light${query}`)
    await expect(stage(page)).toHaveAttribute('data-mode', mode)
    await expect
      .poll(() => stage(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--gc-heart').trim()))
      .toBe(heart)
  })
}

test('orb · her voice swells her and lifts her heart while she speaks, and only then', async ({ page }) => {
  await page.goto('/room.html?call=on&sophia=speaking&theme=light')
  await expect(stage(page)).toHaveAttribute('data-mode', 'speak')
  await voice(page, 0)
  // Her light ignites on arrival (a slow spring, about 4 s to within 1 %): read once it has.
  await expect.poll(async () => (await orbRead(page)).ls, { timeout: 8000 }).toBeGreaterThanOrEqual(0.99)
  const quiet = (await orbRead(page)).scale
  await voice(page, 0.9)
  await expect.poll(async () => (await orbRead(page)).scale / quiet, { timeout: 2000 }).toBeGreaterThanOrEqual(1.15)
  await expect.poll(() => brightness(page), { timeout: 2000 }).toBeGreaterThanOrEqual(1.06)
})

test('orb · she leans toward the one who holds the floor', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=listening&theme=light')
  await expect(stage(page)).toHaveAttribute('data-mode', 'listen')
  const side = await page.evaluate(() => {
    const light = document.querySelector<HTMLElement>('.room-stage > .light')
    const holder = document.querySelector('.presence[data-floor] .orbit')?.getBoundingClientRect()
    if (!light || !holder) return 0
    const lx = parseFloat(getComputedStyle(light).getPropertyValue('--lx'))
    return Math.sign(holder.left + holder.width / 2 - light.getBoundingClientRect().left - lx)
  })
  expect(side).not.toBe(0)
  const lean = () => stage(page).evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--ldx')))
  await expect.poll(async () => (await lean()) * side, { timeout: 3000 }).toBeGreaterThanOrEqual(0.3)
})

test('orb · a swell on a loud voice never takes her past 1.2 of her size, so her words stay clear', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/room.html?theme=light')
  await expect.poll(async () => (await orbRead(page)).lr).toBeGreaterThan(100)
  await stage(page).evaluate((el) => el.style.setProperty('--ls', '1.44'))
  const o = await orbRead(page)
  expect(Math.abs(o.scale - (3 * o.lr * 1.2) / 1000)).toBeLessThanOrEqual(0.005)
})

test('orb · where the light forms the mark, the orb steps back: the mark is her', async ({ page }) => {
  await page.goto('/home.html?theme=light')
  const light = page.locator('.light[data-mark]').first()
  await expect(light).toBeVisible()
  await expect.poll(() => light.evaluate((el) => getComputedStyle(el, '::after').opacity)).toBe('0')
})

test('orb · in text mode her voice doesn’t reach her light: she is read, not heard', async ({ page }) => {
  await page.goto('/room.html?call=on&sophia=speaking&theme=light')
  await page.locator('.panel-toggles [data-panel="chat"]').click()
  const bar = page.locator('[data-typing-sink]').first()
  await bar.fill('A question, typed')
  await bar.press('Enter') // typing to Sophia puts the call in text mode
  await expect(page.getByRole('button', { name: /^Text mode/ })).toHaveAttribute('aria-pressed', 'true')
  await voice(page, 0.9)
  await page.waitForTimeout(600)
  expect(await stage(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--amp').trim() || '0.00')).toBe(
    '0.00',
  )
  expect(await brightness(page)).toBeLessThanOrEqual(1.001)
})

test('orb · under reduced motion she stands still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/signin.html?theme=light')
  const light = page.locator('.light').first()
  await expect(light).toBeVisible()
  await page.waitForTimeout(600)
  const running = await light.evaluate(
    (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
  )
  expect(running).toBe(0)
})
