// What the capture kernel measures inside a designed page (SDD-01 §7, pack 05 §3 and §5): its size and horizontal
// overflow, its sections, and every content block's visibility, clipping, cover and contrast. The labels a tooltip,
// an accessible name or an ID reference rests on (marked data-sophia-shown by the design compile), and each element
// inside one that holds text, are measured as blocks are, and more strictly: a reader meets their text elsewhere, so
// it must be seen here (SDD-01, #117). Every other element outside the blocks that holds text is measured too, so the
// kernel can name text no capture shows at any target (capture-html.mjs). Page JavaScript is off,
// so these functions are not the page's: the kernel sends their source (`pageScript`) and runs it through the
// browser's protocol. Each is self-contained but for the others in this file, which travel with it; none reads the
// network or writes the document.

/** @typedef {{ x: number, y: number, width: number, height: number }} Box */
/**
 * @typedef {{ ratio: number | null, floor: number, large: boolean, detail: string | null }} Contrast
 * @typedef {{ id: string, section: string | null, box: Box, fontPx: number, issues: string[],
 *   contrast: Contrast }} BlockMeasure
 * @typedef {{ width: number, height: number, viewportWidth: number, viewportHeight: number,
 *   overflowPx: number, overflowing: { element: string, rightPx: number }[], sections: ({ id: string } & Box)[],
 *   blocks: BlockMeasure[], shown: BlockMeasure[], framing: BlockMeasure[] }} PageMeasure
 * @typedef {PageMeasure & { unmeasured: number }} PageAnswer the measure, and how many labels and texts outside the
 *   blocks it left out past the receipt's bound (the kernel fails the target on any)
 */

/** The most labels, and the most texts outside the blocks, a page's measure holds: the receipt's bound for each. */
export const MAX_MEASURED = 4000

/**
 * The marks that say nothing, as a character class: the design profile's list (@sophia/design css.ts, MARK_TEXT; a test
 * holds the two equal). Text of only these is a separator or a bullet, which is neither measured nor held to contrast.
 */
export const MARK_CLASS = String.raw`.,;:/|()[\]'"*\-_‐‑‒–—―…·•◦‣⁃∙▪▫■□●○◆◇▴▵▾▿→←↑↓↗↘↩⇒⇐›‹»«▸▹►▶▷◂◀◁“”‘’„‚†‡§¶`

/**
 * An element's box in document coordinates, rounded outwards to whole CSS pixels.
 * @param {Element} el
 * @returns {Box}
 */
function boxOf(el) {
  const r = el.getBoundingClientRect()
  const x = Math.floor(r.left + window.scrollX)
  const y = Math.floor(r.top + window.scrollY)
  return { x, y, width: Math.ceil(r.right + window.scrollX) - x, height: Math.ceil(r.bottom + window.scrollY) - y }
}

/**
 * A short name for an element in a finding: its tag and id, or the block or section it is.
 * @param {Element} el
 */
function nameOf(el) {
  const mark = el.getAttribute('data-block') ?? el.getAttribute('data-section')
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${mark ? `[${mark}]` : ''}`.slice(0, 80)
}

/**
 * The outermost elements that reach past the viewport's right edge.
 * @param {number} limit the viewport width
 * @param {number} max
 */
function overflowingElements(limit, max) {
  return [...document.body.querySelectorAll('*')]
    .map((el) => ({ el, right: el.getBoundingClientRect().right }))
    .filter(
      ({ el, right }) =>
        right > limit + 1 && !(el.parentElement && el.parentElement.getBoundingClientRect().right > limit + 1),
    )
    .slice(0, max)
    .map(({ el, right }) => ({ element: nameOf(el), rightPx: Math.ceil(right) }))
}

/**
 * Why a block cannot be seen, by its own and its ancestors' style: not rendered, hidden, transparent, or empty.
 * @param {Element} el
 * @returns {string[]}
 */
function hiddenIssues(el) {
  if (el.getClientRects().length === 0) return ['not_rendered']
  const style = getComputedStyle(el)
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return ['hidden']
  let opacity = 1
  for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement)
    opacity *= Number.parseFloat(getComputedStyle(a).opacity || '1')
  if (opacity < 0.1) return ['transparent']
  const text = document.createRange()
  text.selectNodeContents(el)
  const t = text.getBoundingClientRect()
  if (el.textContent.trim() !== '' && (t.width < 2 || t.height < 2)) return ['no_visible_text']
  if (Number.parseFloat(style.fontSize) < 1) return ['no_visible_text']
  return []
}

/**
 * Why a shown label's text cannot be seen beyond what hides a block: cut out by a clip or a clip path, on it or an
 * ancestor, or pushed off the page (a negative text indent).
 * @param {Element} el
 * @returns {string[]}
 */
function concealedIssues(el) {
  for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) {
    const style = getComputedStyle(a)
    if ((style.clipPath && style.clipPath !== 'none') || (style.clip && style.clip !== 'auto')) return ['clipped']
  }
  const text = document.createRange()
  text.selectNodeContents(el)
  const t = text.getBoundingClientRect()
  if (el.textContent.trim() !== '' && (t.right + window.scrollX <= 0 || t.bottom + window.scrollY <= 0))
    return ['off_page']
  return []
}

/**
 * Whether one box lies inside another, give or take a pixel.
 * @param {Box} inner
 * @param {Box} outer
 */
function inside(inner, outer) {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1
  )
}

/**
 * Whether an overflow value hides what overflows.
 * @param {string} value
 */
function hides(value) {
  return value === 'hidden' || value === 'clip'
}

/**
 * Whether an element's text is cut by its own overflow (an ellipsis, a line clamp, a fixed height).
 * @param {Element} el
 */
function cutsOwnText(el) {
  const style = getComputedStyle(el)
  if (!hides(style.overflowX) && !hides(style.overflowY)) return false
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
}

/**
 * Where a block sits against the page and its containers: off the page, cut by an ancestor that hides overflow, its
 * own text cut, or inside a scrolling container that does not show it whole (reachable, but not in a capture).
 * @param {Element} el
 * @param {Box} box
 * @param {Box} page
 * @returns {string[]}
 */
function placementIssues(el, box, page) {
  if (box.x + box.width <= 0 || box.y + box.height <= 0 || box.x >= page.width || box.y >= page.height)
    return ['off_page']
  const out = []
  if (cutsOwnText(el)) out.push('text_cut')
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    const style = getComputedStyle(a)
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
    if (inside(box, boxOf(a))) continue
    const scrolls = [style.overflowX, style.overflowY].some((v) => v === 'auto' || v === 'scroll')
    out.push(scrolls ? 'scrolls' : 'clipped')
    break
  }
  return out
}

/**
 * Whether something else is drawn over the block's first line of text, seen from the middle of it with the block
 * scrolled into view. Fixed and sticky elements (a header that follows the reader) do not count.
 * @param {Element} el
 */
function isCovered(el) {
  const range = document.createRange()
  range.selectNodeContents(el)
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
  const line = range.getClientRects()[0]
  if (!line || line.width < 2 || line.height < 2) return false
  const hit = document.elementFromPoint(line.left + Math.min(line.width / 2, 40), line.top + line.height / 2)
  if (!hit || el.contains(hit) || hit.contains(el)) return false
  for (let a = /** @type {Element | null} */ (hit); a; a = a.parentElement) {
    const position = getComputedStyle(a).position
    if (position === 'fixed' || position === 'sticky') return false
  }
  return true
}

/**
 * A colour as sRGB bytes, by painting it: whatever syntax the page used, the canvas resolves it.
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {string[]} layers bottom first, each painted over the last
 * @returns {[number, number, number]}
 */
function paint(ctx, layers) {
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1, 1)
  for (const colour of layers) {
    ctx.fillStyle = '#ffffff'
    ctx.fillStyle = colour
    ctx.fillRect(0, 0, 1, 1)
  }
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

/**
 * WCAG relative luminance of an sRGB colour.
 * @param {[number, number, number]} rgb
 */
function luminance(rgb) {
  const [r = 0, g = 0, b = 0] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * The colours of a gradient's stops, as the computed style writes them; an empty list when it names none.
 * @param {string} image
 */
function gradientStops(image) {
  return image.match(/(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi) ?? []
}

/**
 * The background layers behind an element, from the page down to it, as lists of alternatives: one colour, or each
 * stop of a gradient. Null when a layer is an image that is not a gradient, or a gradient whose stops are unknown.
 * @param {Element} el
 * @returns {string[][] | null}
 */
function backgroundLayers(el) {
  /** @type {string[][]} */
  const layers = []
  for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) {
    const style = getComputedStyle(a)
    const image = style.backgroundImage
    if (image !== 'none') {
      const stops = image.includes('gradient(') ? gradientStops(image) : []
      if (stops.length === 0) return null
      layers.unshift(stops)
    }
    layers.unshift([style.backgroundColor])
  }
  return layers
}

/**
 * Every way the background layers can combine, one alternative per layer; null past `max` combinations.
 * @param {string[][]} layers
 * @param {number} max
 * @returns {string[][] | null}
 */
function combinations(layers, max) {
  /** @type {string[][]} */
  let out = [[]]
  for (const alternatives of layers) {
    out = out.flatMap((under) => alternatives.map((colour) => [...under, colour]))
    if (out.length > max) return null
  }
  return out
}

/**
 * The block's text contrast against what is behind it (WCAG 2): the worst case over the stops of any gradient behind
 * it, against the floor for its size (3 for large text, 4.5 otherwise). Unknown when the background cannot be read.
 * @param {Element} el
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @returns {Contrast}
 */
function contrastOf(el, ctx) {
  const style = getComputedStyle(el)
  const px = Number.parseFloat(style.fontSize)
  const large = px >= 24 || (px >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700)
  const floor = large ? 3 : 4.5
  const layers = backgroundLayers(el)
  const behind = layers ? combinations(layers, 64) : null
  if (!behind) return { ratio: null, floor, large, detail: layers ? 'background_too_complex' : 'background_image' }
  let worst = Number.POSITIVE_INFINITY
  for (const under of behind) {
    const [hi = 0, lo = 0] = [luminance(paint(ctx, [...under, style.color])), luminance(paint(ctx, under))].toSorted(
      (a, b) => b - a,
    )
    worst = Math.min(worst, (hi + 0.05) / (lo + 0.05))
  }
  return { ratio: Math.round(worst * 100) / 100, floor, large, detail: null }
}

/**
 * One block's measures. A contrast below its floor is an issue; an unknown contrast is not, and says so.
 * @param {Element} el
 * @param {Box} page
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @returns {BlockMeasure}
 */
function measureBlock(el, page, ctx) {
  const box = boxOf(el)
  const hidden = hiddenIssues(el)
  const issues = hidden.length > 0 ? hidden : placementIssues(el, box, page)
  const contrast = contrastOf(el, ctx)
  if (contrast.ratio !== null && contrast.ratio < contrast.floor) issues.push('low_contrast')
  if (hidden.length === 0 && !issues.includes('off_page') && isCovered(el)) issues.push('covered')
  return {
    id: el.getAttribute('data-block') ?? '',
    section: el.closest('[data-section]')?.getAttribute('data-section') ?? null,
    box,
    fontPx: Math.round(Number.parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
    issues,
    contrast,
  }
}

/**
 * Everything the kernel measures at the current viewport. Scrolling to check cover moves the view, so it ends back at
 * the top, where every capture is taken from.
 * @param {{ maxListed: number, maxMeasured: number, marks: string }} opts
 * @returns {PageAnswer}
 */
function measurePage(opts) {
  const root = document.documentElement
  const page = { x: 0, y: 0, width: root.scrollWidth, height: root.scrollHeight }
  const ctx = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2D canvas to resolve colours')
  const blocks = [...document.querySelectorAll('[data-block]')].map((el) => measureBlock(el, page, ctx))
  const strictly = (/** @type {{ el: Element, id: string }} */ { el, id }) => {
    const measure = measureBlock(el, page, ctx)
    const concealed = concealedIssues(el)
    return { ...measure, id: id.slice(0, 200), issues: [...new Set([...concealed, ...measure.issues])].slice(0, 10) }
  }
  const labels = shownElements()
  const texts = framingElements(opts.marks)
  const shown = labels.slice(0, opts.maxMeasured).map(strictly)
  const framing = texts.slice(0, opts.maxMeasured).map(strictly)
  window.scrollTo(0, 0)
  return {
    width: page.width,
    height: page.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    overflowPx: Math.max(0, Math.ceil(page.width - window.innerWidth)),
    overflowing: overflowingElements(window.innerWidth, opts.maxListed),
    sections: [...document.querySelectorAll('[data-section]')].map((el) => ({
      id: el.getAttribute('data-section') ?? '',
      ...boxOf(el),
    })),
    blocks,
    shown,
    framing,
    unmeasured: labels.length - shown.length + texts.length - framing.length,
  }
}

/**
 * The labels marked data-sophia-shown, and each element inside one that holds text of its own, with the name a check
 * gives them.
 * @returns {{ el: Element, id: string }[]}
 */
function shownElements() {
  /** @type {{ el: Element, id: string }[]} */
  const out = []
  for (const label of document.querySelectorAll('[data-sophia-shown]')) {
    const name = `label ${label.getAttribute('data-sophia-shown') ?? ''}`
    out.push({ el: label, id: name })
    for (const inner of label.querySelectorAll('*')) {
      const holds = [...inner.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
      )
      if (holds) out.push({ el: inner, id: `${name} ${nameOf(inner)}` })
    }
  }
  return out
}

/**
 * Every element outside the blocks that holds text of its own beyond the marks that say nothing (`marks`, a character
 * class): a heading, a caption, a source entry, a navigation link. Numbered in document order, the same at every target.
 * @param {string} marks
 * @returns {{ el: Element, id: string }[]}
 */
function framingElements(marks) {
  const words = new RegExp(`[^\\s${marks}]`, 'u')
  /** @type {{ el: Element, id: string }[]} */
  const out = []
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('[data-block]')) continue
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join('')
    if (words.test(own)) out.push({ el, id: `text ${out.length + 1} ${nameOf(el)}` })
  }
  return out
}

/** The functions above, in the order they are defined, as the source the kernel sends. */
const IN_PAGE = [
  boxOf,
  nameOf,
  overflowingElements,
  hiddenIssues,
  concealedIssues,
  inside,
  hides,
  cutsOwnText,
  placementIssues,
  isCovered,
  paint,
  luminance,
  gradientStops,
  backgroundLayers,
  combinations,
  contrastOf,
  measureBlock,
  measurePage,
  shownElements,
  framingElements,
]

/**
 * An expression that measures the page with these options, the receipt's bound and the marks, and returns the measure.
 * @param {{ maxListed: number }} opts
 */
export function pageScript(opts) {
  const all = { ...opts, maxMeasured: MAX_MEASURED, marks: MARK_CLASS }
  return `(() => {\n${IN_PAGE.map((f) => f.toString()).join('\n')}\nreturn measurePage(${JSON.stringify(all)})\n})()`
}
