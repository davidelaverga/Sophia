// What each printed page says, read back with pdf.js (6.3.289, legacy build, the version Studio's viewer pins): the
// words in the page's body, with the kernel's footer and header margins stripped, and the raster images painted on
// it. The checks follow the donor's rules (render_markdown_to_pdf.py): a page with at most one word and no image is
// blank; a page with fewer than 80 words and no image is short, except the first (the title and contents) and the
// last. The bytes are the kernel's own Chromium output; they are parsed in-process (no worker; pdf.js 6 evaluates no
// code) with system fonts, font faces, WebAssembly and XFA off, stopping at the first error. A PDF that cannot be
// read leaves both checks unknown, never passed.
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

/** Fewer body words than this, on a page between the first and the last, make it short (the donor's threshold). */
export const SHORT_PAGE_WORDS = 80
const MAX_LISTED = 10
const IMAGE_OPS = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject])

/** @typedef {{ words: number, images: number }} PageText */
/** @typedef {{ outcome: 'passed' | 'failed' | 'unknown', detail: string | null }} PageCheck */

/**
 * One page's body words (text whose baseline lies inside the margins) and raster images.
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {number} marginPt
 * @returns {Promise<PageText>}
 */
async function pageText(page, marginPt) {
  const [, bottom = 0, , top = 0] = page.view
  const content = await page.getTextContent()
  const body = content.items
    .filter((i) => 'str' in i && i.transform[5] > bottom + marginPt && i.transform[5] < top - marginPt)
    .map((i) => ('str' in i ? i.str : ''))
    .join(' ')
  const ops = await page.getOperatorList()
  return {
    words: body.split(/\s+/).filter(Boolean).length,
    images: ops.fnArray.filter((f) => IMAGE_OPS.has(f)).length,
  }
}

/**
 * Every page's text, in order.
 * @param {Uint8Array} bytes the PDF (copied: pdf.js may take the buffer it is given, and a Buffer can share a pool)
 * @param {number} marginPt the margin the kernel printed with, in points; text inside it is the footer or header
 * @returns {Promise<PageText[]>}
 */
export async function pageTexts(bytes, marginPt) {
  const task = getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
    useWasm: false,
    enableXfa: false,
    verbosity: 0,
  })
  try {
    const doc = await task.promise
    /** @type {PageText[]} */
    const pages = []
    for (let n = 1; n <= doc.numPages; n += 1) pages.push(await pageText(await doc.getPage(n), marginPt))
    return pages
  } finally {
    await task.destroy()
  }
}

/**
 * "page 3", "pages 2, 5": the pages a check names, at most ten.
 * @param {number[]} numbers
 */
const listed = (numbers) =>
  `${numbers.length === 1 ? 'page' : 'pages'} ${numbers.slice(0, MAX_LISTED).join(', ')}${numbers.length > MAX_LISTED ? ', …' : ''}`

/**
 * @param {number[]} numbers
 * @returns {PageCheck}
 */
const outcomeOf = (numbers) =>
  numbers.length === 0 ? { outcome: 'passed', detail: null } : { outcome: 'failed', detail: listed(numbers) }

/**
 * The blank and short page checks. Unknown when the pages could not be read, or when their number disagrees with the
 * page count read from the bytes.
 * @param {PageText[] | null} pages
 * @param {number | null} pageCount
 * @returns {{ blank: PageCheck, short: PageCheck }}
 */
export function pageChecks(pages, pageCount) {
  if (pages === null || pages.length === 0 || (pageCount !== null && pages.length !== pageCount)) {
    const unknown = /** @type {PageCheck} */ ({
      outcome: 'unknown',
      detail: pages === null ? 'the PDF text could not be read' : 'the pages read disagree with the page count',
    })
    return { blank: unknown, short: unknown }
  }
  const numbered = pages.map((p, i) => ({ ...p, n: i + 1 }))
  const blank = numbered.filter((p) => p.words <= 1 && p.images === 0).map((p) => p.n)
  const short = numbered
    .filter((p) => p.n > 1 && p.n < pages.length && p.words > 1 && p.words < SHORT_PAGE_WORDS && p.images === 0)
    .map((p) => p.n)
  return { blank: outcomeOf(blank), short: outcomeOf(short) }
}
