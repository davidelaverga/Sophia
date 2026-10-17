// A speaker's meter and ring follow their voice (docs/plans/voice-meters.md): no loop of their own, the bars and the
// glow move with how loud they are now, through the same envelope as Sophia's light; a re-render mid-speech restarts
// nothing, and what stops speaking rests. The fixture's voices are set by hand (`window.fixture.voiceLevel`).
import { expect, test, type Page } from '@playwright/test'

const MARCO = '00000000-0000-4000-8000-0000000000b1'
const LUCIA = '00000000-0000-4000-8000-0000000000b2'

const voice = (page: Page, who: 'sophia' | number, level: number) =>
  page.evaluate(([w, l]) => window.fixture?.voiceLevel(w, l), [who, level] as const)

/** A presence's four bars as drawn, their running animations, and its orbit's glow (its second shadow's alpha). */
const meterOf = (page: Page, actor: string) =>
  page.locator(`.presence[data-actor="${actor}"]`).evaluate((li) => {
    const bars = [...li.querySelectorAll('.meter i')]
    const shadows = [...getComputedStyle(li.querySelector('.orbit') ?? li).boxShadow.matchAll(/rgba?\(([^)]+)\)/g)]
    return {
      heights: bars.map((b) => b.getBoundingClientRect().height),
      running: bars.reduce((n, b) => n + b.getAnimations().length, 0),
      glow: Number(shadows[1]?.[1]?.split(',')[3] ?? 1),
    }
  })
const tallest = async (page: Page, actor: string) => Math.max(...(await meterOf(page, actor)).heights)

/** The speaking tile's glow: its second shadow's blur, in px. */
const tileGlow = (page: Page) =>
  page.locator('.tile[data-speaking]').evaluate((el) => {
    const second = getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/)[1] ?? ''
    return Number(/(?:[\d.]+px\s+){2}([\d.]+)px/.exec(second.replace(/rgba?\([^)]*\)/, ''))?.[1] ?? 0)
  })

/** Elements still carrying a level written by the meters. */
const written = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('[data-actor]')].filter((el) => el.style.getPropertyValue('--level'))
        .length,
  )

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('people · a speaker’s meter follows their voice, with no loop of its own', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&speaking=1')
  await expect(page.locator(`.presence[data-actor="${MARCO}"]`)).toHaveAttribute('data-speaking', 'true')
  await voice(page, 1, 0)
  await expect.poll(() => tallest(page, MARCO)).toBeLessThanOrEqual(3)
  expect((await meterOf(page, MARCO)).glow).toBeLessThanOrEqual(0.12)
  await voice(page, 1, 0.8)
  await expect.poll(() => tallest(page, MARCO), { timeout: 1000 }).toBeGreaterThanOrEqual(11.2)
  const reads = []
  for (let i = 0; i < 3; i++) {
    reads.push(await meterOf(page, MARCO))
    await page.waitForTimeout(100)
  }
  for (const read of reads) {
    expect(read.running).toBe(0)
    expect(Math.max(...read.heights) - Math.min(...read.heights)).toBeGreaterThanOrEqual(2)
    expect(read.glow).toBeGreaterThanOrEqual(0.3)
    for (const [i, h] of read.heights.entries())
      expect(Math.abs(h - (reads[0]?.heights[i] ?? 0))).toBeLessThanOrEqual(0.5)
  }
})

test('people · a re-render mid-speech restarts nothing; who stops speaking rests', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&speaking=1')
  await voice(page, 1, 0.8)
  await expect.poll(() => tallest(page, MARCO), { timeout: 1000 }).toBeGreaterThanOrEqual(11.2)
  // Someone else starts speaking: the room re-renders, and Marco's meter keeps its height.
  await page.evaluate(() => window.fixture?.speaking([1, 2]))
  await expect(page.locator(`.presence[data-actor="${LUCIA}"]`)).toHaveAttribute('data-speaking', 'true')
  const low = await page
    .locator(`.presence[data-actor="${MARCO}"] .meter i`)
    .nth(1)
    .evaluate(
      (bar) =>
        new Promise<number>((done) => {
          let min = Infinity
          const until = performance.now() + 300
          const read = () => {
            min = Math.min(min, bar.getBoundingClientRect().height)
            if (performance.now() < until) requestAnimationFrame(read)
            else done(min)
          }
          requestAnimationFrame(read)
        }),
    )
  expect(low).toBeGreaterThanOrEqual(11)
  await page.evaluate(() => window.fixture?.speaking(null))
  await expect.poll(() => written(page)).toBe(0)
})

test('people · on video a speaker’s tile glows with their voice', async ({ page }) => {
  await page.goto('/room.html?call=on&people=3&video=camera&speaking=2')
  await expect(page.locator('.tile[data-speaking]')).toHaveCount(1)
  await voice(page, 2, 0)
  await expect.poll(() => tileGlow(page)).toBeLessThanOrEqual(18)
  await voice(page, 2, 0.8)
  await expect.poll(() => tileGlow(page), { timeout: 1000 }).toBeGreaterThanOrEqual(40)
})

test('motion · under reduced motion a speaker’s meter stands still, as before', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/room.html?call=on&people=1&speaking=1')
  await voice(page, 1, 0.9)
  await page.waitForTimeout(400)
  const first = await meterOf(page, MARCO)
  await page.waitForTimeout(200)
  const again = await meterOf(page, MARCO)
  expect(Math.abs(Math.max(...first.heights) - 6.6)).toBeLessThanOrEqual(0.5)
  expect(again.heights).toEqual(first.heights)
  expect(await written(page)).toBe(0)
})
