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
 * @typedef {{ own: boolean, clip: string, edge: boolean, inset: boolean, widths: number[], generated: boolean,
 *   under: boolean }} Paints what an element paints that a text above it is read against (paintsOf)
 * @typedef {{ rows: Map<number, { box: Box, reach: number }[]>, over: boolean }} Reach where paint reaches past the
 *   boxes on the page (reachIndex)
 * @typedef {{ left: number, until: number, maxLines: number, paints: Map<Element, Paints>, reach: Reach }} Budget the
 *   points the cover check may still look at, the time (performance.now) it must stop by, the fewest lines a text may
 *   have to be refused unread, what each element looked at paints, and where paint reaches past the boxes
 * @typedef {{ left: number, top: number, right: number, bottom: number }} Clip where overflow lets content be drawn
 * @typedef {Clip & { owner: Element | null }} TextBox a line box of
 *   text on the page, and the block it sits in (null outside every block)
 * @typedef {{ ctx: OffscreenCanvasRenderingContext2D, paints: Budget['paints'], reach: Reach, elsewhere: boolean }} Look
 *   what the cover check reads backgrounds with, and whether a text it looked at lies over a background its styles do
 *   not give
 * @typedef {BlockMeasure & { probes: { x: number, y: number }[], unsampled: boolean }} ProbedMeasure a measure, the
 *   points the DevTools protocol is to hit-test where only it can tell what is drawn over the text (coverOf), and
 *   whether the page's budget of points ran out before its text was looked at; capture-html strips both
 * @typedef {Omit<PageMeasure, 'blocks' | 'shown' | 'framing'> & { blocks: ProbedMeasure[], shown: ProbedMeasure[],
 *   framing: ProbedMeasure[], unmeasured: number }} PageAnswer the measure, and how many labels, texts outside the
 *   blocks and runs inside them it left out past the receipt's bound for each (the kernel fails the target on any)
 */

/**
 * The most labels, texts outside the blocks, and runs of a block's text in elements inside it, a page's measure holds:
 * the receipt's bound for each.
 */
export const MAX_MEASURED = 4000

/**
 * The most points the cover check looks at on one page, at one target: along every line of every measured text, about
 * an em apart. A page that needs more fails the target as unmeasured, never as seen (#117).
 */
export const MAX_POINTS = 200_000

/**
 * The longest the cover check may look at one page, at one target, in milliseconds: within the capture's own time, so
 * no page's shape (a column one pixel wide, a hundred thousand lines) holds the renderer; a page that needs longer
 * fails the target as unmeasured (#117).
 */
export const MAX_LOOK_MS = 20_000

/**
 * The fewest lines one text may have for the cover check to refuse it unread, as unmeasured: far under the lines a
 * browser lists for one text at most (so a text with more lines than it lists is never taken as seen), and few enough
 * that looking along every line of the longest text it reads takes seconds, not the whole of MAX_LOOK_MS (#117).
 */
export const MAX_LINES = 10_000

/**
 * The smallest text outside the blocks a capture shows readably, as rendered: a line at least this tall, and glyphs
 * this far apart on average. A heading set at 3px, or scaled down, measures as present and is read by no one (#117).
 */
export const READABLE = { linePx: 10, advancePx: 3 }
/**
 * How close, in ems of a block's own text, another text may come to either end of one of its lines (#117): a mark, a
 * label or another block set that near reads as part of the block's text, as "-" before "10%" reads "-10%", while the
 * page's text still holds the block whole. A column beside the block, a word's width away or more, does not.
 */
export const BESIDE_EM = 0.5
/** The most line boxes of text the page's index of them holds; past it every block's text is left unmeasured. */
export const MAX_TEXT_RECTS = 100_000

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
  if (opacityOf(el) < 0.1) return ['transparent']
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
  const drawn = el.textContent.trim() !== '' && text.getClientRects().length > 0
  if (drawn && (t.right + window.scrollX <= 0 || t.bottom + window.scrollY <= 0)) return ['off_page']
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
 * own text cut, or inside a scrolling container that does not show it whole where the page starts (reachable, but in no
 * capture).
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
 * Where every box around an element is scrolled, the page included, and a way to put each back, at once whatever the
 * page's scroll-behavior. A measurement that scrolls must leave the page as it starts: each element after it is placed,
 * and every capture taken, where the reader first sees the page, not where the last measurement left a nested box
 * (#117).
 * @param {Element} el
 * @returns {() => void}
 */
function keepScroll(el) {
  /** @type {[Element, number, number][]} */
  const kept = []
  for (let a = el.parentElement; a; a = a.parentElement) kept.push([a, a.scrollLeft, a.scrollTop])
  return () => {
    for (const [a, left, top] of kept)
      if (a.scrollLeft !== left || a.scrollTop !== top) a.scrollTo({ left, top, behavior: 'instant' })
  }
}

/**
 * Whether a generated run is set inline beside its element's text, where it cannot reach over it: in the flow, on the
 * baseline, untransformed, with no negative margin or spacing, and no larger than the text.
 * @param {CSSStyleDeclaration} s the pseudo-element's style
 * @param {number} size the text's font size
 */
function besideText(s, size) {
  const spacing = [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft, s.letterSpacing, s.wordSpacing]
  const flow = s.display === 'inline' && s.position === 'static' && s.float === 'none'
  const set = s.transform === 'none' && s.verticalAlign === 'baseline' && Number.parseFloat(s.fontSize) <= size
  return flow && set && spacing.every((v) => !(Number.parseFloat(v) < 0))
}

/**
 * Whether the element holding a text draws ::before or ::after that could be drawn over it (anything but a run set
 * beside it). A pseudo-element hit-tests as the element that draws it, so only the DevTools protocol can tell what is
 * on top there (capture-html).
 * @param {Element} holder
 */
function drawsOverText(holder) {
  const size = Number.parseFloat(getComputedStyle(holder).fontSize)
  return ['::before', '::after'].some((p) => {
    const s = getComputedStyle(holder, p)
    return !['none', 'normal'].includes(s.content) && !besideText(s, size)
  })
}

/**
 * What a point on a text hits, as a cover. The text's own element is 'clear', or 'generated' when it draws generated
 * content that may be on top (capture-html asks the protocol). Anything else is 'covered': a child of the element or
 * one around it, drawn over the text (an ancestor's own ::after, or a background the text sits below), or another
 * element, a fixed or sticky one included: it is drawn over the text where the captures show it (#117). The static
 * profile has no fixed or sticky element, which a reader would see move over text no capture shows it over.
 * @param {Element} holder the element that holds the text
 * @param {boolean} suspect whether the holder draws generated content that could reach the text
 * @param {Element | null} hit
 * @returns {'clear' | 'covered' | 'generated'}
 */
function coverOf(holder, suspect, hit) {
  if (!hit) return 'clear'
  if (hit === holder) return suspect ? 'generated' : 'clear'
  return 'covered'
}

/**
 * Whether a point in the viewport is inside an element, and every box around it, that clips or scrolls what overflows
 * it: a line its own overflow cuts off is not shown, and is judged as cut text, not as covered.
 * @param {Element} el
 * @param {number} x
 * @param {number} y
 */
function inView(el, x, y) {
  if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false
  for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) {
    const style = getComputedStyle(a)
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
    const r = a.getBoundingClientRect()
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false
  }
  return true
}

/**
 * One line of a text, given in page coordinates, in the viewport: the window scrolled to it when it is outside. Only
 * the window scrolls, which moves no line on the page: a box around the text stays where the page opens it, and a line
 * it clips or scrolls away is not looked at here (where the element sits says why).
 * @param {Box} line
 * @returns {Box} the line in viewport coordinates
 */
function lineInView(line) {
  const at = () => ({ x: line.x - window.scrollX, y: line.y - window.scrollY, width: line.width, height: line.height })
  const rect = at()
  const across = rect.x < 0 || rect.x + rect.width > window.innerWidth
  if (rect.y >= 0 && rect.y + rect.height <= window.innerHeight && !across) return rect
  window.scrollBy({
    left: across ? rect.x + rect.width / 2 - window.innerWidth / 2 : 0,
    top: rect.y + rect.height / 2 - window.innerHeight / 2,
    behavior: 'instant',
  })
  return at()
}

/**
 * Points along a line of text where the cover check looks: through its middle, about an em apart, at most 64.
 * @param {Box} rect in viewport coordinates
 * @param {number} em
 */
function pointsAlong(rect, em) {
  const n = Math.min(64, Math.max(1, Math.ceil(rect.width / Math.max(em, 4))))
  return Array.from({ length: n }, (_, i) => ({
    x: rect.x + (rect.width * (i + 0.5)) / n,
    y: rect.y + rect.height / 2,
  }))
}

/**
 * Whether a style paints a border on any side: a width, a style that draws, and a colour that is not clear.
 * @param {CSSStyleDeclaration} s
 * @param {OffscreenCanvasRenderingContext2D} ctx
 */
function bordersPaint(s, ctx) {
  return ['top', 'right', 'bottom', 'left'].some(
    (side) =>
      Number.parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 &&
      !['none', 'hidden'].includes(s.getPropertyValue(`border-${side}-style`)) &&
      !isClear(ctx, s.getPropertyValue(`border-${side}-color`)),
  )
}

/**
 * Whether a style paints anything of its own: a background, a border, a shadow or an outline.
 * @param {CSSStyleDeclaration} s
 * @param {OffscreenCanvasRenderingContext2D} ctx
 */
function paintsAny(s, ctx) {
  return (
    s.backgroundImage !== 'none' ||
    !isClear(ctx, s.backgroundColor) ||
    bordersPaint(s, ctx) ||
    s.boxShadow !== 'none' ||
    s.outlineStyle !== 'none'
  )
}

/**
 * The sum of the pixel lengths a computed value names, each taken as positive.
 * @param {string} value
 */
function pixelsIn(value) {
  return (value.match(/-?[\d.]+px/gu) ?? []).reduce((sum, n) => sum + Math.abs(Number.parseFloat(n)), 0)
}

/**
 * How far an element's paint may reach past its border box, in CSS pixels: an outer box shadow (its offsets, blur and
 * spread), an outline (its width and offset) or a filter (three times the lengths it names, for a blur or a drop
 * shadow). 0 when it paints nothing outside its box.
 * @param {CSSStyleDeclaration} s
 */
function outerReach(s) {
  const shadows = s.boxShadow === 'none' ? [] : s.boxShadow.split(/,(?![^(]*\))/u).filter((x) => !x.includes('inset'))
  const outline =
    s.outlineStyle === 'none' ? 0 : Number.parseFloat(s.outlineWidth) + Math.abs(Number.parseFloat(s.outlineOffset))
  return shadows.reduce((sum, x) => sum + pixelsIn(x), 0) + outline + (s.filter === 'none' ? 0 : 3 * pixelsIn(s.filter))
}

/**
 * Where paint reaches past the boxes on the page (outerReach), by rows of 512 CSS pixels in page coordinates, read once
 * as the page opens. A generated box's reach is taken from its element's box, widened by 32 pixels, since where it is
 * placed is not read. `over` when the page has more such paint than the index holds: every text is then off its ground.
 * @returns {Reach}
 */
/**
 * The box an element's overflow lets its content be drawn in, in page coordinates, or null when it lets it overflow.
 * @param {Element} el
 */
function ownClip(el) {
  const style = getComputedStyle(el)
  if (style.overflowX === 'visible' && style.overflowY === 'visible') return null
  const r = el.getBoundingClientRect()
  const left = r.left + el.clientLeft + window.scrollX
  const top = r.top + el.clientTop + window.scrollY
  return { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight }
}

/**
 * Where two clips overlap, or the one there is.
 * @param {Clip | null} a
 * @param {Clip | null} b
 * @returns {Clip | null}
 */
function meet(a, b) {
  if (!a || !b) return a ?? b
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  }
}

/**
 * Where the content of an element can be drawn, as the overflow of it and its ancestors clips it, or null when nothing
 * clips it. An absolutely positioned box escapes every ancestor up to the positioned one it is placed in, so those do
 * not clip it; any other box that sets where it is placed (a transform, a filter) is not followed, so a box may be
 * taken as drawn where it is not, never the reverse.
 * @param {Element | null} el
 * @param {boolean} escaping whether the content is an absolutely positioned box not yet in its containing block
 * @param {{ plain: Map<Element, Clip | null>, escaping: Map<Element, Clip | null> }} memo
 * @returns {Clip | null}
 */
function clipOf(el, escaping, memo) {
  if (!el) return null
  const known = (escaping ? memo.escaping : memo.plain).get(el)
  if (known !== undefined) return known
  const position = getComputedStyle(el).position
  const clip =
    escaping && position === 'static'
      ? clipOf(el.parentElement, true, memo)
      : meet(ownClip(el), clipOf(el.parentElement, position === 'absolute', memo))
  ;(escaping ? memo.escaping : memo.plain).set(el, clip)
  return clip
}

/**
 * The list a map holds for a key, made when there is none.
 * @template K
 * @param {Map<K, TextBox[]>} map
 * @param {K} key
 * @returns {TextBox[]}
 */
function listOf(map, key) {
  const known = map.get(key)
  if (known) return known
  /** @type {TextBox[]} */
  const list = []
  map.set(key, list)
  return list
}

/**
 * A line box of text as it is drawn, in page coordinates, cut to what overflow lets be drawn of it; null when none is.
 * @param {DOMRect} r
 * @param {Clip | null} clip
 * @param {Element | null} owner
 * @returns {TextBox | null}
 */
function drawnBox(r, clip, owner) {
  const at = { left: r.left + window.scrollX, top: r.top + window.scrollY }
  const box = meet({ ...at, right: at.left + r.width, bottom: at.top + r.height }, clip)
  return box && box.right > box.left && box.bottom > box.top ? { ...box, owner } : null
}

/**
 * The element holding a text a reader can see, the block it sits in, and whether it is that block's own text: a
 * block's citation mark sits in it and beside its text, but is not its text, so never one of its lines. Null for
 * white space and for text that is not visible.
 * @param {Node} node
 * @returns {{ holder: Element, owner: Element | null, own: boolean } | null}
 */
function textHolder(node) {
  const holder = node.parentElement
  if (!holder || (node.textContent ?? '').trim() === '' || getComputedStyle(holder).visibility !== 'visible')
    return null
  const owner = holder.closest('[data-block]')
  const cite = holder.closest('[data-cite]')
  return { holder, owner, own: owner !== null && !(cite && owner.contains(cite)) }
}

/**
 * Every line box of text on the page as it is drawn at the scroll it opens at, by 512px row, and each block's own; a
 * box is cut to what overflow lets be drawn of it (clipOf), and text that is not visible is none. Null past
 * `bound.maxRects` boxes or `bound.until`.
 * @param {{ until: number, maxRects: number }} bound
 * @returns {{ rows: Map<number, TextBox[]>, own: Map<Element, TextBox[]> } | null}
 */
function textBoxes(bound) {
  /** @type {{ rows: Map<number, TextBox[]>, own: Map<Element, TextBox[]> }} */
  const index = { rows: new Map(), own: new Map() }
  /** @type {{ plain: Map<Element, Clip | null>, escaping: Map<Element, Clip | null> }} */
  const memo = { plain: new Map(), escaping: new Map() }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let count = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = textHolder(node)
    if (!text) continue
    const clip = clipOf(text.holder, false, memo)
    range.selectNodeContents(node)
    for (const r of range.getClientRects()) {
      count += 1
      if (count > bound.maxRects || performance.now() > bound.until) return null
      const box = drawnBox(r, clip, text.owner)
      if (!box) continue
      if (text.owner && text.own) listOf(index.own, text.owner).push(box)
      for (let row = Math.floor(box.top / 512); row <= Math.floor(box.bottom / 512); row += 1)
        listOf(index.rows, row).push(box)
    }
  }
  return index
}

/**
 * Whether text outside a block sits on one of its lines within `gap` of the line: the two share at least half the
 * shorter one's height, and nothing a word wide parts them (#117).
 * @param {TextBox} line one of the block's line boxes
 * @param {Map<number, TextBox[]>} rows every text's line boxes, by 512px row
 * @param {number} gap
 */
function besideLine(line, rows, gap) {
  for (let row = Math.floor(line.top / 512); row <= Math.floor(line.bottom / 512); row += 1)
    for (const other of rows.get(row) ?? []) {
      if (other.owner === line.owner) continue
      const shared = Math.min(line.bottom, other.bottom) - Math.max(line.top, other.top)
      const shorter = Math.min(line.bottom - line.top, other.bottom - other.top)
      if (shared >= shorter / 2 && other.right >= line.left - gap && other.left <= line.right + gap) return true
    }
  return false
}

/**
 * The blocks a text outside them sits beside, on one of their lines (BESIDE_EM): a mark, a label, another block or
 * its citation mark, however the page places it (inline, a flex or grid cell, a float, an absolute box). The
 * page's text reads the block whole while a reader sees the two as one (#117). Null when the page's text runs past
 * MAX_TEXT_RECTS line boxes or the time left, and then no block is measured for it.
 * @param {Element[]} blocks
 * @param {{ until: number, maxRects: number, besideEm: number }} bound
 * @returns {Set<Element> | null}
 */
function adjoinedBlocks(blocks, bound) {
  const index = textBoxes(bound)
  if (!index) return null
  return new Set(
    blocks.filter((block) => {
      const gap = Number.parseFloat(getComputedStyle(block).fontSize) * bound.besideEm
      return (index.own.get(block) ?? []).some((line) => besideLine(line, index.rows, gap))
    }),
  )
}

function reachIndex() {
  /** @type {Reach} */
  const index = { rows: new Map(), over: false }
  let entries = 0
  for (const el of document.querySelectorAll('*')) {
    const generated = ['::before', '::after']
      .map((p) => getComputedStyle(el, p))
      .filter((p) => !['none', 'normal'].includes(p.content))
      .map((p) => outerReach(p))
    const reach = Math.max(outerReach(getComputedStyle(el)), ...generated.map((r) => (r > 0 ? r + 32 : 0)))
    if (reach <= 0) continue
    const r = el.getBoundingClientRect()
    const box = { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }
    for (let row = Math.floor((box.y - reach) / 512); row <= Math.floor((box.y + box.height + reach) / 512); row += 1) {
      entries += 1
      if (entries > 50_000) return { rows: new Map(), over: true }
      index.rows.set(row, [...(index.rows.get(row) ?? []), { box, reach }])
    }
  }
  return index
}

/**
 * What an element paints that a text above it is read against, kept per element for the page: its own background
 * (and the box it is clipped to), a border, an inset shadow, any paint of its ::before or ::after, and whether that
 * generated box is set beneath text (a negative z-index or margin), where it hit-tests as the element itself.
 * @param {Element} el
 * @param {Look} look
 */
function paintsOf(el, look) {
  const known = look.paints.get(el)
  if (known) return known
  const style = getComputedStyle(el)
  const drawn = ['::before', '::after']
    .map((p) => getComputedStyle(el, p))
    .filter((p) => !['none', 'normal'].includes(p.content) && paintsAny(p, look.ctx))
  const paints = {
    own: style.backgroundImage !== 'none' || !isClear(look.ctx, style.backgroundColor),
    clip: style.backgroundClip,
    edge: bordersPaint(style, look.ctx),
    inset: style.boxShadow.includes('inset'),
    widths: ['top', 'right', 'bottom', 'left'].map((side) =>
      Number.parseFloat(style.getPropertyValue(`border-${side}-width`)),
    ),
    generated: drawn.length > 0,
    under: drawn.some((p) =>
      [p.zIndex, p.marginTop, p.marginRight, p.marginBottom, p.marginLeft].some((v) => Number.parseFloat(v) < 0),
    ),
  }
  look.paints.set(el, paints)
  return paints
}

/**
 * Where a point (in the viewport) lies against an element's boxes: outside them, on its border, or inside its padding
 * box (inside the border).
 * @param {Element} el
 * @param {number[]} widths its border widths, top, right, bottom, left
 * @param {{ x: number, y: number }} p
 * @returns {'outside' | 'border' | 'padding'}
 */
function placeOf(el, widths, p) {
  const r = [...el.getClientRects()].find((b) => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom)
  if (!r) return 'outside'
  const [top = 0, right = 0, bottom = 0, left = 0] = widths
  const inner = p.x >= r.left + left && p.x <= r.right - right && p.y >= r.top + top && p.y <= r.bottom - bottom
  return inner ? 'padding' : 'border'
}

/**
 * Whether what one element around a text paints beneath a point of it is the background the text's contrast is read
 * against: its background lies under the point, in the box it is clipped to (the root's and the body's fill the
 * canvas), and no border, inset shadow or generated box beneath text of it paints there.
 * @param {Element} a
 * @param {{ x: number, y: number }} p
 * @param {Look} look
 */
function groundAround(a, p, look) {
  const paints = paintsOf(a, look)
  if (paints.under) return false
  if (!paints.own && !paints.edge && !paints.inset) return true
  const at = placeOf(a, paints.widths, p)
  if ((paints.edge && at === 'border') || (paints.inset && at !== 'outside')) return false
  return !paints.own || backgroundUnder(a, paints.clip, at)
}

/**
 * Whether an element's background lies under a point, by where the point is against its boxes (placeOf) and the box
 * its background is clipped to: the root's and the body's fill the canvas, and one clipped to its content or its text
 * is not read.
 * @param {Element} a
 * @param {string} clip its background-clip
 * @param {'outside' | 'border' | 'padding'} at
 */
function backgroundUnder(a, clip, at) {
  if (a === document.body || a === document.documentElement) return true
  if (clip === 'border-box') return at !== 'outside'
  return clip === 'padding-box' && at === 'padding'
}

/**
 * Whether the background beneath a text at a point is the one its contrast is read against (backgroundLayers): every
 * element around the text paints there only the background it is read with (groundAround), nothing else painted lies
 * beneath it (a box, a border, a shadow, generated content), and no paint reaches there from past another box (an
 * outer shadow, an outline, a filter: reachIndex). Text placed outside its painted parent, past its own painted box,
 * over a box beside it or over a border, is over a background its styles do not give (#117).
 * @param {Element} holder
 * @param {Element[]} stack the elements at the point, topmost first (document.elementsFromPoint); the text is on top
 * @param {{ x: number, y: number }} p in the viewport
 * @param {Look} look
 */
function onOwnGround(holder, stack, p, look) {
  if (look.reach.over) return false
  for (let a = /** @type {Element | null} */ (holder); a; a = a.parentElement)
    if (!groundAround(a, p, look)) return false
  // A glyph past its element's box hit-tests as the element, which the list of boxes at the point then leaves out.
  const beneath = stack.slice(stack.indexOf(holder) + 1)
  const painted = (/** @type {Element} */ e) => {
    const paints = paintsOf(e, look)
    return paints.own || paints.edge || paints.inset || paints.generated
  }
  if (!beneath.every((e) => e.contains(holder) || !painted(e))) return false
  const q = { x: p.x + window.scrollX, y: p.y + window.scrollY }
  const within = (/** @type {Box} */ b, /** @type {number} */ d) =>
    q.x >= b.x - d && q.x <= b.x + b.width + d && q.y >= b.y - d && q.y <= b.y + b.height + d
  return (look.reach.rows.get(Math.floor(q.y / 512)) ?? []).every((e) => within(e.box, 0) || !within(e.box, e.reach))
}

/**
 * The cover check along every line of one text (isCovered): 'covered' at the first point something else is on top,
 * 'unmeasured' when the page's budget runs out (of points, or of time), else 'clear' with the points only the protocol
 * can judge added to `probes` (in page coordinates). The text's lines are read once, and a text with MAX_LINES lines
 * or more, or more lines than the budget has points left, is not looked at, line by line or at all (#117).
 * Where a point's background is not the one the text's contrast is read against (onOwnGround), `look.elsewhere` is set.
 * @param {Element} holder the element that holds the text
 * @param {Node} node the text
 * @param {Budget} budget
 * @param {{ x: number, y: number }[]} probes
 * @param {Look} look
 * @returns {'clear' | 'covered' | 'unmeasured'}
 */
function coverAlong(holder, node, budget, probes, look) {
  const range = document.createRange()
  range.selectNodeContents(node)
  const rects = range.getClientRects()
  if (rects.length >= budget.maxLines || rects.length > budget.left) return 'unmeasured'
  const lines = [...rects].map((r) => ({
    x: r.left + window.scrollX,
    y: r.top + window.scrollY,
    width: r.width,
    height: r.height,
  }))
  const suspect = drawsOverText(holder)
  const em = Number.parseFloat(getComputedStyle(holder).fontSize)
  for (const line of lines) {
    if (performance.now() > budget.until) return 'unmeasured'
    for (const p of pointsAlong(lineInView(line), em)) {
      if (!inView(holder, p.x, p.y)) continue
      budget.left -= 1
      if (budget.left < 0) return 'unmeasured'
      const verdict = coverOf(holder, suspect, document.elementFromPoint(p.x, p.y))
      if (verdict === 'covered') return 'covered'
      if (!look.elsewhere) look.elsewhere = !onOwnGround(holder, document.elementsFromPoint(p.x, p.y), p, look)
      if (verdict === 'generated')
        probes.push({ x: Math.round(p.x + window.scrollX), y: Math.round(p.y + window.scrollY) })
    }
  }
  return 'clear'
}

/**
 * Whether anything is drawn over an element's text, looked for along every line of every text in it (#117), every
 * scroll then put back, and whether, at any of those points, the text lies over a background other than the one its
 * contrast is read against (onOwnGround). The points where only the DevTools protocol can tell come back for
 * capture-html to ask.
 * @param {Element} el
 * @param {Budget} budget the points the page may still look at, and until when
 * @param {Omit<Look, 'elsewhere'>} page what the page's elements paint
 * @returns {{ cover: 'clear' | 'covered' | 'unmeasured', probes: { x: number, y: number }[], elsewhere: boolean }}
 */
function isCovered(el, budget, page) {
  const restore = keepScroll(el)
  /** @type {{ x: number, y: number }[]} */
  const probes = []
  const look = { ...page, elsewhere: false }
  try {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const holder = node.parentElement
      if (!holder || !node.textContent?.trim()) continue
      const verdict = coverAlong(holder, node, budget, probes, look)
      if (verdict !== 'clear') return { cover: verdict, probes: [], elsewhere: look.elsewhere }
    }
    return { cover: 'clear', probes, elsewhere: look.elsewhere }
  } finally {
    restore()
  }
}

/**
 * Whether a text outside the blocks is set too small to read in a capture, as rendered (a transform's scale
 * included): a line of it under the readable height, or its glyphs on average closer than the readable advance.
 * Marks that say nothing are not held to it, and a text not rendered is judged by its own element (#117).
 * @param {Element} el
 * @param {{ linePx: number, advancePx: number }} readable
 * @param {RegExp} words a character that is not a mark
 */
function tooSmall(el, readable, words) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? ''
    const range = document.createRange()
    range.selectNodeContents(node)
    const rects = [...range.getClientRects()]
    if (!words.test(text) || rects.length === 0) continue
    const advance = rects.reduce((sum, r) => sum + r.width, 0) / text.replace(/\s+/gu, '').length
    if (rects.some((r) => r.height < readable.linePx) || advance < readable.advancePx) return true
  }
  return false
}

/**
 * A colour as sRGB bytes, by painting it: whatever syntax the page used, the canvas resolves it.
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {string[]} layers bottom first, each painted over the last
 * @param {number} [topAlpha] the opacity the last layer is painted at (the text's effective opacity)
 * @returns {[number, number, number]}
 */
function paint(ctx, layers, topAlpha = 1) {
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1, 1)
  for (const [i, colour] of layers.entries()) {
    ctx.globalAlpha = i === layers.length - 1 ? topAlpha : 1
    ctx.fillStyle = '#ffffff'
    ctx.fillStyle = colour
    ctx.fillRect(0, 0, 1, 1)
  }
  ctx.globalAlpha = 1
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

/**
 * An element's effective opacity: its own and every ancestor's, multiplied.
 * @param {Element} el
 */
function opacityOf(el) {
  let opacity = 1
  for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement)
    opacity *= Number.parseFloat(getComputedStyle(a).opacity || '1')
  return opacity
}

/**
 * The opacity a text is drawn at over what is behind it, or null when that is not one number: opacity fades an element
 * as a group, its own background and its descendants' together, so once a faded element, or one between it and the
 * text, paints a background, the text and that background fade together and no single alpha on the text tells their
 * contrast (#117).
 * @param {Element} el
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @returns {number | null}
 */
function textAlpha(el, ctx) {
  let alpha = 1
  let painted = false
  for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) {
    const style = getComputedStyle(a)
    painted ||= style.backgroundImage !== 'none' || !isClear(ctx, style.backgroundColor)
    const opacity = Number.parseFloat(style.opacity || '1')
    if (opacity < 1 && painted) return null
    alpha *= opacity
  }
  return alpha
}

/**
 * Whether a colour paints nothing: over black and over white it leaves each as it was.
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {string} colour
 */
function isClear(ctx, colour) {
  const [r, g, b] = paint(ctx, ['#000000', colour])
  const [r2, g2, b2] = paint(ctx, ['#ffffff', colour])
  return r + g + b === 0 && r2 + g2 + b2 === 765
}

/**
 * The opacity a text is drawn at, or why its contrast cannot be read from its styles: filtered, stroked, or
 * group_opacity.
 * @param {Element} el
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @returns {number | string}
 */
function drawnAlpha(el, ctx) {
  if (isFiltered(el)) return 'filtered'
  return isStroked(el) ? 'stroked' : (textAlpha(el, ctx) ?? 'group_opacity')
}

/**
 * Whether a text is drawn with a stroke: an outline over each glyph, in a colour of its own, which can bury the fill
 * whose contrast is read (#117). The profile refuses it; this holds a page that has one to an unknown contrast.
 * @param {Element} el
 */
function isStroked(el) {
  return Number.parseFloat(getComputedStyle(el).getPropertyValue('-webkit-text-stroke-width') || '0') > 0
}

/**
 * Whether a filter or a blend mode, on the element or an ancestor, changes the colours it is drawn in: the contrast
 * read from its styles would not be the contrast a reader sees (#117).
 * @param {Element} el
 */
function isFiltered(el) {
  for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) {
    const style = getComputedStyle(a)
    if (style.filter !== 'none' || style.mixBlendMode !== 'normal' || (style.backdropFilter || 'none') !== 'none')
      return true
  }
  return false
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
 * The least a 2D transform scales a length by (its smaller singular value): a rotation or a skew draws a glyph no
 * larger than that.
 * @param {DOMMatrixReadOnly} m
 */
function leastScale(m) {
  const sum = m.a ** 2 + m.b ** 2 + m.c ** 2 + m.d ** 2
  const det = m.a * m.d - m.b * m.c
  return Math.sqrt(Math.max(0, (sum - Math.sqrt(Math.max(0, sum ** 2 - 4 * det ** 2))) / 2))
}

/**
 * How large an element's text is drawn against its computed font size: its zoom, and the transforms and scales on it
 * and every ancestor, each by the least it scales a glyph. Null when the styles do not tell one number: a 3D transform,
 * rotation or translation, or font-size-adjust, which draws glyphs at a size of the font's own (#117).
 * @param {Element} el
 * @returns {number | null}
 */
function drawnScale(el) {
  if (getComputedStyle(el).fontSizeAdjust !== 'none') return null
  let scale = el.currentCSSZoom
  for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) {
    const style = getComputedStyle(a)
    const m = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform)
    const deep = !m.is2D || /\s/u.test(style.rotate) || style.translate.split(' ').length > 2
    if (deep) return null
    const [x = 1, y = x] = style.scale === 'none' ? [] : style.scale.split(' ').map(Number)
    scale *= leastScale(m) * Math.min(Math.abs(x), Math.abs(y))
  }
  return scale
}

/**
 * Whether an element's text is large (WCAG 2), by the size it is drawn at (drawnScale): 24px, or 18.66px and bold. Text
 * whose drawn size the styles do not tell is not large.
 * @param {Element} el
 * @param {CSSStyleDeclaration} style its computed style
 */
function isLarge(el, style) {
  const px = Number.parseFloat(style.fontSize) * (drawnScale(el) ?? 0)
  return px >= 24 || (px >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700)
}

/**
 * The block's text contrast against what is behind it (WCAG 2): the worst case over the stops of any gradient behind
 * it, against the floor for the size its text is drawn at (3 for large text, 4.5 otherwise): a heading set large and
 * scaled or zoomed down is held to the floor of the size a capture shows, and one whose drawn size the styles do not
 * tell to the higher floor (#117). The text is painted in the colour it is filled with, at the opacity it is drawn at
 * (#117). Unknown when the background cannot be read, a filter or blend mode changes the colours, a stroke outlines
 * the glyphs (#117), or opacity fades a background together with the text (group_opacity).
 * @param {Element} el
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @returns {Contrast}
 */
function contrastOf(el, ctx) {
  const style = getComputedStyle(el)
  const large = isLarge(el, style)
  const floor = large ? 3 : 4.5
  const opacity = drawnAlpha(el, ctx)
  if (typeof opacity === 'string') return { ratio: null, floor, large, detail: opacity }
  const layers = backgroundLayers(el)
  const behind = layers ? combinations(layers, 64) : null
  if (!behind) return { ratio: null, floor, large, detail: layers ? 'background_too_complex' : 'background_image' }
  const fill = style.getPropertyValue('-webkit-text-fill-color') || style.color
  let worst = Number.POSITIVE_INFINITY
  for (const under of behind) {
    const [hi = 0, lo = 0] = [luminance(paint(ctx, [...under, fill], opacity)), luminance(paint(ctx, under))].toSorted(
      (a, b) => b - a,
    )
    worst = Math.min(worst, (hi + 0.05) / (lo + 0.05))
  }
  return { ratio: Math.round(worst * 100) / 100, floor, large, detail: null }
}

/**
 * The elements inside a block that hold text of their own: an emphasis, a link, a citation mark, a span. Each is a
 * run of the block's text, and is held to what the block is (#117).
 * @param {Element} el the block
 * @returns {Element[]}
 */
function blockRuns(el) {
  return [...el.querySelectorAll('*')].filter((inner) =>
    [...inner.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''),
  )
}

/**
 * Why one run of a block's text cannot be seen, by its text as rendered: not rendered, hidden, transparent, too small
 * to draw, clipped, pushed off the page, cut by its own overflow or by a box around it (#117). What the block shows of
 * its own text does not show a run's: `<p>Visible <span hidden>critical text</span></p>` measures whole as one block.
 * @param {Element} run
 * @param {Box} page
 * @returns {string[]}
 */
function runIssues(run, page) {
  const text = document.createRange()
  text.selectNodeContents(run)
  if (text.getClientRects().length === 0) return ['not_rendered']
  const style = getComputedStyle(run)
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return ['hidden']
  if (opacityOf(run) < 0.1) return ['transparent']
  const t = text.getBoundingClientRect()
  if (t.width < 2 || t.height < 2 || Number.parseFloat(style.fontSize) < 1) return ['no_visible_text']
  const box = { x: t.x + window.scrollX, y: t.y + window.scrollY, width: t.width, height: t.height }
  return [...concealedIssues(run), ...placementIssues(run, box, page)]
}

/**
 * How far a contrast is above its floor, as a ratio of the two; an unknown one is last.
 * @param {Contrast} c
 */
function contrastMargin(c) {
  return c.ratio === null ? Number.POSITIVE_INFINITY : c.ratio / c.floor
}

/**
 * The contrast a block is held to, its own text's or a run's: the one lowest against its floor when any is low, else
 * an unknown one (an unknown contrast is never passed), else the lowest.
 * @param {Contrast} own
 * @param {Contrast[]} runs
 * @returns {Contrast}
 */
function worstContrast(own, runs) {
  const all = [own, ...runs].toSorted((a, b) => contrastMargin(a) - contrastMargin(b))
  const low = all.find((c) => c.ratio !== null && c.ratio < c.floor)
  return low ?? all.find((c) => c.ratio === null) ?? all[0] ?? own
}

/**
 * A block's measure with its runs' (blockRuns): each run's issues, and the worst contrast of the runs it shows. At most
 * `runs.left` runs across the page are measured; the rest are counted in `runs.over`, and fail the target unmeasured.
 * @param {ProbedMeasure} measure the block's own
 * @param {Element} el
 * @param {{ page: Box, ctx: OffscreenCanvasRenderingContext2D, runs: { left: number, over: number } }} at
 * @returns {ProbedMeasure}
 */
function withRuns(measure, el, at) {
  const all = blockRuns(el)
  const looked = all.slice(0, Math.max(0, at.runs.left))
  at.runs.left -= looked.length
  at.runs.over += all.length - looked.length
  const judged = looked.map((run) => ({ run, issues: runIssues(run, at.page) }))
  const shown = judged.filter((j) => j.issues.every((i) => i === 'scrolls'))
  const contrast = worstContrast(
    measure.contrast,
    shown.map((j) => contrastOf(j.run, at.ctx)),
  )
  const low = contrast.ratio !== null && contrast.ratio < contrast.floor ? ['low_contrast'] : []
  const issues = [...new Set([...measure.issues, ...judged.flatMap((j) => j.issues), ...low])].slice(0, 10)
  return { ...measure, issues, contrast, probes: issues.every((i) => i === 'low_contrast') ? measure.probes : [] }
}

/**
 * One block's measures. A contrast below its floor is an issue; an unknown contrast is not, and says so.
 * @param {Element} el
 * @param {Box} page
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {Budget} budget the points the cover check may still look at, across the page, and until when
 * @returns {ProbedMeasure}
 */
function measureBlock(el, page, ctx, budget) {
  const box = boxOf(el)
  const hidden = hiddenIssues(el)
  const issues = hidden.length > 0 ? hidden : placementIssues(el, box, page)
  const looked = hidden.length === 0 && !issues.includes('off_page')
  const { cover, probes, elsewhere } = looked
    ? isCovered(el, budget, { ctx, paints: budget.paints, reach: budget.reach })
    : { cover: 'clear', probes: [], elsewhere: false }
  // Over a background its styles do not give, a text's contrast is not known (#117).
  const read = contrastOf(el, ctx)
  const contrast = elsewhere ? { ...read, ratio: null, detail: 'background_elsewhere' } : read
  if (contrast.ratio !== null && contrast.ratio < contrast.floor) issues.push('low_contrast')
  if (cover === 'covered') issues.push('covered')
  return {
    id: el.getAttribute('data-block') ?? '',
    section: el.closest('[data-section]')?.getAttribute('data-section') ?? null,
    box,
    fontPx: Math.round(Number.parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
    issues,
    contrast,
    probes: issues.every((i) => i === 'low_contrast') ? probes : [],
    unsampled: cover === 'unmeasured',
  }
}

/**
 * Everything the kernel measures at the current viewport. Checking cover scrolls, and puts every scroll back (keepScroll),
 * so each element is placed, and the page captured, as it starts; the view ends at the top, where the captures begin.
 * @param {{ maxListed: number, maxMeasured: number, marks: string, maxPoints: number, maxLookMs: number,
 *   maxLines: number, readable: { linePx: number, advancePx: number }, maxTextRects: number, besideEm: number }} opts
 * @returns {PageAnswer}
 */
function measurePage(opts) {
  const root = document.documentElement
  const page = { x: 0, y: 0, width: root.scrollWidth, height: root.scrollHeight }
  const ctx = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2D canvas to resolve colours')
  const budget = {
    left: opts.maxPoints,
    until: performance.now() + opts.maxLookMs,
    maxLines: opts.maxLines,
    paints: new Map(),
    reach: reachIndex(),
  }
  const words = new RegExp(`[^\\s${opts.marks}]`, 'u')
  const strictly = (/** @type {{ el: Element, id: string }} */ { el, id }) => {
    const measure = measureBlock(el, page, ctx, budget)
    const concealed = [...concealedIssues(el), ...(tooSmall(el, opts.readable, words) ? ['no_visible_text'] : [])]
    return { ...measure, id: id.slice(0, 200), issues: [...new Set([...concealed, ...measure.issues])].slice(0, 10) }
  }
  // A block is held to what a label is, and so is each run of its text in an element inside it (#117); and no other
  // text sits beside one on its lines, read as the page opens, before any scroll (#117).
  const runs = { left: opts.maxMeasured, over: 0 }
  const elements = [...document.querySelectorAll('[data-block]')]
  const beside = adjoinedBlocks(elements, { until: budget.until, maxRects: opts.maxTextRects, besideEm: opts.besideEm })
  const blocks = elements.map((el) => {
    const m = withRuns(strictly({ el, id: el.getAttribute('data-block') ?? '' }), el, { page, ctx, runs })
    if (beside === null) return { ...m, unsampled: true }
    return beside.has(el) ? { ...m, issues: [...new Set([...m.issues, 'adjoined'])].slice(0, 10) } : m
  })
  const labels = shownElements()
  const texts = framingElements(opts.marks)
  const shown = labels.slice(0, opts.maxMeasured).map(strictly)
  const framing = texts.slice(0, opts.maxMeasured).map(strictly)
  window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
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
    unmeasured: labels.length - shown.length + texts.length - framing.length + runs.over,
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
  ownClip,
  meet,
  clipOf,
  listOf,
  drawnBox,
  textHolder,
  textBoxes,
  besideLine,
  adjoinedBlocks,
  boxOf,
  nameOf,
  overflowingElements,
  hiddenIssues,
  concealedIssues,
  inside,
  hides,
  cutsOwnText,
  placementIssues,
  keepScroll,
  besideText,
  drawsOverText,
  coverOf,
  bordersPaint,
  paintsAny,
  pixelsIn,
  outerReach,
  reachIndex,
  paintsOf,
  placeOf,
  groundAround,
  backgroundUnder,
  onOwnGround,
  inView,
  lineInView,
  pointsAlong,
  coverAlong,
  isCovered,
  tooSmall,
  paint,
  opacityOf,
  textAlpha,
  isClear,
  drawnAlpha,
  isFiltered,
  isStroked,
  luminance,
  gradientStops,
  backgroundLayers,
  combinations,
  leastScale,
  drawnScale,
  isLarge,
  contrastOf,
  blockRuns,
  runIssues,
  contrastMargin,
  worstContrast,
  withRuns,
  measureBlock,
  measurePage,
  shownElements,
  framingElements,
]

/**
 * An expression that measures the page with these options, the receipt's bound and the marks, and returns the measure.
 * The look budget is the kernel's own, or less where a sweep has less time left (capture-html.mjs).
 * @param {{ maxListed: number, maxLookMs?: number }} opts
 */
export function pageScript(opts) {
  const all = {
    ...opts,
    maxMeasured: MAX_MEASURED,
    marks: MARK_CLASS,
    maxPoints: MAX_POINTS,
    maxLookMs: Math.min(opts.maxLookMs ?? MAX_LOOK_MS, MAX_LOOK_MS),
    maxLines: MAX_LINES,
    readable: READABLE,
    maxTextRects: MAX_TEXT_RECTS,
    besideEm: BESIDE_EM,
  }
  return `(() => {\n${IN_PAGE.map((f) => f.toString()).join('\n')}\nreturn measurePage(${JSON.stringify(all)})\n})()`
}

/**
 * Every media condition the page's stylesheets hold, as the browser reads them: the widths where its rules can change
 * (#117, CX-0039). A container's query is named apart, since a container's width is not the window's, and so is a
 * stylesheet whose rules cannot be read.
 * @returns {{ conditions: string[], unreadable: string[] }}
 */
function mediaConditions() {
  /** @type {Set<string>} */
  const conditions = new Set()
  /** @type {string[]} */
  const unreadable = []
  /** @param {CSSRuleList} rules */
  const visit = (rules) => {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) conditions.add(rule.media.mediaText)
      if (rule instanceof CSSContainerRule) unreadable.push(`@container ${rule.conditionText}`)
      if (rule instanceof CSSImportRule && rule.media.mediaText) conditions.add(rule.media.mediaText)
      if ('cssRules' in rule && rule.cssRules instanceof CSSRuleList) visit(rule.cssRules)
    }
  }
  for (const sheet of document.styleSheets) {
    if (sheet.media.mediaText) conditions.add(sheet.media.mediaText)
    try {
      visit(sheet.cssRules)
    } catch {
      unreadable.push('a stylesheet whose rules cannot be read')
    }
  }
  return { conditions: [...conditions], unreadable }
}

/** An expression that returns the page's media conditions (mediaConditions). */
export function conditionsScript() {
  return `(() => {\n${mediaConditions.toString()}\nreturn mediaConditions()\n})()`
}
