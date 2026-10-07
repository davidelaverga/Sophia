import { expect, test } from '@playwright/test'
import { lowContrast } from './contrast.ts'

// The third ink reads (docs/plans/tertiary-ink.md): every word a page shows at rest reads at 4.5:1 or more, on the
// screens a person meets first. On the fixture pages; only the API is faked.

const PAGES = [
  ['home', '/home.html?demo=1'],
  ['personal', '/personal.html?demo=1'],
  ['the room', '/room.html?demo=1'],
  ['Knowledge', '/room.html?demo=1&place=knowledge'],
  ['Updates', '/room.html?demo=1&place=updates'],
] as const

for (const [name, url] of PAGES) {
  for (const phone of [false, true]) {
    test(`ink${phone ? ' @phone' : ''} · on ${name}, every word at rest reads at 4.5:1`, async ({ page }) => {
      await page.goto(url)
      await expect(page.locator('body')).not.toBeEmpty()
      await page.waitForLoadState('networkidle')
      expect(await lowContrast(page, 'body')).toEqual([])
    })
  }
}
