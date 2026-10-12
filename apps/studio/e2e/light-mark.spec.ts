// The mark and her light on paper (docs/plans/light-paper-mark.md): in light the mark's halves are the brand's paper
// inks, the favicon's; Sophia's half carries no glow at rest and a soft one live; her light has a white heart. In the
// room the halves keep the warm and the core.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const INK = 'rgb(22, 21, 27)'
const HALO_DEEP = 'rgb(132, 104, 238)'

/** Every mark's halves as drawn: the fills, and Sophia's filter. */
const marks = (page: Page) =>
  page.evaluate(() =>
    // The bar's mark (`svg.umbral`) and Home's formed threshold (`svg.threshold`): both carry `data-mark="umbral"`.
    [...document.querySelectorAll<SVGSVGElement>('svg[data-mark="umbral"]')]
      .filter((svg) => svg.getClientRects().length > 0)
      .map((svg) => {
        const you = svg.querySelector('.umbral-you')
        const her = svg.querySelector('.umbral-sophia')
        return {
          where: svg.closest('.threshold') ? 'threshold' : (svg.parentElement?.className ?? ''),
          live: svg.hasAttribute('data-live'),
          you: you ? getComputedStyle(you).fill : null,
          her: her ? getComputedStyle(her).fill : null,
          filter: her ? getComputedStyle(her).filter : null,
        }
      }),
  )

const PAGES: readonly [string, string, (typeof DRAWN)[keyof typeof DRAWN]][] = [
  ['sign-in', '/signin.html?theme=light', DRAWN.signin],
  ['the room', '/room.html?demo=1&theme=light', DRAWN.room],
  ['Home', '/home.html?demo=1&theme=light', DRAWN.home],
]

for (const [name, url, parts] of PAGES) {
  test(`light · ${name}: the mark's halves are the brand's paper inks, no glow at rest`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    const seen = await marks(page)
    expect(seen.length).toBeGreaterThan(0)
    for (const m of seen) {
      expect(m.you, m.where).toBe(INK)
      expect(m.her, m.where).toBe(HALO_DEEP)
      // The threshold breathes (its keyframes animate the filter); the bar's mark rests without one.
      if (m.where !== 'threshold' && !m.live) expect(m.filter, m.where).toBe('none')
    }
  })
}

test('light · under reduced motion the formed threshold keeps its still halo on paper', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/home.html?demo=1&theme=light')
  await drawn(page, DRAWN.home)
  const seen = await marks(page)
  const threshold = seen.find((m) => m.where === 'threshold')
  expect(threshold).toBeDefined()
  expect(threshold?.her).toBe(HALO_DEEP)
  expect(threshold?.filter).toMatch(/drop-shadow/)
})

test('light · the favicon switches to the same two paper inks', async ({ page, request }) => {
  const svg = await (await request.get('/favicon.svg')).text()
  expect(svg).toMatch(/prefers-color-scheme: light[^}]*\.y\{fill:#16151B\}\.s\{fill:#8468EE\}/i)
  await page.goto('/signin.html?theme=light')
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    return [cs.getPropertyValue('--mark-you').trim(), cs.getPropertyValue('--mark-sophia').trim()]
  })
  expect(tokens).toEqual(['#16151b', '#8468ee'])
})

test('light · her light on paper has a white heart; in the room the mark keeps the warm and the core', async ({
  page,
}) => {
  await page.goto('/signin.html?theme=light')
  await drawn(page, DRAWN.signin)
  const light = await page.evaluate(() => {
    const el = document.querySelector('.light')
    // The halo on paper is the light's `::after`, which breathes (docs/plans/light-breath.md).
    return el ? getComputedStyle(el, '::after').backgroundImage : ''
  })
  expect(light).toMatch(
    /^radial-gradient\(circle at 50% 42%, rgba\(255, 255, 255, 0\.96\) 0px, rgba\(255, 255, 255, 0\.86\) 4%, rgba\(85, 70, 184, 0\.4\) 8\.5%/,
  )
  await page.goto('/signin.html')
  await drawn(page, DRAWN.signin)
  const [m] = await marks(page)
  expect(m?.you).toBe('rgb(241, 220, 199)')
  expect(m?.her).toBe('rgb(244, 240, 255)')
})

for (const [system, chosen] of [
  ['dark', 'light'],
  ['light', 'dark'],
] as const) {
  test(`light · ${chosen} chosen on a ${system} system: the tab's mark is the ${chosen} one (Codex on #249)`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ colorScheme: system })
    await page.addInitScript((theme) => localStorage.setItem('sophia.theme', theme), chosen)
    await page.goto('/opening.html') // the Studio's own index.html, as it ships
    const icon = page.locator('link[rel="icon"][type="image/svg+xml"]')
    await expect(icon).toHaveAttribute('href', `/favicon-${chosen}.svg`)
    const svg = await (await request.get(`/favicon-${chosen}.svg`)).text()
    expect(svg).toContain(chosen === 'light' ? 'fill="#16151B"' : 'fill="#F1DCC7"')
    expect(svg).toContain(chosen === 'light' ? 'fill="#8468EE"' : 'fill="#F4F0FF"')
  })
}
