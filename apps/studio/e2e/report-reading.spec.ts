import { expect, test, type Locator, type Page } from '@playwright/test'
import { READING, READING_TITLE, readingVersionId } from '../fixtures/reading-data.ts'
import { KEPT_WITH_WORD } from '../src/features/artifacts/cite-view.ts'

// How the viewer's Document tab reads (html-report-v2, SPEC §4b), on the room's fixture page with the long reading
// report (fixtures/reading-data.ts): one measure in both pane sizes, the serif reading voice, booktabs tables that never
// break a word, nested items that take no number, the limitations under an amber rule, citations bound to their word,
// grouped with commas, and marked and named when their source was read only in part. Each number is measured in the
// real page, never judged by eye; what only pixels show (a rule under a pinned label, a shade) is read from a
// screenshot.

const S1 = '00000000-0000-4000-8000-0000000000f3'
const S3 = '00000000-0000-4000-8000-0000000000f5'
const pane = (page: Page) => page.getByRole('complementary', { name: READING_TITLE })
/** A sentence of the English version, from its summary: its text is on screen once it is shown. */
const SUMMARY = 'Recovery windows differ more than prices do, from 3 days to 35.'
/** The reading text's blocks: its paragraphs and list items. */
const READ = '.md > p, .md > :is(ul, ol) > li'

const fixture = (page: Page) =>
  page.evaluate(() => {
    const view = window.fixture
    if (!view) throw new Error('the fixture page did not start')
    return { unexpected: [...view.unexpected] }
  })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect((await fixture(page)).unexpected, 'requests the fixture did not expect').toEqual([])
})

/** Opens the reading report and waits for its text and its sources (which mark the weak citations). */
async function openReading(page: Page) {
  await page.goto(`/room.html?report=${READING}`)
  await expect(page.locator('.md')).toContainText(SUMMARY)
  await expect(page.getByRole('tab', { name: 'Sources 6' })).toBeVisible()
}

/** Enlarges the pane and waits until it has grown: it grows by a scale, which any box measured meanwhile has too. */
async function enlarge(page: Page) {
  await pane(page).getByRole('button', { name: 'Enlarge' }).click()
  const full = page.locator('.report-pane')
  await expect(full).toHaveAttribute('data-size', 'full')
  await full.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
}

/** Each glyph's box (its top and width) in each block `selector` names, citation numbers left out. */
const glyphs = (page: Page, selector: string) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)].map((block) => {
        const texts: Text[] = []
        const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (n instanceof Text && !n.parentElement?.closest('.cite')) texts.push(n)
        }
        return texts.flatMap((t) =>
          Array.from({ length: t.length }, (_, i) => {
            const r = document.createRange()
            r.setStart(t, i)
            r.setEnd(t, i + 1)
            const box = r.getClientRects()[0]
            return box ? [{ top: box.top, width: box.width }] : []
          }).flat(),
        )
      }),
    selector,
  )

/**
 * Characters per rendered line of the reading text, as the page's own check counts them: each character's line from its
 * box, each block's last line dropped, lines of 10 or fewer kept out.
 */
async function lineLengths(page: Page) {
  const lines: number[] = []
  for (const block of await glyphs(page, READ)) {
    const rows = new Map<number, number>()
    for (const { top } of block) rows.set(Math.round(top / 3), (rows.get(Math.round(top / 3)) ?? 0) + 1)
    const counts = [...rows.entries()].toSorted((a, b) => a[0] - b[0]).map((e) => e[1])
    counts.pop()
    lines.push(...counts.filter((c) => c > 10))
  }
  lines.sort((a, b) => a - b)
  return { median: lines[Math.floor(lines.length / 2)] ?? 0, lines: lines.length }
}

/** The left edge and width of what `selector` names in the pane, rounded to half a pixel. */
const edge = (page: Page, selector: string) =>
  page.locator(`.report-pane ${selector}`).evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: Math.round(r.left * 2) / 2, width: Math.round(r.width * 2) / 2 }
  })

/**
 * What the screenshot shows at each of `points` (viewport pixels): its red channel, the brightest within a pixel above
 * or below, read back through a canvas.
 */
async function pixels(page: Page, points: readonly { x: number; y: number }[]) {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(
    async ({ data, at }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${data}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const g = canvas.getContext('2d')
      if (!g) throw new Error('no canvas')
      g.drawImage(img, 0, 0)
      const k = img.width / window.innerWidth
      const red = (x: number, y: number) => g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[0] ?? 0
      return at.map(({ x, y }) => Math.max(red(x, y - 1), red(x, y), red(x, y + 1)))
    },
    { data: png, at: points },
  )
}

test('reading · one measure in both pane sizes: 60 to 80 characters a line, the column at most 34rem', async ({
  page,
}) => {
  // The side pane as wide as it goes (720 px at 1280), wider than the column: the measure, not the pane, sets it.
  await page.addInitScript(() => window.localStorage.setItem('sophia.reportPane.width', '720'))
  await openReading(page)
  const side = await lineLengths(page)
  expect(side.lines, 'lines measured').toBeGreaterThan(20)
  expect(side.median, 'beside the room').toBeGreaterThanOrEqual(60)
  expect(side.median, 'beside the room').toBeLessThanOrEqual(80)
  expect((await edge(page, '.md')).width).toBeLessThanOrEqual(544)

  await enlarge(page)
  const full = await lineLengths(page)
  expect(full.median, 'the full page').toBeGreaterThanOrEqual(60)
  expect(full.median, 'the full page').toBeLessThanOrEqual(80)
  // One column: the version's limitations stand on the text's own edge, as wide as it.
  const text = await edge(page, '.md')
  expect(text.width).toBe(544)
  expect(await edge(page, '.report-limits')).toEqual(text)
})

test('reading · the serif reading voice at 17/1.6, with the apparatus in the Studio’s sans', async ({ page }) => {
  await openReading(page)
  const parts: [string, string, string | null][] = [
    ['text', '.md > p', null],
    ['title', '.md > h2', null],
    ['section', '.md > h3', null],
    ['table', '.md-table td', null],
    ['cite', '.md .cite button', null],
    ['marker', '.md > ul > li', '::marker'],
  ]
  const voice = await page.evaluate(
    (all) =>
      Object.fromEntries(
        all.map(([name, selector, pseudo]) => {
          const el = document.querySelector(`.report-pane ${selector}`)
          if (!el) throw new Error(`no ${selector}`)
          const s = getComputedStyle(el, pseudo)
          const family = s.fontFamily.split(',')[0]?.trim()
          return [
            name,
            { family, size: s.fontSize, leading: s.lineHeight, wrap: s.getPropertyValue('text-wrap-style') },
          ]
        }),
      ),
    parts,
  )
  // Paragraphs avoid a lone word on their last line, as the page's do (theme.css sets it for every paragraph).
  expect(voice.text).toEqual({ family: 'Charter', size: '17px', leading: '27.2px', wrap: 'pretty' })
  expect(voice.title?.family).toBe('Charter')
  expect(voice.section?.family).toBe('Charter')
  for (const part of [voice.table, voice.cite, voice.marker]) expect(part?.family).toBe('"Geist Variable"')
  // A citation's number is 0.8 of the text, as on the page, not shrunk again by the sup's own smaller size (11.3 px).
  expect(voice.cite?.size).toBe('13.6px')
})

/** Words of up to 14 characters in table cells whose letters land on two lines (the page's own C5). */
const brokenInCells = (page: Page) =>
  page.evaluate(() => {
    const texts: Text[] = []
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n instanceof Text && n.parentElement?.closest('.md-table :is(th, td)')) texts.push(n)
    }
    return texts.flatMap((t) =>
      [...t.data.matchAll(/[\p{L}\p{N}]+/gu)]
        .filter((m) => {
          const r = document.createRange()
          r.setStart(t, m.index)
          r.setEnd(t, m.index + m[0].length)
          const tops = new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top)))
          return m[0].length <= 14 && tops.size > 1
        })
        .map((m) => m[0]),
    )
  })

test('reading · no word in a table cell is broken, beside the room and on the full page', async ({ page }) => {
  await openReading(page)
  expect(await brokenInCells(page), 'beside the room').toEqual([])
  await enlarge(page)
  expect(await brokenInCells(page), 'the full page').toEqual([])
})

test('reading @phone · tables keep their words whole, and a wide one scrolls with its row label pinned', async ({
  page,
}) => {
  await openReading(page)
  expect(await brokenInCells(page)).toEqual([])
  // The six-column comparison scrolls in its frame; its first column stays at the frame's edge as it does.
  const wide = page.locator('.md-table').filter({ hasText: 'Restore granularity' })
  const pinned = await wide.evaluate((frame) => {
    const label = frame.querySelector('tbody td')
    if (!label) throw new Error('no row label')
    frame.scrollLeft = 200
    return {
      scrolled: frame.scrollLeft,
      gap: Math.round(label.getBoundingClientRect().left - frame.getBoundingClientRect().left),
    }
  })
  expect(pinned.scrolled, 'the table is wider than its frame').toBeGreaterThan(0)
  expect(pinned.gap, 'the row label stays at the frame’s edge').toBe(0)
  // Five columns, too, keep readable columns on a phone: the table scrolls by a good part of itself.
  await page.goto(`/room.html?report=${READING}&version=${readingVersionId(1)}`)
  const five = page.locator('.report-pane .md-table')
  await expect(five).toContainText('Costo mensile')
  expect(await five.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(60)
})

test('reading · a table’s rules run under its pinned row label, also once the pane is enlarged', async ({ page }) => {
  test.slow() // eight screenshots, read back through a canvas
  await openReading(page)
  await enlarge(page)
  // The six-column comparison, which scrolls on the full page: each of its rules (the table's top and bottom, the
  // head's, each row's), read under the pinned label and under the third column, with the table landing on each eighth
  // of a pixel (a rule can go missing at one and not at the next).
  const wide = page.locator('.md-table').filter({ hasText: 'Restore granularity' })
  await wide.scrollIntoViewIfNeeded()
  expect(await wide.evaluate((el) => el.scrollWidth - el.clientWidth), 'the table scrolls').toBeGreaterThan(0)
  const missing: string[] = []
  for (let eighth = 0; eighth < 8; eighth++) {
    const rules = await wide.evaluate((frame, nudge) => {
      const md = frame.closest<HTMLElement>('.md')
      const table = frame.querySelector('table')
      if (!md || !table) throw new Error('no table')
      md.style.paddingTop = `${String(nudge)}px`
      const rows = [...table.rows]
      const middle = (k: number) => {
        const cell = rows[1]?.cells[k]?.getBoundingClientRect()
        return cell ? cell.left + cell.width / 2 : 0
      }
      const box = table.getBoundingClientRect()
      const ys = [box.top, ...rows.slice(1).map((row) => row.getBoundingClientRect().top), box.bottom - 1]
      return ys.flatMap((y) => [
        { x: middle(0), y },
        { x: middle(2), y },
      ])
    }, eighth / 8)
    const shown = await pixels(page, rules)
    for (let k = 0; k < shown.length; k += 2) {
      const [label = 0, other = 0] = shown.slice(k, k + 2)
      if (other <= 30 || Math.abs(label - other) > 12) missing.push(`${String(eighth)}/8 px, rule ${String(k / 2)}`)
    }
  }
  expect(missing).toEqual([])
  // A table with a head and no rows has no cells under its head to own the rule there: its head does.
  const headOnly = await page
    .locator('.md-table')
    .filter({ hasText: 'Connection pooling' })
    .evaluate((frame) => {
      frame.querySelector('tbody')?.replaceChildren()
      const head = frame.querySelector('th')
      return head ? getComputedStyle(head).borderBottomWidth : null
    })
  expect(headOnly).toBe('1px')
})

test('reading @phone · a table with more to see is shaded at that edge, and not once it is scrolled to its end', async ({
  page,
}) => {
  test.slow() // three screenshots, read back through a canvas
  await openReading(page)
  /** How much brighter the frame's last pixels are than its ground, in the blank above a row's text. */
  const shade = async (frame: Locator) => {
    const at = await frame.evaluate((el) => {
      el.scrollIntoView({ block: 'center' })
      const box = el.getBoundingClientRect()
      const y = (el.querySelector('tbody tr')?.getBoundingClientRect().top ?? 0) + 4
      return [
        { x: box.right - 2, y },
        { x: box.right - 40, y },
      ]
    })
    const [rim = 0, ground = 0] = await pixels(page, at)
    return rim - ground
  }
  const wide = page.locator('.md-table').filter({ hasText: 'Restore granularity' })
  expect(await shade(wide), 'more to the right').toBeGreaterThan(10)
  await wide.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  expect(await shade(wide), 'scrolled to its end').toBeLessThanOrEqual(3)
  const fits = page.locator('.md-table').filter({ hasText: 'Connection pooling' })
  expect(await fits.evaluate((el) => el.scrollWidth - el.clientWidth), 'the four columns fit').toBe(0)
  expect(await shade(fits), 'a table that fits').toBeLessThanOrEqual(3)
})

/**
 * Over a sweep of the column's width, where a line starts with a citation or with the comma between two: a part of a
 * group (a number, a comma) whose middle is below the bottom of what comes before it (the end of the text before the
 * group, or the part before it). Only past a group's first KEPT_WITH_WORD numbers may a number start a line, and only
 * after a comma. A sweep, because where a line ends depends on the width and on the fonts.
 */
const brokenBindings = (page: Page, widths: readonly number[]) =>
  page.evaluate(
    ({ sweep, kept }) => {
      const md = document.querySelector<HTMLElement>('.report-pane .md')
      if (!md) throw new Error('no text')
      const starts: string[] = []
      for (const width of sweep) {
        md.style.maxWidth = `${String(width)}px`
        for (const sup of md.querySelectorAll('sup.cite')) {
          const before = document.createRange()
          before.setStart(sup.closest('p, li, td, th') ?? md, 0)
          before.setEndBefore(sup)
          const text = [...before.getClientRects()].filter((q) => q.width > 0).at(-1)
          const parts = [...sup.querySelectorAll('button, .sep')]
          const boxes = [text, ...parts.map((el) => el.getBoundingClientRect())]
          const broken = parts.some((part, k) => {
            const [prior, box] = [boxes[k], boxes[k + 1]]
            const opensLine = !!box && !!prior && box.top + box.height / 2 > prior.bottom
            const number = parts.slice(0, k + 1).filter((el) => el.tagName === 'BUTTON').length
            const mayOpen = part.tagName === 'BUTTON' && number > kept && parts[k - 1]?.className === 'sep'
            return opensLine && !mayOpen
          })
          if (broken) starts.push(`${String(width)}: ${sup.textContent}`)
        }
      }
      md.style.maxWidth = ''
      return starts
    },
    { sweep: widths, kept: KEPT_WITH_WORD },
  )

test('reading @phone · no line starts with a citation or its comma, at any width of the column', async ({ page }) => {
  await openReading(page)
  const natural = await edge(page, '.md')
  const widths = Array.from({ length: 52 }, (_, i) => natural.width - 2 * i)
  expect(widths.at(-1), 'the sweep reaches a narrow column').toBeLessThan(250)
  expect(await brokenBindings(page, widths)).toEqual([])
})

/**
 * The address's group, swept from the column's width down to the narrowest that holds what may never part (M75-RF-0006):
 * the bound word's last character, which BoundWord keeps out of its wrapping span, and the group's first numbers. That
 * unit is measured where it lies, on one line; the word before it may wrap, so the bound piece's own start is no measure
 * (it can sit on the line above). At each width: no number past the column, the last character and the first number on
 * one line, and whether the word wrapped above its numbers, which the sweep must meet. The unit is measured again where
 * the word already wraps, the layout in which the old measure went negative (CX-0008: 48 of 103 widths in CI's), and
 * swept from there too unless the column as it is already wraps it.
 */
const groupSweep = (p: HTMLElement, kept: number) => {
  const md = p.closest<HTMLElement>('.md')
  const bound = p.querySelector('.cite-bound')
  const numbers = [...p.querySelectorAll('sup.cite button')]
  const sup = bound?.querySelector(':scope > sup.cite')
  const third = numbers[kept - 1]
  if (!md || !bound || !sup || !third) throw new Error('no group')
  /** The box of the bound word's last text node: BoundWord sets the last character a reader sees as a node of its own. */
  const lastChar = () => {
    const walk = document.createTreeWalker(bound, NodeFilter.SHOW_TEXT)
    let text: Text | null = null
    for (let n = walk.nextNode(); n && !sup.contains(n); n = walk.nextNode()) if (n instanceof Text && n.data) text = n
    if (!text) throw new Error('no word')
    const range = document.createRange()
    range.selectNodeContents(text)
    return range.getBoundingClientRect()
  }
  /** The unit's width, and whether its two ends share a line (their middles less than half a line apart). */
  const unit = () => {
    const [a, b] = [lastChar(), third.getBoundingClientRect()]
    return { width: Math.ceil(b.right - a.left), together: Math.abs(a.top + a.bottom - b.top - b.bottom) / 2 < 14 }
  }
  /** One width: how far a number runs past the column, whether the unit parts, whether the word wrapped above it. */
  const at = (width: number) => {
    md.style.maxWidth = `${String(width)}px`
    const over = Math.max(...numbers.map((b) => b.getBoundingClientRect().right)) - md.getBoundingClientRect().right
    const wrapped = (bound.getClientRects()[0]?.top ?? 0) < third.getBoundingClientRect().top - 14
    return { over, parted: !unit().together, wrapped }
  }
  /** Every second width from `from` down to the unit: what ran past, what parted, how often the word wrapped above. */
  const sweep = (from: number, unitWidth: number) => {
    const result = { from, narrowest: 0, past: [] as string[], parted: [] as string[], wrapped: 0 }
    for (let width = from; width >= unitWidth + 2; width -= 2) {
      const seen = at(width)
      if (seen.over > 0.5) result.past.push(`${String(width)}: ${String(Math.round(seen.over))} px`)
      if (seen.parted) result.parted.push(String(width))
      if (seen.wrapped) result.wrapped += 1
      result.narrowest = width
    }
    return result
  }
  try {
    const natural = Math.floor(md.getBoundingClientRect().width)
    const first = unit()
    if (!first.together || first.width <= 0) throw new Error(`no unit on one line: ${JSON.stringify(first)}`)
    // The countercase (CX-0008): the widest column where the word wraps above its numbers, the layout in which the old
    // measure went negative. The unit measured there must be the one measured as the column is.
    let wraps = natural
    while (wraps > first.width + 2 && !at(wraps).wrapped) wraps -= 2
    const there = unit()
    md.style.maxWidth = ''
    const startedWrapped = wraps === natural
    return {
      unit: first.width,
      unitWhereWrapped: there.width,
      wrapsFrom: wraps,
      sweeps: [sweep(natural, first.width), ...(startedWrapped ? [] : [sweep(wraps, there.width)])],
    }
  } finally {
    md.style.maxWidth = ''
  }
}

test('reading @phone · a long group of citations wraps after a comma rather than run past the column', async ({
  page,
}) => {
  await openReading(page)
  const address = page.locator('.md p').filter({ hasText: 'pricing.harbor.example' })
  expect(await address.locator('sup.cite button').count()).toBe(6)
  const { unit, unitWhereWrapped, wrapsFrom, sweeps } = await address.evaluate(groupSweep, KEPT_WITH_WORD)
  // What may never part is one size wherever the column puts the word, and much narrower than the column: a sweep that
  // stopped near the column's width (a unit measured from too far left) would fail here.
  expect(Math.abs(unitWhereWrapped - unit), 'the unit measured where the word wraps above its numbers').toBeLessThan(2)
  expect(wrapsFrom, 'a column where the word wraps above its numbers').toBeGreaterThan(unit + 2)
  for (const [k, sweep] of sweeps.entries()) {
    const from = k === 0 ? 'from the column as it is' : 'from the widest column where the word wraps'
    expect(sweep.narrowest, `${from}: the sweep reaches the unit`).toBeGreaterThan(0)
    expect(sweep.narrowest, `${from}: the sweep reaches the unit`).toBeLessThan(unit + 4)
    expect(sweep.narrowest * 2, `${from}: the sweep goes below half the column`).toBeLessThan(sweep.from)
    expect(sweep.wrapped, `${from}: layouts where the word wraps above its numbers`).toBeGreaterThan(0)
    expect(sweep.past, `${from}: widths where a number runs past the column`).toEqual([])
    expect(sweep.parted, `${from}: widths where the last character and the first number part`).toEqual([])
  }
})

test('reading @phone · the Document tab never scrolls sideways: a long address wraps before its citation', async ({
  page,
}) => {
  await openReading(page)
  const body = page.locator('.report-pane-body')
  const sideways = await body.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(sideways).toBe(0)
  // The address is on several lines, its citation on the last.
  const address = page.locator('.md p').filter({ hasText: 'pricing.harbor.example' })
  const lines = await address.evaluate((p) => Math.round(p.getBoundingClientRect().height / 27.2))
  expect(lines).toBeGreaterThan(2)
  // Chinese has no spaces, and a line may break between any two of its letters: a citation keeps only the last one.
  const quote = page.locator('.md blockquote').filter({ hasText: '数据驻留' })
  await expect(quote.locator('.cite-bound')).toHaveText('理5')
})

test('reading · a line with a citation keeps the paragraph’s leading', async ({ page }) => {
  await openReading(page)
  // The summary's first paragraph (the first under a section's head): citations on two of its lines.
  const summary = '.md > h3 + p'
  const leading = await page
    .locator(summary)
    .first()
    .evaluate((p) => parseFloat(getComputedStyle(p).lineHeight))
  const [block = []] = await glyphs(page, summary)
  // One line per cluster of tops (bold and regular glyphs of a line sit within a pixel or two of each other).
  const lines: number[] = []
  for (const { top } of block.filter((g) => g.width > 0).toSorted((a, b) => a.top - b.top)) {
    if (top - (lines.at(-1) ?? -Infinity) > 4) lines.push(top)
  }
  expect(lines.length, 'lines').toBeGreaterThan(3)
  for (const [k, top] of lines.slice(1).entries()) {
    const step = Math.round((top - (lines[k] ?? 0)) * 10) / 10
    expect(Math.abs(step - leading), `a step of ${String(step)} px`).toBeLessThanOrEqual(1)
  }
})

test('reading @phone · a citation’s number has a finger-sized target, which moves no line; none in a table', async ({
  page,
}) => {
  await openReading(page)
  const reach = await page
    .locator('.report-pane .md > p .cite button')
    .first()
    .evaluate((button) => {
      button.scrollIntoView({ block: 'center' })
      const box = button.getBoundingClientRect()
      const hits = (y: number) => document.elementFromPoint(box.left + box.width / 2, y) === button
      return { above: hits(box.top - 5), below: hits(box.bottom + 5) }
    })
  expect(reach).toEqual({ above: true, below: true })
  // In a table, a target past the frame's edge would make the frame scroll.
  const inTable = page.locator('.md-table .cite button').first()
  expect(await inTable.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none')
})

/**
 * Each citation's touch target outside tables as it is laid out (its number's box grown by its ::after's insets): the
 * pairs that meet, the presses inside a target that reach something else (centre, corners and edge midpoints, half a
 * pixel in), the presses on a link in a block that holds a citation that something else takes (2 px in), and the
 * targets as tall as the step between their block's lines.
 */
const touchTargets = (page: Page) =>
  page.evaluate(
    ({ near, onLink }) => {
      const buttons = [...document.querySelectorAll<HTMLElement>('.md .cite button')].filter(
        (b) => !b.closest('.md-table'),
      )
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
      const target = (b: HTMLElement) => {
        const r = b.getBoundingClientRect()
        const s = getComputedStyle(b, '::after')
        const grow =
          s.content === 'none'
            ? [0, 0, 0, 0]
            : [s.left, s.right, s.top, s.bottom].map((v) => (v === 'auto' ? 0 : parseFloat(v)))
        return {
          l: r.left + (grow[0] ?? 0),
          r: r.right - (grow[1] ?? 0),
          t: r.top + (grow[2] ?? 0),
          b: r.bottom - (grow[3] ?? 0),
        }
      }
      const laid = buttons.map(target)
      const meet = laid.flatMap((a, i) =>
        laid.slice(i + 1).flatMap((b, k) => {
          const w = Math.min(a.r, b.r) - Math.max(a.l, b.l)
          const h = Math.min(a.b, b.b) - Math.max(a.t, b.t)
          return w > 0.01 && h > 0.01 ? [`${buttons[i]?.textContent} and ${buttons[i + 1 + k]?.textContent}`] : []
        }),
      )
      /** Nine presses in a box: half a pixel in for a citation's target, `onLink` in for a link's line box. */
      const nine = (r: { l: number; r: number; t: number; b: number }, link: boolean) => {
        const inset = link ? onLink : near
        return [r.l + inset, (r.l + r.r) / 2, r.r - inset].flatMap((x) =>
          [r.t + inset, (r.t + r.b) / 2, r.b - inset].map((y) => ({ x, y })),
        )
      }
      const missed = buttons.flatMap((b) => {
        b.scrollIntoView({ block: 'center' })
        const taken = nine(target(b), false).find(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest('button') !== b,
        )
        return taken ? [`${b.getAttribute('aria-label')} at ${taken.x.toFixed(1)},${taken.y.toFixed(1)}`] : []
      })
      const blocks = new Set(buttons.map((b) => b.closest('p, li, blockquote, h2, h3, h4, h5, h6')))
      const links = [...blocks].flatMap((block) => [...(block?.querySelectorAll('a[href]') ?? [])])
      const linkTaken = links.flatMap((a) => {
        a.scrollIntoView({ block: 'center' })
        return [...a.getClientRects()].flatMap((r) =>
          nine({ l: r.left, r: r.right, t: r.top, b: r.bottom }, true)
            .filter(({ x, y }) => document.elementFromPoint(x, y)?.closest('a') !== a)
            .map(({ x, y }) => `${a.textContent} at ${(x - r.left).toFixed(0)},${(y - r.top).toFixed(0)}`),
        )
      })
      // Taller than the step between lines, a target could meet one on the line above or below however the text wraps.
      const tall = buttons.flatMap((b) => {
        const box = target(b)
        const step = parseFloat(getComputedStyle(b.closest('p, li, blockquote, h2, h3, h4, h5, h6') ?? b).lineHeight)
        return box.b - box.t < step ? [] : [`${b.getAttribute('aria-label')}: ${(box.b - box.t).toFixed(1)} of ${step}`]
      })
      return { count: buttons.length, meet, missed, linkTaken, tall: [...new Set(tall)] }
    },
    { near: 0.5, onLink: 2 },
  )

/**
 * Where each group's targets must reach or stop, read from the page itself: the first number stops at its numeral when
 * no word or a link is bound to it, and reaches 4 px into a word of three visible characters or more; the last stops
 * when a link follows with at most a space between, and reaches across three characters or more of text. Between those
 * (a group a letter from the next) the targets-meet check decides. Lists the numbers that do otherwise.
 */
const targetSides = (page: Page) =>
  page.evaluate(
    ({ link, wraps, counted }) => {
      const visible = new RegExp(counted, 'gu')
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
      const reach = (b: Element, side: 'left' | 'right') => parseFloat(getComputedStyle(b, '::after')[side] || '0') < 0
      /** Visible characters, a run of white space as one. */
      const seen = (text: string) => text.replace(/\s+/gu, ' ').match(visible) ?? []
      const ends = (n: Node | null): boolean =>
        n instanceof Element &&
        (n.matches(link) || (n.matches(wraps) && n.lastChild === n.lastElementChild && ends(n.lastChild)))
      const starts = (n: Node | null): boolean =>
        n instanceof Element && (n.matches(link) || (n.matches(`${wraps}, .cite-bound`) && starts(n.firstChild)))
      /** The first number, from the word bound to it (what precedes the numbers): what must hold, or null. */
      const first = (bound: Element) => {
        const nodes = [...bound.childNodes]
        const word = nodes.slice(
          0,
          nodes.findIndex((n) => n instanceof Element && n.matches('sup')),
        )
        const text = word.map((n) => n.textContent ?? '').join('')
        return word.length === 0 || ends(word.at(-1) ?? null) ? false : seen(text).length >= 3 || null
      }
      /** The last number, from what follows the group up to the next element. */
      const last = (next: Node | null) => {
        const text = next?.nodeType === Node.TEXT_NODE ? (next.textContent ?? '') : ''
        if (starts(next?.nodeType === Node.TEXT_NODE && text.trim() === '' ? next.nextSibling : next)) return false
        return seen(text).length >= 3 || null
      }
      return [...document.querySelectorAll('.md .cite-bound')]
        .filter((bound) => !bound.closest('.md-table'))
        .flatMap((bound) => {
          const buttons = [...bound.querySelectorAll('sup.cite button')]
          const [one, end] = [buttons[0], buttons.at(-1)]
          if (!one || !end) return []
          const start = first(bound)
          const after = last(bound.nextSibling)
          return [
            ...(start === null || start === reach(one, 'left') ? [] : [`${one.textContent} before`]),
            ...(after === null || after === reach(end, 'right') ? [] : [`${end.textContent} after`]),
          ].map((w) => `${bound.textContent.trim()}: ${w}`)
        })
    },
    { link: 'a', wraps: 'strong, em', counted: '[\\p{L}\\p{N}\\p{P}\\p{S} ]' },
  )

test('reading @phone · each citation’s target is its own: none meets another, or takes a press on a link', async ({
  page,
}) => {
  await openReading(page)
  const targets = await touchTargets(page)
  expect(targets.count, 'citations outside tables').toBeGreaterThan(10)
  expect(targets.meet, 'targets that meet: a press there belongs to two citations').toEqual([])
  expect(targets.missed, 'presses inside a citation’s target that reach something else').toEqual([])
  expect(targets.linkTaken, 'presses on a link beside a citation that something else takes').toEqual([])
  expect(targets.tall, 'targets as tall as the step between their lines').toEqual([])
  // A target that stops where it could reach is a smaller target for nothing; one that reaches beside a link takes it.
  expect(await targetSides(page), 'numbers whose target reaches or stops on the wrong side').toEqual([])
})

/** How a citation's number is drawn: its weight and its underline. */
const look = (button: Locator) =>
  button.evaluate((el) => {
    const s = getComputedStyle(el)
    return { weight: s.fontWeight, line: s.textDecorationLine, style: s.textDecorationStyle }
  })

test('reading · a citation of a source read in part or as a snippet is marked and named so; a group joins with a comma', async ({
  page,
}) => {
  await openReading(page)
  const md = pane(page).locator('.md')
  await expect(md.getByRole('button', { name: 'Source 1', exact: true }).first()).not.toHaveAttribute('data-weak')
  const part = md.getByRole('button', { name: 'Source 3, read in part', exact: true })
  await expect(part.first()).toHaveAttribute('data-weak', 'part')
  await expect(md.getByRole('button', { name: 'Source 4, snippet only', exact: true }).first()).toHaveAttribute(
    'data-weak',
    'snippet',
  )
  await expect(md.getByRole('button', { name: 'Source 6', exact: true }).first()).not.toHaveAttribute('data-weak') // a file
  // For the eye, a weak number is regular and dotted; one read in full is bold and plain.
  expect(await look(part.first())).toEqual({ weight: '400', line: 'underline', style: 'dotted' })
  expect(await look(md.getByRole('button', { name: 'Source 1', exact: true }).first())).toEqual({
    weight: '700',
    line: 'none',
    style: 'solid',
  })
  // "a single zone (2; 3)": one superscript, the numbers joined by a comma, bound to "zone".
  await expect(md.locator('sup.cite', { hasText: /^2,3$/ })).toHaveCount(1)
  await expect(md.locator('.cite-bound', { hasText: /^zone2,3$/ })).toHaveCount(1)
  // A weak citation still shows its source, with the focus on it.
  await part.first().click()
  await expect(pane(page).locator(`#source-${S3}`)).toBeFocused()
  await expect(pane(page).locator(`#source-${S1}`)).not.toHaveAttribute('data-focused')
})

test('reading · an Italian report names its citations in Italian and is marked as Italian', async ({ page }) => {
  await page.goto(`/room.html?report=${READING}&version=${readingVersionId(1)}`)
  const md = page.locator('.report-pane .md')
  await expect(md).toContainText('Questo rapporto confronta gli host')
  await expect(md).toHaveAttribute('lang', 'it')
  await expect(md.getByRole('button', { name: 'Fonte 1, letta in parte', exact: true })).toHaveAttribute(
    'data-weak',
    'part',
  )
  await expect(md.getByRole('button', { name: 'Fonte 2, solo anteprima', exact: true })).toBeVisible()
  await expect(md.getByRole('button', { name: 'Fonte 3', exact: true })).not.toHaveAttribute('data-weak')
})

test('reading · a five-column table takes the reading column’s width: on the full page it fits, nothing to scroll', async ({
  page,
}) => {
  await page.goto(`/room.html?report=${READING}&version=${readingVersionId(1)}&view=full`)
  const frame = page.locator('.report-pane .md-table')
  await expect(frame).toContainText('Costo mensile')
  expect(await frame.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
  expect((await frame.boundingBox())?.width).toBe(544)
})

test('reading · a five-column table fits the side pane beside the room, at its narrowest (1024) and at 1280', async ({
  page,
}) => {
  for (const width of [1024, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`/room.html?report=${READING}&version=${readingVersionId(1)}`)
    const frame = page.locator('.report-pane .md-table')
    await expect(frame).toContainText('Costo mensile')
    expect(await frame.evaluate((el) => el.scrollWidth - el.clientWidth), `at ${String(width)} px`).toBe(0)
  }
})

test('reading · on the full page the measure is the Document tab’s: Sources and History keep their width', async ({
  page,
}) => {
  await page.goto(`/room.html?report=${READING}&view=full`)
  await expect(page.locator('.md')).toContainText(SUMMARY)
  // The full page opens growing (a scale), as Enlarge does: measured once it has grown.
  await page
    .locator('.report-pane')
    .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
  await pane(page).getByRole('tab', { name: 'Sources 6' }).click()
  expect((await page.locator('.report-pane .sources').boundingBox())?.width).toBe(780)
  await pane(page)
    .getByRole('tab', { name: /^History/ })
    .click()
  expect((await page.locator('.report-pane .report-history').boundingBox())?.width).toBe(780)
})

test('reading · a bullet nested in a numbered list takes no number: the next item is 2', async ({ page }) => {
  await openReading(page)
  // The markers as the accessibility tree reads them, in order: the numbered tests and the bullet nested in the first.
  const client = await page.context().newCDPSession(page)
  const { nodes } = (await client.send('Accessibility.getFullAXTree')) as {
    nodes: { role?: { value?: string }; name?: { value?: string } }[]
  }
  const markers = nodes.filter((n) => n.role?.value === 'ListMarker').map((n) => n.name?.value?.trim() ?? '')
  const at = markers.indexOf('1.')
  expect(at, 'the numbered tests').toBeGreaterThanOrEqual(0)
  expect(markers.slice(at, at + 4)).toEqual(['1.', '·', '2.', '3.'])
})

test('reading · the version’s limitations sit under an amber rule, not in a tinted card', async ({ page }) => {
  await openReading(page)
  const limits = page.locator('.report-limits')
  await expect(limits).toContainText('Restore times are vendor claims; none was measured.')
  const box = await limits.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      rule: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      left: s.borderLeftWidth,
      ground: s.backgroundColor,
      radius: s.borderTopLeftRadius,
    }
  })
  expect(box).toEqual({ rule: '2px solid rgb(239, 191, 134)', left: '0px', ground: 'rgba(0, 0, 0, 0)', radius: '0px' })
})
