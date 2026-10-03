import { expect, test, type Page } from '@playwright/test'
import { READING, READING_TITLE, readingVersionId } from '../fixtures/reading-data.ts'

// How the viewer's Document tab reads (html-report-v2, SPEC §4b), on the room's fixture page with the long reading
// report (fixtures/reading-data.ts): one measure in both pane sizes, the serif reading voice, booktabs tables that never
// break a word, nested items that take no number, the limitations under an amber rule, citations bound to their word,
// grouped with commas, and marked and named when their source was read only in part. Each number is measured in the
// real page, never judged by eye.

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

  await pane(page).getByRole('button', { name: 'Enlarge' }).click()
  await expect(page.locator('.report-pane')).toHaveAttribute('data-size', 'full')
  const full = await lineLengths(page)
  expect(full.median, 'the full page').toBeGreaterThanOrEqual(60)
  expect(full.median, 'the full page').toBeLessThanOrEqual(80)
  // One column: the download line and the version's limitations stand on the text's own edge, as wide as it.
  const text = await edge(page, '.md')
  expect(text.width).toBe(544)
  expect(await edge(page, '.page-download')).toEqual(text)
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
          return [name, { family: s.fontFamily.split(',')[0]?.trim(), size: s.fontSize, leading: s.lineHeight }]
        }),
      ),
    parts,
  )
  expect(voice.text).toEqual({ family: 'Charter', size: '17px', leading: '27.2px' })
  expect(voice.title?.family).toBe('Charter')
  expect(voice.section?.family).toBe('Charter')
  for (const part of [voice.table, voice.cite, voice.marker]) expect(part?.family).toBe('"Geist Variable"')
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
  await pane(page).getByRole('button', { name: 'Enlarge' }).click()
  await expect(page.locator('.report-pane')).toHaveAttribute('data-size', 'full')
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
})

/**
 * Over a sweep of the column's width, where a line starts with a citation or with the comma between two: a part of a
 * group (a number, a comma) whose middle is below the bottom of what comes before it (the end of the text before the
 * group, or the part before it). A sweep, because where a line ends depends on the width and on the fonts.
 */
const brokenBindings = (page: Page, widths: readonly number[]) =>
  page.evaluate((sweep) => {
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
        const boxes = [text, ...[...sup.children].map((el) => el.getBoundingClientRect())]
        const broken = boxes.slice(1).some((box, k) => {
          const prior = boxes[k]
          return !!box && !!prior && box.top + box.height / 2 > prior.bottom
        })
        if (broken) starts.push(`${String(width)}: ${sup.textContent}`)
      }
    }
    md.style.maxWidth = ''
    return starts
  }, widths)

test('reading @phone · no line starts with a citation or its comma, at any width of the column', async ({ page }) => {
  await openReading(page)
  const natural = await edge(page, '.md')
  const widths = Array.from({ length: 52 }, (_, i) => natural.width - 2 * i)
  expect(widths.at(-1), 'the sweep reaches a narrow column').toBeLessThan(250)
  expect(await brokenBindings(page, widths)).toEqual([])
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

test('reading · a citation of a source read in part or as a snippet is marked and named so; a group joins with a comma', async ({
  page,
}) => {
  await openReading(page)
  const md = pane(page).locator('.md')
  await expect(md.getByRole('button', { name: 'Source 1', exact: true }).first()).not.toHaveAttribute('data-weak')
  const part = md.getByRole('button', { name: 'Source 3, read in part', exact: true })
  await expect(part.first()).toHaveAttribute('data-weak', 'part')
  await expect(md.getByRole('button', { name: 'Source 4, snippet only', exact: true })).toHaveAttribute(
    'data-weak',
    'snippet',
  )
  await expect(md.getByRole('button', { name: 'Source 6', exact: true })).not.toHaveAttribute('data-weak') // a file
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
