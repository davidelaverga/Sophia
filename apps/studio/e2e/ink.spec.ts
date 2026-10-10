import { expect, test } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { DRAWN, drawn } from './drawn.ts'

// The third ink reads (docs/plans/tertiary-ink.md, ink-every-page.md): every word a page shows at rest reads at 4.5:1
// or more, on the screens a person meets first. On the fixture pages; only the API is faked. Conversations check their
// own (conversation-thread.spec.ts and the others).

const PAGES = [
  ['home', '/home.html?demo=1', DRAWN.home],
  ['personal', '/personal.html?demo=1', DRAWN.personal],
  ['the room', '/room.html?demo=1', DRAWN.room],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates],
  ['Goals', '/room.html?demo=1&place=goals', DRAWN.goals],
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Resources', '/resources.html', DRAWN.resources],
  ['the work space', '/work.html', DRAWN.work],
  ['sign-in', '/signin.html', DRAWN.signin],
  ['the door', '/join.html?demo=1', DRAWN.join],
] as const

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

for (const [name, url, parts] of PAGES) {
  for (const phone of [false, true]) {
    test(`ink${phone ? ' @phone' : ''} · on ${name}, every word at rest reads at 4.5:1`, async ({ page }) => {
      await page.goto(url)
      // The page has drawn: each of its reads (drawn.ts), never «the network is idle».
      await drawn(page, parts)
      expect(await lowContrast(page, 'body')).toEqual([])
    })
  }
}

/** A colour's alpha as the browser computes it: the inks differ only in it. */
const alphaOf = (css: string) => Number(/rgba\([^)]*,\s*([\d.]+)\)$/.exec(css)?.[1] ?? 1)

for (const [name, url, parts] of [
  ['Resources', '/resources.html', DRAWN.resources],
  ['the work space', '/work.html', DRAWN.work],
] as const) {
  test(`ink · on ${name}, the chosen filter's count stands a step above the others`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    const counts = await page.locator('.filter-count').evaluateAll((els) =>
      els.map((e) => ({
        chosen: e.parentElement?.matches('[aria-selected="true"], [aria-checked="true"]') ?? false,
        color: getComputedStyle(e).color,
      })),
    )
    const chosen = counts.filter((c) => c.chosen).map((c) => alphaOf(c.color))
    const others = counts.filter((c) => !c.chosen).map((c) => alphaOf(c.color))
    expect(chosen).toHaveLength(1)
    expect(others.length).toBeGreaterThan(0)
    for (const other of others) expect(chosen[0]).toBeGreaterThan(other)
  })
}
