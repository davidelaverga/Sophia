import { expect, test } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// Every press stands on one of four heights (docs/plans/control-heights.md): on each fixture page, once drawn, every
// single-line button a person can see is 24, 28, 32 or 36 px tall: one with words on one line, or an icon press, a
// square with no words. A row, a tile or a cover (named below) is not a press on the scale; neither is a press no one
// sees. Nothing is told apart by its size: a height is what is measured. Measured on a desktop: a finger's sizes are
// another rule.

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

/** The heights a single-line press may stand on (button-class.ts's SCALE, as the page sees it). */
const SCALE = [24, 28, 32, 36]

/**
 * In the page: every visible press whose words sit on one line, with its height, class and name. A press is a button,
 * a pill link or anything in the button role; the fixture's own label is not the Studio's. Visible means drawn with a
 * size, not hidden, and inside the viewport. One line means its own words take under one and a half lines of its
 * line-height (a two-line chip is left out); with no words, a square is an icon press. A row, a tile or a cover is
 * named, never told from a press by its size; a press whose word stands on end is a rail.
 */
function readPresses() {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return (
      r.width > 0 &&
      r.height > 0 &&
      cs.visibility !== 'hidden' &&
      cs.display !== 'none' &&
      r.bottom > 0 &&
      r.top < innerHeight &&
      r.right > 0 &&
      r.left < innerWidth
    )
  }
  // The lines its words take, read from its text alone: a tip (aria-hidden, laid out above the press) is not its words,
  // and a press of one icon has one line.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const lines = (el: Element) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let top = Number.POSITIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue?.trim() || node.parentElement?.closest('[aria-hidden="true"]')) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const r of range.getClientRects()) {
        top = Math.min(top, r.top)
        bottom = Math.max(bottom, r.bottom)
      }
    }
    if (!Number.isFinite(top)) return null
    const lh = parseFloat(getComputedStyle(el).lineHeight)
    return Number.isFinite(lh) && lh > 0 ? (bottom - top) / lh : 1
  }
  // A row, a tile or a cover, named: home's rows, a conversation's row and what it made, a meeting's row, a report's
  // cover, a resource's tile. Each is as wide as the list or card it is in, but a press that fills a narrow box (the
  // sort's button in its field) is still a press: nothing here is told apart by its size.
  const ROWS = '.hw-row, .conv-row, .conv-output, .meeting-row, .report-cover-open, .resource-tile'
  // An edge (the personal space's way across) stands on end, its word written downwards: a rail, not a press.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const standsOnEnd = (el: Element) =>
    [el, ...el.querySelectorAll('*')].some((e) => getComputedStyle(e).writingMode.startsWith('vertical'))
  // A press with no words of its own is an icon press when it is a square (a microphone, Close).
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const square = (el: Element) => {
    const r = el.getBoundingClientRect()
    return Math.abs(r.width - r.height) <= 1
  }
  return [...document.querySelectorAll('button, a.pill, [role="button"]')]
    .filter((el) => {
      if (el.closest('.fixture-label') || !seen(el) || el.matches(ROWS) || standsOnEnd(el)) return false
      const n = lines(el)
      return n === null ? square(el) : n < 1.5
    })
    .map((el) => ({
      height: Math.round(el.getBoundingClientRect().height),
      className: el.className,
      name: (el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 32),
    }))
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
  test(`heights · on ${name}, every single-line press stands on 24, 28, 32 or 36 px`, async ({ page }) => {
    await page.goto(url)
    // The page has drawn: each of its reads (drawn.ts), never «the network is idle».
    await drawn(page, parts)
    const presses = await page.evaluate(readPresses)
    // A page with no press measured would pass for nothing: each page has at least one.
    expect(presses.length).toBeGreaterThan(0)
    const off = presses
      .filter((p) => !SCALE.includes(p.height))
      .map((p) => `${String(p.height)}px .${p.className} «${p.name}»`)
    expect(off).toEqual([])
  })
}
