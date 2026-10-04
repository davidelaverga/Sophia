import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

// What html-report-v2's layout checks (report-page.spec.ts) measure in a page, each a plain number or list the check
// compares with its threshold. They read the markup html-report-v1 printed as well (no <main> needed), so a check
// that holds v2 to a criterion fails v1 where v1 misses it, not because a v2 element is absent.

/** The reading text the measure is taken on: the lead's and the sections' paragraphs and items, not the back matter. */
const READING = '.lead > p, section:not(.sources, .method) > p, section:not(.sources, .method) > :is(ul, ol) > li'

/**
 * The median characters per rendered line of the reading text: each character's rect gives its line; citations are
 * left out, and so are each block's last line and lines of 10 characters or fewer. Zero when nothing was measured.
 */
export const medianLine = (page: Page) =>
  page.evaluate((selector) => {
    const lines: number[] = []
    for (const block of document.querySelectorAll(selector)) {
      const rows = new Map<number, number>()
      const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const length = n.parentElement?.closest('sup.cite') ? 0 : (n.textContent?.length ?? 0)
        for (let i = 0; i < length; i += 1) {
          const range = document.createRange()
          range.setStart(n, i)
          range.setEnd(n, i + 1)
          const row = Math.round((range.getClientRects()[0]?.top ?? Number.NaN) / 3)
          rows.set(row, (rows.get(row) ?? 0) + 1)
        }
      }
      const counts = [...rows].filter(([row]) => !Number.isNaN(row)).toSorted((a, b) => a[0] - b[0])
      lines.push(
        ...counts
          .slice(0, -1)
          .map(([, count]) => count)
          .filter((count) => count > 10),
      )
    }
    return lines.toSorted((a, b) => a - b)[Math.floor(lines.length / 2)] ?? 0
  }, READING)

/**
 * What runs past the screen: how far the page scrolls sideways, the elements outside a scrolling frame that pass
 * its right edge, the code blocks that scroll, the tables that pass the body's box or the screen, and the table frames
 * that scroll further than their table is wide (something inside, a citation's target, reaching past its last column).
 */
export const overflow = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const all = [...document.body.querySelectorAll('*')]
    const scrolling = all.filter((e) => ['auto', 'scroll'].includes(getComputedStyle(e).overflowX))
    const edge = Math.min(width, document.body.getBoundingClientRect().right + 0.5)
    const figures = [...document.querySelectorAll('figure.table')]
    return {
      page: document.documentElement.scrollWidth - width,
      outside: all
        .filter((e) => {
          const r = e.getBoundingClientRect()
          return (
            r.width > 0 && r.height > 0 && r.right > width + 0.5 && !scrolling.some((f) => f !== e && f.contains(e))
          )
        })
        .map((e) => e.tagName.toLowerCase()),
      code: [...document.querySelectorAll('pre')].filter((e) => e.scrollWidth > e.clientWidth + 1).length,
      tables: figures.filter((f) => f.getBoundingClientRect().right > edge + 0.5).length,
      frames: figures.filter((f) => f.scrollWidth > Math.max(f.clientWidth, f.querySelector('table')?.offsetWidth ?? 0))
        .length,
    }
  })

/** The words of 14 characters or fewer whose letters a table cell sets on two lines. */
export const brokenWords = (page: Page) =>
  page.evaluate(() => {
    const nodes: Node[] = []
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.parentElement?.closest('th, td')) nodes.push(n)
    return nodes.flatMap((node) =>
      [...(node.textContent ?? '').matchAll(/[\p{L}\p{N}]+/gu)]
        .filter((m) => {
          if (m[0].length > 14) return false
          const range = document.createRange()
          range.setStart(node, m.index)
          range.setEnd(node, m.index + m[0].length)
          return new Set([...range.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size > 1
        })
        .map((m) => m[0]),
    )
  })

/**
 * The weakest contrast of any visible text on the page (WCAG 2.x): every element's own text and every pseudo-element
 * that shows text (a marker, a glyph), against the first opaque ground behind it. Large text needs 3:1, the rest 4.5:1;
 * the masthead's monogram is a logotype and a section break's dots an ornament, so both are left out.
 */
export const worstContrast = (page: Page) =>
  page.evaluate(() => {
    const WEIGHTS = [0.2126, 0.7152, 0.0722]
    const luminance = (color: string) =>
      (color.match(/[\d.]+/g) ?? [])
        .slice(0, 3)
        .map((c) => Number(c) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + c * (WEIGHTS[i] ?? 0), 0)
    const all = [document.documentElement, document.body, ...document.body.querySelectorAll('*')]
    const opaque = new Set(
      all.filter((e) => Number((getComputedStyle(e).backgroundColor.match(/[\d.]+/g) ?? [])[3] ?? 1) > 0.5),
    )
    const ground = (e: Element) => {
      for (let a: Element | null = e; a; a = a.parentElement)
        if (opaque.has(a)) return getComputedStyle(a).backgroundColor
      return 'rgb(0, 0, 0)'
    }
    // An element of no height still shows its pseudo-elements' text (a section break is a rule with dots on it).
    const texts = all
      .filter((e) => e.getBoundingClientRect().width > 0)
      .flatMap((e) => {
        const own = [...e.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim())
        const pseudos = ['::before', '::after', '::marker'].filter((pseudo) => {
          const style = getComputedStyle(e, pseudo)
          if (pseudo === '::marker')
            return getComputedStyle(e).display === 'list-item' && style.listStyleType !== 'none'
          if (pseudo === '::before' && e.matches('.title-block .eyebrow, hr')) return false
          return !['none', 'normal', '""'].includes(style.content)
        })
        return [...(own ? [''] : []), ...pseudos].map((pseudo) => ({ e, pseudo }))
      })
    const rated = texts.map(({ e, pseudo }) => {
      const style = getComputedStyle(e)
      const size = parseFloat(style.fontSize)
      const need = size >= 24 || (parseInt(style.fontWeight, 10) >= 700 && size >= 18.66) ? 3 : 4.5
      const fg = luminance(getComputedStyle(e, pseudo || null).color)
      const bg = luminance(ground(e))
      return {
        ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
        need,
        what: e.tagName.toLowerCase() + pseudo,
      }
    })
    return rated.reduce((w, r) => (r.ratio / r.need < w.ratio / w.need ? r : w), {
      ratio: Infinity,
      need: 4.5,
      what: '',
    })
  })

/**
 * The body's type and the heading scale: a body paragraph's size and its leading (line height over size), and the
 * sizes of the title, a section heading, a subheading and that paragraph, largest first (one the page lacks left out).
 */
export const typeScale = (page: Page) =>
  page.evaluate(() => {
    const body =
      document.querySelector('section[data-report-role="body"] > p') ??
      document.querySelector('section:not([data-report-role="summary"]) > p')
    const heads = ['h1', 'section[data-report-role="body"] > h2', 'section h3'].map((s) => document.querySelector(s))
    const sizes = [...heads, body].map((e) => (e ? parseFloat(getComputedStyle(e).fontSize) : null))
    const size = sizes.at(-1) ?? null
    return {
      body: size,
      leading: body && size ? parseFloat(getComputedStyle(body).lineHeight) / size : null,
      scale: sizes.filter((s) => s !== null),
    }
  })

/**
 * The contents on a wide screen: whether it stays in view as the page scrolls, and how far its right edge stands left
 * of the answer's first block and of a body paragraph (less than zero where it covers them).
 */
export const rail = (page: Page) =>
  page.evaluate(() => {
    const toc = document.querySelector('nav.toc')
    if (!toc) return null
    const right = toc.getBoundingClientRect().right
    const text = ['section[data-report-role="summary"] > h2 + *', 'section[data-report-role="body"] > p']
    return {
      sticky: getComputedStyle(toc).position === 'sticky',
      gaps: text.flatMap((s) => {
        const e = document.querySelector(s)
        return e ? [Math.round(e.getBoundingClientRect().left - right)] : []
      }),
    }
  })

/** The least target a citation is pressed on: a square of 24 CSS pixels (WCAG 2.2's target size minimum, 2.5.8). */
const TARGET = 24

/**
 * Each citation's target, where a finger lands: a square of TARGET centred on its numeral. A press anywhere in it must
 * reach the citation (elementFromPoint at its centre, corners and edge midpoints, half a pixel in, the citation
 * scrolled into view first, a table's frame no further than it must), and no two citations' squares may overlap (taken
 * where the page lays them out). The lines that hold a citation must stand more than TARGET apart (its block's line
 * height), so squares on consecutive lines cannot meet however the text wraps. Returns how many citations there are,
 * one line for each a press missed (the numeral, the probe, what took the press), one for each pair whose squares
 * overlap, and each block holding a citation whose lines stand closer (its tag and line height).
 */
export const citationTargets = (page: Page) =>
  page.evaluate((side) => {
    const links = [...document.querySelectorAll('sup.cite a')]
    /** The square of `side` centred on a citation's numeral, where it is on the screen now. */
    const square = (link: Element) => {
      const r = link.getBoundingClientRect()
      const [x, y] = [r.left + r.width / 2, r.top + r.height / 2]
      return { x, y, left: x - side / 2, right: x + side / 2, top: y - side / 2, bottom: y + side / 2 }
    }
    const laid = links.map(square)
    const overlaps = laid.flatMap((a, i) =>
      laid
        .slice(i + 1)
        .flatMap((b, k) =>
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
            ? [`${links[i]?.textContent} and ${links[i + 1 + k]?.textContent}`]
            : [],
        ),
    )
    const h = side / 2 - 0.5
    const probes = [-h, 0, h].flatMap((dx) => [-h, 0, h].map((dy) => [dx, dy] as const))
    const missed = links.flatMap((link) => {
      // Where a reader meets it: its table's frame scrolled back to the start, then only as far as shows its square.
      const frame = link.closest('figure.table')
      if (frame) frame.scrollLeft = 0
      link.scrollIntoView({ block: 'center', inline: 'nearest' })
      if (frame) frame.scrollLeft += Math.max(0, square(link).right - frame.getBoundingClientRect().right)
      const { x, y } = square(link)
      const taken = probes
        .map(([dx, dy]) => ({ dx, dy, hit: document.elementFromPoint(x + dx, y + dy) }))
        .find(({ hit }) => hit?.closest('a') !== link)
      if (!taken) return []
      return [
        `${link.textContent} at ${taken.dx},${taken.dy}: ${taken.hit?.tagName.toLowerCase()}.${taken.hit?.className}`,
      ]
    })
    const blocks = new Set(
      links.map((link) => {
        let block = link.parentElement
        while (block?.parentElement && getComputedStyle(block).display === 'inline') block = block.parentElement
        return block
      }),
    )
    const lines = [...blocks].flatMap((block) => {
      const height = block ? getComputedStyle(block).lineHeight : 'none'
      return parseFloat(height) > side ? [] : [`${block?.tagName.toLowerCase()} at ${height}`]
    })
    return { count: links.length, missed, overlaps, lines: [...new Set(lines)] }
  }, TARGET)

/**
 * Where the answer stands: whether the summary section comes before the contents and before the first body section
 * (true when there is nothing to come before), and where its first block starts on the page.
 */
export const answerFirst = (page: Page) =>
  page.evaluate(() => {
    const summary = document.querySelector('section[data-report-role="summary"]')
    const before = (selector: string) => {
      const other = document.querySelector(selector)
      if (!summary || !other) return summary !== null
      return (summary.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    }
    const answer = summary?.querySelector(':scope > h2 + *')
    return {
      contents: before('nav.toc'),
      body: before('section[data-report-role="body"]'),
      top: answer ? Math.round(answer.getBoundingClientRect().top + window.scrollY) : null,
    }
  })

/**
 * The page as printed, before the PDF: the tables that pass the printable width (a table on a landscape page of its
 * own is judged by the PDF instead), the body's ink, each table cell's text without its citations, and the opening
 * words of a body paragraph that occur once on the page (its size in the PDF says whether print was scaled).
 */
export const printed = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const cells = new Map<Element, string>()
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const cell = n.parentElement?.closest('th, td')
      if (cell && !n.parentElement?.closest('sup.cite'))
        cells.set(cell, (cells.get(cell) ?? '') + (n.textContent ?? ''))
    }
    const all = document.body.textContent
    const openings = [...document.querySelectorAll('section:not([data-report-role="summary"]) > p')].map((p) =>
      p.textContent.trim().slice(0, 24),
    )
    return {
      clipped: [...document.querySelectorAll('figure.table table')].filter(
        (t) =>
          getComputedStyle(t.closest('figure') ?? t).getPropertyValue('page') !== 'wide' &&
          t.getBoundingClientRect().right > width + 0.5,
      ).length,
      ink: getComputedStyle(document.body).color,
      cells: [...cells.values()].map((text) => text.replace(/\s+/g, ' ').trim()).filter((text) => text !== ''),
      opening: openings.find((t) => t.length >= 16 && all.split(t).length === 2) ?? null,
    }
  })

const FONTS = fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))

/** A PDF's text, its pages, and the size in points of the first text item that starts with `opening`. */
export async function pdfText(pdf: Buffer, opening: string | null) {
  const doc = await getDocument({ data: new Uint8Array(pdf), standardFontDataUrl: FONTS }).promise
  let text = ''
  let size: number | null = null
  for (let i = 1; i <= doc.numPages; i += 1) {
    const { items } = await (await doc.getPage(i)).getTextContent()
    for (const item of items) {
      if (!('str' in item)) continue
      text += item.str + (item.hasEOL ? ' ' : '')
      const transform: readonly unknown[] = item.transform
      const [a, b] = transform
      if (opening && size === null && item.str.startsWith(opening) && typeof a === 'number' && typeof b === 'number') {
        size = Math.round(Math.hypot(a, b) * 10) / 10
      }
    }
  }
  return { text, pages: doc.numPages, size }
}
