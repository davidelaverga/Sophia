import { expect, test, type Page } from '@playwright/test'
import { renderReportPage } from '@sophia/report/page'
import { REPORT_PAGES } from '../fixtures/report-pages.ts'
import {
  answerFirst,
  brokenWords,
  citationTargets,
  keyboardFrames,
  linkPresses,
  medianLine,
  overflow,
  pdfText,
  printedTables,
  printInk,
  rail,
  typeScale,
  worstContrast,
} from './report-probes.ts'
import { typeSizes } from './type-sizes.ts'

// The downloaded report page's layout criteria (html-report-v2, SMC-M03): the bytes Studio saves
// (renderReportPage over labelled fixture reports, fixtures/report-pages.ts), opened as they are and measured in
// Chromium, on a phone (390, `@phone`) and a desktop (1280), light and dark, and printed as A4 by the page's own @page
// rules. The page loads nothing, so no server answers it. Fonts are this machine's own: each threshold must hold with
// whatever serif and sans the page's stacks fall back to.
//
// Two groups (M75). "Any report page" holds what a reader needs from every report page, a designed one included: they
// take their marks from report-probes.ts and say nothing of layout or type. "html-report-v2 seed profile" holds this
// fixed template to its own choices (its measure, five sizes, answer-first order, contents rail, print size); a designed
// page (SDD-01) is not asked to copy them. Neither group is weaker than before: every check is the one it was.

type Name = keyof typeof REPORT_PAGES
const NAMES = Object.keys(REPORT_PAGES).filter((name): name is Name => name in REPORT_PAGES)
/** The fixture whose prose the measure and the first screen are judged on (the stress title is 220 characters). */
const PROSE: Name = 'kitchen'
const SCHEMES = ['light', 'dark'] as const

/** Opens fixture `name` as the page Studio saves, in `scheme`, on the project's own screen of `width`. */
async function open(page: Page, name: Name, width: number, scheme: 'light' | 'dark' = 'light') {
  expect(page.viewportSize()?.width, 'the project’s screen').toBe(width)
  await page.emulateMedia({ colorScheme: scheme })
  await page.setContent(renderReportPage(REPORT_PAGES[name]))
}

/** Lays fixture `name` out as print does for a reader who prefers `scheme`, at A4's printable width. */
async function printView(page: Page, name: Name, scheme: 'light' | 'dark') {
  // A4 less the page's 20 mm side margins is 170 mm: 642.5 CSS pixels.
  await page.setViewportSize({ width: 643, height: 900 })
  await page.emulateMedia({ media: 'print', colorScheme: scheme })
  await page.setContent(renderReportPage(REPORT_PAGES[name]))
}

const SCREENS = [
  { width: 1280, where: 'on a desktop', tag: '' },
  { width: 390, where: 'on a phone', tag: ' @phone' },
] as const

const squash = (s: string) => s.replace(/[\s­-]+/g, '')

// ——— Any report page ———

async function nothingPast(page: Page, width: number) {
  for (const name of NAMES) {
    for (const scheme of SCHEMES) {
      await open(page, name, width, scheme)
      const expected = { page: 0, outside: [], code: 0, tables: 0, frames: 0 }
      expect(await overflow(page), `${name}, ${scheme}`).toEqual(expected)
    }
  }
}

async function wholeWordsInCells(page: Page, width: number) {
  for (const name of NAMES) {
    await open(page, name, width)
    expect(await brokenWords(page), name).toEqual([])
  }
}

async function legible(page: Page, width: number) {
  for (const name of NAMES) {
    for (const scheme of SCHEMES) {
      await open(page, name, width, scheme)
      const worst = await worstContrast(page)
      expect(worst.ratio, `${name}, ${scheme}: ${worst.what}`).toBeGreaterThanOrEqual(worst.need)
    }
  }
}

async function ownTargets(page: Page, width: number) {
  for (const name of NAMES) {
    await open(page, name, width)
    const targets = await citationTargets(page)
    expect(targets.count, `${name}: citations`).toBeGreaterThan(0)
    expect(targets.missed, `${name}: presses on a citation’s square that miss it`).toEqual([])
    expect(targets.overlaps, `${name}: citations whose squares overlap`).toEqual([])
    const taken = await linkPresses(page)
    expect(taken, `${name}: presses on a link beside a citation that something else takes`).toEqual([])
    expect(targets.lines, `${name}: blocks whose lines holding a citation stand 24px apart or less`).toEqual([])
  }
}

async function keyboardReachable(page: Page, width: number) {
  for (const name of NAMES) {
    await open(page, name, width)
    expect(await keyboardFrames(page), name).toEqual([])
  }
}

async function wholeInPrint(page: Page) {
  for (const name of NAMES) {
    await printView(page, name, 'dark')
    const tables = await printedTables(page)
    expect(tables.clipped, `${name}: tables past the printable width`).toBe(0)
    const text = squash((await pdfText(await page.pdf({ preferCSSPageSize: true }), null)).text)
    const missing = tables.cells.filter((cell) => !text.includes(squash(cell).slice(0, 24)))
    expect(missing, `${name}: table cells the PDF does not hold`).toEqual([])
  }
}

test.describe('any report page', () => {
  for (const { width, where, tag } of SCREENS) {
    test(`C4 · nothing runs past the screen or the column’s box, ${where}${tag}`, ({ page }) =>
      nothingPast(page, width))
    test(`C5 · no word of 14 characters or fewer breaks inside a table cell, ${where}${tag}`, ({ page }) =>
      wholeWordsInCells(page, width))
    test(`C6 · every text reads at 4.5:1 (3:1 when large), light and dark, ${where}${tag}`, ({ page }) =>
      legible(page, width))
    test(`C15 · every citation takes a press on a 24px square of its own, and no link’s, ${where}${tag}`, ({ page }) =>
      ownTargets(page, width))
    test(`C16 · every frame that scrolls sideways takes the keyboard’s focus and has a name, ${where}${tag}`, ({
      page,
    }) => keyboardReachable(page, width))
  }
  test('C9 · print keeps every table whole: none past the printable width, every cell in the PDF', ({ page }) =>
    wholeInPrint(page))
})

// ——— html-report-v2 seed profile ———

async function measure(page: Page) {
  await open(page, PROSE, 1280)
  const screen = await medianLine(page)
  await printView(page, PROSE, 'light')
  const paper = await medianLine(page)
  for (const [where, median] of [
    ['on screen', screen],
    ['in print', paper],
  ] as const) {
    expect(median, `median characters a line ${where}`).toBeGreaterThanOrEqual(60)
    expect(median, `median characters a line ${where}`).toBeLessThanOrEqual(80)
  }
}

async function bodyType(page: Page, width: number) {
  for (const name of NAMES) {
    await open(page, name, width)
    const { body, leading } = await typeScale(page)
    expect(body ?? 0, `${name}: a body paragraph’s size`).toBeGreaterThanOrEqual(width >= 1280 ? 18 : 17)
    expect(leading ?? 0, `${name}: its line height over its size`).toBeGreaterThanOrEqual(1.5)
    expect(leading ?? 0, `${name}: its line height over its size`).toBeLessThanOrEqual(1.7)
  }
}

async function fiveSizes(page: Page, width: number) {
  for (const name of NAMES) {
    await open(page, name, width)
    const { scale } = await typeScale(page)
    for (const [i, size] of scale.slice(1).entries()) {
      expect((scale[i] ?? 0) / size, `${name}: ${scale.join(' / ')}`).toBeGreaterThanOrEqual(1.2)
    }
    const sizes = await typeSizes(page, 'body')
    expect(sizes.length, `${name}: ${sizes.join(' ')}`).toBeLessThanOrEqual(5)
    expect(Math.min(...sizes.map((s) => parseFloat(s))), `${name}: the smallest`).toBeGreaterThanOrEqual(14)
  }
}

async function answerOnTop(page: Page) {
  for (const name of NAMES) {
    await open(page, name, 390)
    const answer = await answerFirst(page)
    expect({ contents: answer.contents, body: answer.body }, name).toEqual({ contents: true, body: true })
    if (name === PROSE) expect(answer.top ?? Infinity, `${name}: where the answer starts`).toBeLessThan(844)
  }
}

async function contentsRail(page: Page) {
  for (const name of NAMES) {
    await open(page, name, 1280)
    const contents = await rail(page)
    expect(contents?.sticky, `${name}: the contents stays in view`).toBe(true)
    expect(contents?.gaps.length, `${name}: the answer and a body paragraph`).toBe(2)
    expect(Math.min(...(contents?.gaps ?? [])), `${name}: its edge left of the text`).toBeGreaterThanOrEqual(0)
  }
}

async function printBody(page: Page) {
  for (const name of NAMES) {
    await printView(page, name, 'light')
    const light = await printInk(page)
    await printView(page, name, 'dark')
    const dark = await printInk(page)
    expect(dark.opening, `${name}: a body paragraph to size`).not.toBeNull()
    const pdf = await pdfText(await page.pdf({ preferCSSPageSize: true }), dark.opening)
    expect(Math.abs((pdf.size ?? 0) - 10.5), `${name}: body text at ${String(pdf.size)}pt`).toBeLessThan(0.6)
    expect(dark.ink, `${name}: the ink of a dark preference is print’s own`).toBe(light.ink)
  }
}

test.describe('html-report-v2 seed profile', () => {
  test('C1 · the reading column holds 60 to 80 characters a line on a desktop and in print', ({ page }) =>
    measure(page))
  test('C1 · the reading column holds at least 35 characters a line on a phone @phone', async ({ page }) => {
    await open(page, PROSE, 390)
    expect(await medianLine(page), 'median characters a line').toBeGreaterThanOrEqual(35)
  })
  for (const { width, where, tag } of SCREENS) {
    test(`C2 · body text at 17px or more (18 on a desktop), 1.5 to 1.7 lines apart, ${where}${tag}`, ({ page }) =>
      bodyType(page, width))
    test(`C3 · headings 1.2 times a step apart, at most five sizes, none under 14px, ${where}${tag}`, ({ page }) =>
      fiveSizes(page, width))
  }
  test('C7 · the answer comes before the contents and the body, inside the first phone screen @phone', ({ page }) =>
    answerOnTop(page))
  test('C14 · on a desktop the contents stays beside the text as it scrolls, and never covers it', ({ page }) =>
    contentsRail(page))
  test('C9 · print sets the body at 10.5pt, unscaled, and stays light for a reader who prefers dark', ({ page }) =>
    printBody(page))
})
