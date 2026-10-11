// A view's title at the size of a title (docs/plans/view-titles.md): on each view of a project the first word is
// 28 px on the grid's 32, the heading weight, and nothing visible on the page is larger; on a phone the same.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const VIEWS: readonly [string, string, (typeof DRAWN)[keyof typeof DRAWN]][] = [
  ['Goals', '/room.html?demo=1&place=goals', DRAWN.goals],
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates],
  ['Resources', '/resources.html', DRAWN.resources],
  ['the work space', '/work.html', DRAWN.work],
]

/** The view's title as drawn: its size, leading and weight; and the largest font size of any visible text on the page. */
const titleAndLargest = (page: Page) =>
  page.evaluate(() => {
    const title = document.querySelector<HTMLElement>('.view-head h2, .updates > h2')
    const cs = title ? getComputedStyle(title) : null
    let largest = 0
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement
      if (!el || !node.textContent?.trim() || el.getClientRects().length === 0 || el.closest('.fixture-label')) continue
      largest = Math.max(largest, parseFloat(getComputedStyle(el).fontSize))
    }
    return {
      title: cs ? `${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}` : 'no title',
      largest,
    }
  })

for (const [name, url, parts] of VIEWS) {
  for (const phone of [false, true]) {
    test(`view title${phone ? ' @phone' : ''} · ${name}: 28 px on 32 at 600, and the largest word on the page`, async ({
      page,
    }) => {
      if (phone) await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(url)
      await drawn(page, parts)
      const read = await titleAndLargest(page)
      expect(read.title).toBe('28px/32px 600')
      expect(read.largest).toBe(28)
    })
  }
}
