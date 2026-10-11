// The labels off the microscope (docs/plans/task-keys-micro-type.md): section labels read at 12 px; what stays under
// 11 px is data (keys, counts, chips, avatars, times), never a word to read.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const LABELS = [
  '.field-label',
  '.hw-label',
  '.hw-date',
  '.updates-part > h3',
  '.updates-part > .recap-section h4',
  '.sheet-section h3',
  '.c3-label',
  '.palette-group',
  '.conv-day',
].join(', ')

/** The data that belongs small: keys, counts, chips, avatars and faces, times and «ago», versions, the evidence refs. */
const DATA = [
  'kbd',
  '.count',
  '.chip',
  '.chip-data',
  '.avatar',
  '.conv-face',
  '.menu-detail',
  '.task-tile-ago',
  '.resource-tile-ago',
  '.resource-session-ago',
  '.resource-tile-host',
  '.event-count',
  '.event .muted',
  '.line-session',
  '.session-when',
  '.review-evidence',
  '.review-evidence-ref',
  '.conv-msg-at',
  '.conv-row-at',
  '.conv-count',
  '.conv-open-flag',
  '.conv-output-v',
  '.hw-n',
  '.tile-name',
  '.report-tile',
  '.at',
].join(', ')

const PAGES: readonly [string, string, (typeof DRAWN)[keyof typeof DRAWN]][] = [
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates],
  ['Resources', '/resources.html', DRAWN.resources],
  ['Home', '/home.html?needs=some', DRAWN.home],
  ['Personal', '/personal.html?demo=1', DRAWN.personal],
]

const labelSizes = (page: Page) =>
  page.evaluate((sel) => {
    const shown = [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length > 0)
    return [...new Set(shown.map((el) => getComputedStyle(el).fontSize))]
  }, LABELS)

/** The classes of the visible texts under 11 px that are not data. */
const smallWords = (page: Page) =>
  page.evaluate((data) => {
    const out: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement
      if (!el || !node.textContent?.trim() || el.getClientRects().length === 0) continue
      if (parseFloat(getComputedStyle(el).fontSize) >= 11 || el.closest(data) || el.closest('.sr-only')) continue
      out.push(`${el.tagName.toLowerCase()}.${el.className}`)
    }
    return [...new Set(out)]
  }, DATA)

for (const [name, url, parts] of PAGES) {
  test(`micro-type · ${name}: every section label reads at 12 px`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    const sizes = await labelSizes(page)
    expect(sizes.length > 0 ? sizes : ['12px']).toEqual(['12px'])
  })
}

for (const [name, url, parts] of PAGES.slice(0, 2)) {
  test(`micro-type · ${name}: under 11 px only data, no word to read`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    expect(await smallWords(page)).toEqual([])
  })
}
