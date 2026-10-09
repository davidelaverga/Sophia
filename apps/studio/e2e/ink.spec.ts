import { expect, test } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { DRAWN, drawn } from './drawn.ts'

// The third ink reads (docs/plans/tertiary-ink.md): every word a page shows at rest reads at 4.5:1 or more, on the
// screens a person meets first. On the fixture pages; only the API is faked.

const PAGES = [
  ['home', '/home.html?demo=1', DRAWN.home],
  ['personal', '/personal.html?demo=1', DRAWN.personal],
  ['the room', '/room.html?demo=1', DRAWN.room],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates],
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
