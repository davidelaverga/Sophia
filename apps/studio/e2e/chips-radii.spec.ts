import { expect, test } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// Four radii and one chip (docs/plans/chips-radii.md): on each fixture page, once drawn, every box a person can see
// stands on 4, 6, 8 or 12 px of radius, or is round (a radius of half its side or more: a pill, a dot, a face), or is
// a hairline (a bar no taller than 4 px); and every chip is the kit's: a state chip 20 px tall in the small type at
// 500, a data chip 18 px in the mono label type, a key 18 px, all on the first radius. Measured on a desktop.

const PAGES = [
  ['sign-in', '/signin.html', DRAWN.signin],
  ['the door', '/join.html?demo=1', DRAWN.join],
  ['home', '/home.html?demo=1', DRAWN.home],
  ['personal', '/personal.html?demo=1', DRAWN.personal],
  ['the room', '/room.html?demo=1', DRAWN.room],
  ['the room in a call', '/room.html?demo=1&call=on&people=2&floor=1&sophia=listening', DRAWN.room.slice(0, 1)],
  ['Conversations', '/room.html?demo=1&conversations=1&place=conversations', DRAWN.conversations],
  ['Goals', '/room.html?demo=1&place=goals', DRAWN.goals],
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates],
  ['Resources', '/resources.html', DRAWN.resources],
  ['the work space', '/work.html', DRAWN.work],
] as const

/**
 * In the page: every visible box whose radius is not one of the four, not round, and not a hairline, said with its
 * radius and size. A corner given in percent is round at 50 or more.
 */
function readRadii() {
  const tokens = new Set([0, 4, 6, 8, 12])
  const off: string[] = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.fixture-label')) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    const cs = getComputedStyle(el)
    const side = Math.min(r.width, r.height)
    if (side <= 4) continue
    const corners = [
      cs.borderTopLeftRadius,
      cs.borderTopRightRadius,
      cs.borderBottomRightRadius,
      cs.borderBottomLeftRadius,
    ]
    const loose = corners.find((c) => {
      if (c.includes('%')) return parseFloat(c) < 50
      const px = parseFloat(c)
      return !tokens.has(Math.round(px * 100) / 100) && px < side / 2 - 0.5
    })
    if (loose === undefined) continue
    const name = `${el.tagName.toLowerCase()}.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
    off.push(`${name} ${loose} (${String(Math.round(r.width))}×${String(Math.round(r.height))})`)
  }
  return [...new Set(off)]
}

/** In the page: every visible chip and key, with its height, radius and type. */
function readChips() {
  return [...document.querySelectorAll<HTMLElement>('.chip, kbd')]
    .filter((el) => el.getBoundingClientRect().height > 0 && !el.closest('.fixture-label'))
    .map((el) => {
      const cs = getComputedStyle(el)
      const kind: 'state' | 'data' | 'key' =
        el.tagName === 'KBD' ? 'key' : el.classList.contains('chip-data') ? 'data' : 'state'
      return {
        kind,
        height: Math.round(el.getBoundingClientRect().height),
        radius: cs.borderRadius,
        type: `${cs.fontSize}/${cs.fontWeight} ${cs.fontFamily.includes('Mono') ? 'mono' : 'sans'}`,
      }
    })
}

const CHIPS = {
  state: { height: 20, radius: '4px', type: '12px/500 sans' },
  data: { height: 18, radius: '4px', type: '10.5px/500 mono' },
  key: { height: 18, radius: '4px', type: '10.5px/500 mono' },
}

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
    ...(window.workFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

for (const [name, url, parts] of PAGES) {
  test(`radii · on ${name}, every box stands on 4, 6, 8 or 12 px, or is round, or a hairline`, async ({ page }) => {
    await page.goto(url)
    // The page has drawn: each of its reads (drawn.ts), never «the network is idle».
    await drawn(page, parts)
    expect(await page.evaluate(readRadii)).toEqual([])
  })
}

for (const [name, url, parts] of [
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Resources', '/resources.html', DRAWN.resources],
  ['Goals', '/room.html?demo=1&place=goals', DRAWN.goals],
] as const) {
  test(`chips · on ${name}, every chip and key is the kit’s`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    const chips = await page.evaluate(readChips)
    expect(chips.length).toBeGreaterThan(0)
    const off = chips.filter((c) => {
      const want = CHIPS[c.kind]
      return c.height !== want.height || c.radius !== want.radius || c.type !== want.type
    })
    expect(off).toEqual([])
  })
}
