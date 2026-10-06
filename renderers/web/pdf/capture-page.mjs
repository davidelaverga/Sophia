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
 * @typedef {{ own: boolean, clip: string, edge: boolean, inset: boolean, widths: number[], rounded: boolean,
 *   generated: string[] }} Paints what an element paints that a text above it is read against (paintsOf), whether its
 *   corners are rounded, and which of its generated boxes paint
 * @typedef {{ box: Box, reach: number, colours: string[] | null, el: Element, pseudo: string }} Reached paint that
 *   reaches past a box, how far, the colours it may paint there (null when they cannot be read), and the element (and
 *   its generated box, or '') that paints it
 * @typedef {{ rows: Map<number, Reached[]>, over: boolean }} Reach where paint reaches past the boxes on the page
 *   (reachIndex)
 * @typedef {{ pseudo: string, box: Box, pieces: number }} PlacedBox a generated box (::before or ::after), where it
 *   lies in page coordinates, and in how many boxes it is drawn
 *   coordinates (generatedIndex)
 * @typedef {{ colours: string[], group: string, fade: number }} Layer one layer of paint beneath a text: the colours it
 *   may paint at a point (`transparent` among them where it may not reach it), and the opacity group it is drawn in
 *   ('' for none) at that group's opacity (groupOf)
 * @typedef {{ base: boolean, layers: Map<string, Layer[]>, unread: boolean }} Ground what lies beneath one element's
 *   text at the points looked at (noteGround): whether at some it is the background the element's contrast is read
 *   against (backgroundLayers); at others, other paint, each reading once, as layers bottom first (groundAt); and
 *   whether at any it could not be read
 * @typedef {{ left: number, until: number, maxLines: number, paints: Map<Element, Paints>, reach: Reach,
 *   upright: Map<Element, boolean>, generated: Map<Element, PlacedBox[]> | null, grounds: Map<Element, Ground>,
 *   maxGrounds: number, ids: Map<Element, number> }} Budget the points the cover check may still look at, the time (performance.now) it must stop
 *   by, the fewest lines a text may have to be refused unread, what each element looked at paints, where paint reaches
 *   past the boxes, which elements are drawn along the page's lines (isUpright), where generated boxes lie, what lies
 *   beneath each text looked at, the most readings of it kept for one element, and a number for each element that
 *   names an opacity group (idOf)
 * @typedef {{ left: number, top: number, right: number, bottom: number }} Clip where overflow lets content be drawn
 * @typedef {Clip & { owner: Element | null }} TextBox a line box of
 *   text on the page, and the block it sits in (null outside every block)
 * @typedef {Pick<Budget, 'paints' | 'reach' | 'generated' | 'grounds' | 'maxGrounds' | 'ids'> &
 *   { ctx: OffscreenCanvasRenderingContext2D }} Look what the cover check reads what lies beneath a text with
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
 * The most readings of what lies beneath one element's text the measure keeps (noteGround): its own background, or
 * other paint, read point by point, each reading once. Past it, what lies beneath is unread and its contrast unknown.
 */
export const MAX_GROUNDS = 16

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
 * ancestor, or its own text pushed off the page, in part or whole (a negative text indent, a transform): no scroll
 * reaches what lies left of or above the page, so a sliver left on it is not the text (#117). Past its right edge is
 * overflow (or a scrolling box's, judged by where it sits).
 * @param {Element} el
 * @returns {string[]}
 */
function concealedIssues(el) {
  for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) {
    const style = getComputedStyle(a)
    if ((style.clipPath && style.clipPath !== 'none') || (style.clip && style.clip !== 'auto')) return ['clipped']
  }
  return ownTextOffPage(el) ? ['off_page'] : []
}

/**
 * Whether an element's own text lies left of or above the page, in part or whole. An element inside it that holds text
 * is judged as its own run, label or text.
 * @param {Element} el
 */
function ownTextOffPage(el) {
  const text = document.createRange()
  for (const node of el.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE || !(node.textContent ?? '').trim()) continue
    text.selectNodeContents(node)
    if (text.getClientRects().length === 0) continue
    const t = text.getBoundingClientRect()
    if (t.left + window.scrollX < -1 || t.top + window.scrollY < -1) return true
  }
  return false
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
 * Whether a point is in the window. A point on a text that no box around it clips, and that no scroll of the window
 * brings into it, lies off the page: the cover check does not pass over it (#117).
 * @param {{ x: number, y: number }} p in viewport coordinates
 */
function inWindow(p) {
  return p.x >= 0 && p.y >= 0 && p.x < window.innerWidth && p.y < window.innerHeight
}

/**
 * Whether a style turns what it draws off the page's lines: a rotation or a skew, a 3D transform, a motion path that
 * can turn it, or a scale that mirrors it.
 * @param {CSSStyleDeclaration} s
 */
function turns(s) {
  const m = new DOMMatrixReadOnly(s.transform === 'none' ? undefined : s.transform)
  const [x = 1, y = x] = s.scale === 'none' ? [] : s.scale.split(' ').map(Number)
  const rotated = s.rotate !== 'none' && Number.parseFloat(s.rotate) % 360 !== 0
  const skewed = Math.abs(m.b) > 1e-9 || Math.abs(m.c) > 1e-9
  return !m.is2D || skewed || rotated || Math.min(m.a, m.d, x, y) < 0 || (s.offsetPath || 'none') !== 'none'
}

/**
 * Whether an element's text is drawn along the page's lines: set horizontally, and neither it nor any box around it
 * turned or mirrored (turns). The cover check looks along a line's width, at its middle, and the check for what sits
 * beside a block looks past its lines' ends: a text set vertically or turned would be looked at across its lines, so
 * one is not looked at, and fails unmeasured (#117). Kept per element, so each ancestor is read once a page.
 * @param {Element} el
 * @param {Map<Element, boolean>} memo
 */
function isUpright(el, memo) {
  /** @type {Element[]} */
  const chain = []
  let a = /** @type {Element | null} */ (el)
  for (; a && !memo.has(a); a = a.parentElement) chain.push(a)
  let upright = a ? (memo.get(a) ?? false) : true
  for (const e of chain.toReversed()) {
    const style = getComputedStyle(e)
    upright = upright && style.writingMode === 'horizontal-tb' && !turns(style)
    memo.set(e, upright)
  }
  return upright
}

/**
 * Points along a line of text where the cover check looks: through its middle, an em apart at most, however long the
 * line. A cap on points per line would widen the gaps on a long one, where a box could cover a glyph between two
 * points (#117). Null when the line needs more points than the page has left, or its time is up: the text is then
 * unmeasured, never looked at more sparsely.
 * @param {Box} rect in viewport coordinates
 * @param {number} em
 * @param {Budget} budget
 * @returns {{ x: number, y: number }[] | null}
 */
function pointsAlong(rect, em, budget) {
  const n = Math.max(1, Math.ceil(rect.width / Math.max(em, 4)))
  if (n > budget.left || performance.now() > budget.until) return null
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
 * Whether a style paints anything of its own: a background, a border or a border image, a shadow or an outline.
 * @param {CSSStyleDeclaration} s
 * @param {OffscreenCanvasRenderingContext2D} ctx
 */
function paintsAny(s, ctx) {
  return (
    s.backgroundImage !== 'none' ||
    !isClear(ctx, s.backgroundColor) ||
    bordersPaint(s, ctx) ||
    s.boxShadow !== 'none' ||
    s.outlineStyle !== 'none' ||
    s.borderImageSource !== 'none'
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
 * How far a border image is drawn past its element's border box: its outset, in pixels or in border widths (#117).
 * @param {CSSStyleDeclaration} s
 */
function imageOutset(s) {
  if (s.borderImageSource === 'none') return 0
  const widest = Math.max(
    ...['top', 'right', 'bottom', 'left'].map(
      (side) => Number.parseFloat(s.getPropertyValue(`border-${side}-width`)) || 0,
    ),
  )
  return Math.max(
    0,
    ...s.borderImageOutset
      .split(/\s+/u)
      .map((v) => (v.endsWith('px') ? Number.parseFloat(v) : Number.parseFloat(v) * widest) || 0),
  )
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
  return (
    shadows.reduce((sum, x) => sum + pixelsIn(x), 0) +
    outline +
    (s.filter === 'none' ? 0 : 3 * pixelsIn(s.filter)) +
    imageOutset(s)
  )
}

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

/**
 * The page's generated boxes by the element that draws each, in page coordinates, as the protocol's snapshot gave them
 * (placement.mjs generatedOf). A generated box hit-tests as its element, so only the snapshot tells where one lies
 * (#117). Null when none were given, or the page's elements are not the snapshot's.
 * @param {{ elements: number, boxes: { at: number, tag: string, pseudo: string, box: number[], pieces: number }[] } | null} [given]
 * @returns {Map<Element, PlacedBox[]> | null}
 */
function generatedIndex(given) {
  if (!given) return null
  const all = document.querySelectorAll('*')
  if (all.length !== given.elements) return null
  /** @type {Map<Element, PlacedBox[]>} */
  const out = new Map()
  for (const { at, tag, pseudo, box, pieces } of given.boxes) {
    const el = all[at]
    if (el?.tagName !== tag) return null
    const [left = 0, top = 0, right = 0, bottom = 0] = box
    const placed = { pseudo, box: { x: left, y: top, width: right - left, height: bottom - top }, pieces }
    out.set(el, [...(out.get(el) ?? []), placed])
  }
  return out
}

/**
 * Whether a point given in the viewport lies in a box, in page coordinates, or within `d` pixels of it.
 * @param {Box} b
 * @param {{ x: number, y: number }} p
 * @param {number} [d]
 */
function pointIn(b, p, d = 0) {
  const x = p.x + window.scrollX
  const y = p.y + window.scrollY
  return x >= b.x - d && x <= b.x + b.width + d && y >= b.y - d && y <= b.y + b.height + d
}

/**
 * Where paint reaches past the boxes on the page (reachOf), by rows of 512 CSS pixels in page coordinates, read once
 * as the page opens. `over` when the page has more such paint than the index holds: what lies beneath every text is
 * then unread.
 * @param {Map<Element, PlacedBox[]> | null} generated where generated boxes lie (generatedIndex)
 * @returns {Reach}
 */
function reachIndex(generated) {
  /** @type {Reach} */
  const index = { rows: new Map(), over: false }
  let entries = 0
  for (const el of document.querySelectorAll('*'))
    for (const entry of reachOf(el, generated)) {
      const first = Math.floor((entry.box.y - entry.reach) / 512)
      const last = Math.floor((entry.box.y + entry.box.height + entry.reach) / 512)
      entries += last - first + 1
      if (entries > 50_000) return { rows: new Map(), over: true }
      for (let row = first; row <= last; row += 1) index.rows.set(row, [...(index.rows.get(row) ?? []), entry])
    }
  return index
}

/**
 * The paint an element, and each of its generated boxes, reaches past its box with (outerReach), and the colours it may
 * paint there (outerColours). A generated box's reach is taken from its own box where the protocol gave it
 * (generatedIndex), else from its element's box, widened by 32 pixels.
 * @param {Element} el
 * @param {Map<Element, PlacedBox[]> | null} generated
 * @returns {Reached[]}
 */
function reachOf(el, generated) {
  const own = () => {
    const r = el.getBoundingClientRect()
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }
  }
  const style = getComputedStyle(el)
  const reach = outerReach(style)
  /** @type {Reached[]} */
  const out = reach > 0 ? [{ box: own(), reach, colours: outerColours(style), el, pseudo: '' }] : []
  for (const pseudo of ['::before', '::after']) {
    const s = getComputedStyle(el, pseudo)
    const far = ['none', 'normal'].includes(s.content) ? 0 : outerReach(s)
    if (far <= 0) continue
    const boxes = generated
      ? (generated.get(el) ?? []).filter((g) => g.pseudo === pseudo).map((g) => ({ box: g.box, reach: far }))
      : [{ box: own(), reach: far + 32 }]
    for (const placed of boxes) out.push({ ...placed, colours: outerColours(s), el, pseudo })
  }
  return out
}

/**
 * What an element paints that a text above it is read against, kept per element for the page: its own background
 * (and the box it is clipped to), a border, an inset shadow, whether its corners are rounded, and which of its
 * ::before and ::after paint anything.
 * @param {Element} el
 * @param {Look} look
 */
function paintsOf(el, look) {
  const known = look.paints.get(el)
  if (known) return known
  const style = getComputedStyle(el)
  const paints = {
    own: style.backgroundImage !== 'none' || !isClear(look.ctx, style.backgroundColor),
    clip: style.backgroundClip,
    edge: bordersPaint(style, look.ctx),
    // A border image paints where its own widths say, into the padding box too (border-image-width), and an outline
    // drawn inward paints over the box's own content, so like an inset shadow each is paint anywhere in the box that is
    // not the background a text is read against (#117, SDD-CX42).
    inset:
      style.boxShadow.includes('inset') ||
      style.borderImageSource !== 'none' ||
      (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineOffset) < 0),
    widths: ['top', 'right', 'bottom', 'left'].map((side) =>
      Number.parseFloat(style.getPropertyValue(`border-${side}-width`)),
    ),
    rounded: ['top-left', 'top-right', 'bottom-right', 'bottom-left'].some(
      (corner) => Number.parseFloat(style.getPropertyValue(`border-${corner}-radius`)) > 0,
    ),
    generated: ['::before', '::after'].filter((p) => {
      const s = getComputedStyle(el, p)
      return !['none', 'normal'].includes(s.content) && s.visibility === 'visible' && paintsAny(s, look.ctx)
    }),
  }
  look.paints.set(el, paints)
  return paints
}

/**
 * The one of an element's boxes (its client rects, in the viewport) that holds a point, or null.
 * @param {Element} el
 * @param {{ x: number, y: number }} p in the viewport
 */
function rectAt(el, p) {
  return (
    [...el.getClientRects()].find((b) => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom) ?? null
  )
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
  const r = rectAt(el, p)
  if (!r) return 'outside'
  const [top = 0, right = 0, bottom = 0, left = 0] = widths
  const inner = p.x >= r.left + left && p.x <= r.right - right && p.y >= r.top + top && p.y <= r.bottom - bottom
  return inner ? 'padding' : 'border'
}

/**
 * The generated boxes of an element that paint and lie under a point, where the protocol gave them (generatedIndex);
 * null when the element draws one and they were not given (#117).
 * @param {Element} a
 * @param {{ x: number, y: number }} p in the viewport
 * @param {Look} look
 * @returns {PlacedBox[] | null}
 */
function generatedHere(a, p, look) {
  const drawn = paintsOf(a, look).generated
  if (drawn.length === 0) return []
  if (!look.generated) return null
  return (look.generated.get(a) ?? []).filter((g) => drawn.includes(g.pseudo) && pointIn(g.box, p))
}

/**
 * Whether what one element around a text paints beneath a point of it is the background the text's contrast is read
 * against: its background lies under the point, in the box it is clipped to (the root's and the body's fill the
 * canvas) and inside its rounded corners' curve, and no border, inset shadow or generated box of it paints there.
 * @param {Element} a
 * @param {{ x: number, y: number }} p
 * @param {Look} look
 */
function groundAround(a, p, look) {
  const paints = paintsOf(a, look)
  if (generatedHere(a, p, look)?.length !== 0) return false
  if (!paints.own && !paints.edge && !paints.inset) return true
  const at = placeOf(a, paints.widths, p)
  return plainAt(a, paints, at, p) && (!paints.own || backgroundUnder(a, paints.clip, at))
}

/**
 * Whether an element paints at a point of its box nothing but its background: off its border, where it paints one, with
 * no inset paint, and inside its rounded corners' curve (shapeAt), clear of a corner where it paints a border, whose
 * inner curve may reach the point. Outside its boxes it paints nothing there.
 * @param {Element} a
 * @param {Paints} paints
 * @param {'outside' | 'border' | 'padding'} at
 * @param {{ x: number, y: number }} p in the viewport
 */
function plainAt(a, paints, at, p) {
  if (at === 'outside') return true
  if (paints.inset || (paints.edge && at === 'border')) return false
  const shape = shapeAt(a, getComputedStyle(a), paints, p)
  return shape === 'inside' || (shape === 'corner' && !paints.edge)
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
 * outer shadow, an outline: reachIndex). Elsewhere what lies beneath is read point by point (groundAt).
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
    return paints.own || paints.edge || paints.inset || paints.generated.length > 0
  }
  if (!beneath.every((e) => e.contains(holder) || !painted(e))) return false
  const rows = look.reach.rows.get(Math.floor((p.y + window.scrollY) / 512)) ?? []
  return rows.every((e) => pointIn(e.box, p) || !pointIn(e.box, p, e.reach))
}

/**
 * A computed list's items, split at its commas outside parentheses.
 * @param {string} value
 */
function listItems(value) {
  /** @type {string[]} */
  const items = ['']
  let depth = 0
  for (const ch of value) {
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0
    if (ch === ',' && depth === 0) items.push('')
    else items[items.length - 1] += ch
  }
  return items.map((item) => item.trim())
}

/**
 * The colour space, and for a polar one the hue path, a gradient mixes its stops in, as `color-mix()` names it: the one
 * its computed value names after its direction (`90deg in hsl longer hue`), or else sRGB when every stop is a legacy
 * colour (the computed value writes those `rgb()`) and Oklab otherwise, as CSS Images 4 has it (#117).
 * @param {string} image a gradient, as the computed style writes it
 * @param {string[]} stops its stops' colours (gradientStops)
 */
function interpolationOf(image, stops) {
  const head = listItems(image.slice(image.indexOf('(') + 1, image.lastIndexOf(')')))[0] ?? ''
  const named = /(?:^|\s)in\s+([a-z][a-z0-9-]*(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?)/i.exec(head)
  if (named?.[1]) return named[1].toLowerCase()
  return stops.every((stop) => /^(?:rgba?\(|#)/i.test(stop)) ? 'srgb' : 'oklab'
}

/**
 * A gradient's colours: each stop, and the colours between each two (pathOf), mixed as the browser mixes them, in the
 * space and along the hue path the gradient names (interpolationOf), with their alpha (#117). A polar space's hue can
 * sweep the whole circle: `in hsl longer hue` from red to blue passes yellow, green and cyan, which sRGB mixing never
 * reaches. Between two stops a gradient passes every shade between theirs: grey text between a black and a white stop
 * is read against both, and passes, though the gradient crosses its own shade; a colour within a fifth of the way from
 * that crossing (a sixteenth in a polar space) is read against it instead, below 1.5:1. Null when the canvas cannot mix
 * in that space: the background is then not read.
 * @param {string[]} stops
 * @param {string} method
 * @returns {string[] | null}
 */
function gradientColours(stops, method) {
  const c = stops.length > 1 ? new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true }) : null
  if (!c) return stops
  /** @type {Set<string>} */
  const out = new Set()
  for (const [i, stop] of stops.entries()) {
    const before = stops[i - 1]
    const between = before === undefined ? [] : pathOf(c, method, before, stop)
    if (!between) return null
    for (const colour of between) out.add(colour)
    out.add(stop)
  }
  return [...out]
}

/**
 * The colours a gradient paints between two stops: evenly spaced (four in a space of three axes, fifteen in a polar
 * one), and the lightest or darkest colour near each that is lighter or darker than both its neighbours, found within
 * them (extremeNear): a polar path peaks between samples (yellow on an HSL path, a clipped channel on an OKLCH one),
 * and so does a path in sRGB (red to lime darkens midway). Null when the canvas cannot mix in `method`.
 * @param {OffscreenCanvasRenderingContext2D} c
 * @param {string} method
 * @param {string} from
 * @param {string} to
 * @returns {string[] | null}
 */
function pathOf(c, method, from, to) {
  const steps = /^(?:hsl|hwb|lch|oklch)\b/.test(method) ? 16 : 5
  const ts = Array.from({ length: steps + 1 }, (_, k) => k / steps)
  const colours = ts.map((t) => (t === 0 ? from : t === 1 ? to : mixOf(c, method, from, to, t)))
  if (colours.includes(null)) return null
  const ys = colours.map((colour) => yOf(c, colour ?? 'transparent'))
  /** @type {string[]} */
  const out = []
  for (let k = 1; k < steps; k += 1) {
    out.push(colours[k] ?? 'transparent')
    const [y0, y, y1] = [ys[k - 1] ?? 0, ys[k] ?? 0, ys[k + 1] ?? 0]
    if ((y > y0 && y >= y1) || (y < y0 && y <= y1)) {
      const extreme = extremeNear(c, method, from, to, [ts[k - 1] ?? 0, ts[k + 1] ?? 1], y > y0)
      if (extreme === null) return null
      out.push(extreme)
    }
  }
  return out
}

/**
 * The lightest (or, not `peak`, the darkest) colour a gradient paints between two stops within `[lo, hi]`, found by
 * narrowing the span by a third twelve times, to within a five-hundredth of it. Null when the canvas cannot mix.
 * @param {OffscreenCanvasRenderingContext2D} c
 * @param {string} method
 * @param {string} from
 * @param {string} to
 * @param {[number, number]} span
 * @param {boolean} peak
 * @returns {string | null}
 */
function extremeNear(c, method, from, to, span, peak) {
  let [lo, hi] = span
  for (let i = 0; i < 12; i += 1) {
    const [a, b] = [mixOf(c, method, from, to, lo + (hi - lo) / 3), mixOf(c, method, from, to, hi - (hi - lo) / 3)]
    if (a === null || b === null) return null
    if (yOf(c, a) < yOf(c, b) === peak) lo += (hi - lo) / 3
    else hi -= (hi - lo) / 3
  }
  return mixOf(c, method, from, to, (lo + hi) / 2)
}

/**
 * The luminance of a colour painted alone, its alpha set aside: what orders the colours of one gradient.
 * @param {OffscreenCanvasRenderingContext2D} c
 * @param {string} colour
 */
function yOf(c, colour) {
  c.clearRect(0, 0, 1, 1)
  c.fillStyle = colour
  c.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = c.getImageData(0, 0, 1, 1).data
  return luminance([r, g, b])
}

/**
 * The colour a gradient paints `t` of the way from one stop to the next, mixed by the canvas as `color-mix()` mixes:
 * in `method`, with premultiplied alpha, as a gradient interpolates. Null when the canvas does not take the mix.
 * @param {OffscreenCanvasRenderingContext2D} c
 * @param {string} method
 * @param {string} from
 * @param {string} to
 * @param {number} t
 * @returns {string | null}
 */
function mixOf(c, method, from, to, t) {
  const unset = '#010203'
  c.fillStyle = unset
  c.fillStyle = `color-mix(in ${method}, ${from} ${((1 - t) * 100).toFixed(3)}%, ${to})`
  const mixed = String(c.fillStyle)
  return mixed === unset ? null : mixed
}

/**
 * What a style paints as its background, as layers bottom first: its colour, then each of its images (the last listed
 * lowest), each a gradient's colours (gradientColours). An image that does not cover the box (sized or not repeated)
 * may not lie under a point: `transparent` is among its colours. Null for an image that is not a gradient, or a
 * gradient whose colours are not read.
 * @param {CSSStyleDeclaration} s
 * @returns {string[][] | null}
 */
function backgroundOf(s) {
  if (s.backgroundImage === 'none') return [[s.backgroundColor]]
  const images = listItems(s.backgroundImage)
  const sizes = listItems(s.backgroundSize)
  const repeats = listItems(s.backgroundRepeat)
  /** @type {string[][]} */
  const layers = []
  for (const [i, image] of images.entries()) {
    const stops = image.includes('gradient(') ? gradientStops(image) : []
    const colours = stops.length > 0 ? gradientColours(stops, interpolationOf(image, stops)) : null
    if (!colours) return null
    const covers =
      (sizes[i % sizes.length] ?? 'auto') === 'auto' &&
      ['repeat', 'repeat repeat'].includes(repeats[i % repeats.length] ?? '')
    layers.unshift(covers ? colours : [...colours, 'transparent'])
  }
  return [[s.backgroundColor], ...layers]
}

/**
 * The colours of the sides of a style's border that paint: a width, and a style that draws.
 * @param {CSSStyleDeclaration} s
 */
function borderColours(s) {
  return ['top', 'right', 'bottom', 'left']
    .filter(
      (side) =>
        Number.parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 &&
        !['none', 'hidden'].includes(s.getPropertyValue(`border-${side}-style`)),
    )
    .map((side) => s.getPropertyValue(`border-${side}-color`))
}

/**
 * The colours of a style's box shadows, its inset ones or its outer ones: the computed style writes each one's colour.
 * @param {CSSStyleDeclaration} s
 * @param {boolean} inset
 */
function shadowColours(s, inset) {
  if (s.boxShadow === 'none') return []
  return s.boxShadow
    .split(/,(?![^(]*\))/u)
    .filter((x) => x.includes('inset') === inset)
    .flatMap((x) => gradientStops(x))
}

/**
 * The colours a style paints inward over its own box: its inset shadows' and an outline's drawn inward.
 * @param {CSSStyleDeclaration} s
 */
function insetColours(s) {
  const outline = s.outlineStyle !== 'none' && Number.parseFloat(s.outlineOffset) < 0 ? [s.outlineColor] : []
  return [...shadowColours(s, true), ...outline]
}

/**
 * The colours a style paints past its box (outerReach): its outer shadows' and its outline's. Null when it reaches past
 * it with a filter or a border image, whose colours are not read (the profile refuses both: css.ts).
 * @param {CSSStyleDeclaration} s
 * @returns {string[] | null}
 */
function outerColours(s) {
  if (s.filter !== 'none' || s.borderImageSource !== 'none') return null
  return [...shadowColours(s, false), ...(s.outlineStyle === 'none' ? [] : [s.outlineColor])]
}

/**
 * A radius's length in pixels: a percentage is of the box's side along it.
 * @param {string} value
 * @param {number} side
 */
function radiusIn(value, side) {
  const n = Number.parseFloat(value) || 0
  return value.endsWith('%') ? (n / 100) * side : n
}

/**
 * How much a corner's radii are scaled down for one side of a box to hold the two along it (CSS Backgrounds 3).
 * @param {number} side
 * @param {number} a
 * @param {number} b
 */
function fitOf(side, a, b) {
  return a + b > side ? side / (a + b) : 1
}

/**
 * Where a point lies against one rounded corner, by its distances from the corner's two edges and the corner's radii:
 * clear of the corner ('inside'), inside its curve ('corner'), outside it, or within a pixel of it.
 * @param {number} dx
 * @param {number} dy
 * @param {number} rx
 * @param {number} ry
 * @returns {'inside' | 'outside' | 'near' | 'corner'}
 */
function cornerPlace(dx, dy, rx, ry) {
  if (rx <= 0 || ry <= 0 || dx >= rx || dy >= ry) return 'inside'
  const d = Math.hypot((rx - dx) / rx, (ry - dy) / ry)
  const band = 1 / Math.min(rx, ry)
  if (d <= 1 - band) return 'corner'
  return d > 1 + band ? 'outside' : 'near'
}

/**
 * Where a point inside a box's rectangle lies against the curve of its rounded corners (radii too large for a side
 * scaled down together): inside the shape its background and border are drawn in, outside it past a corner's curve,
 * or within a pixel of the curve, where either may hold; 'corner' inside the curve but within a corner's radii, where a
 * border's inner curve may reach. A rectangle is not the shape a rounded box paints: a white circle does not lie
 * beneath a text at its bounding box's corner (#117).
 * @param {CSSStyleDeclaration} s
 * @param {{ left: number, top: number, width: number, height: number }} r the box, in the viewport
 * @param {{ x: number, y: number }} p in the viewport
 * @returns {'inside' | 'outside' | 'near' | 'corner'}
 */
function curveAt(s, r, p) {
  const radii = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((corner) => {
    const [h = '0px', v = h] = s.getPropertyValue(`border-${corner}-radius`).split(' ')
    return { x: radiusIn(h, r.width), y: radiusIn(v, r.height) }
  })
  const [tl = { x: 0, y: 0 }, tr = tl, br = tl, bl = tl] = radii
  const f = Math.min(
    fitOf(r.width, tl.x, tr.x),
    fitOf(r.width, bl.x, br.x),
    fitOf(r.height, tl.y, bl.y),
    fitOf(r.height, tr.y, br.y),
  )
  const left = p.x - r.left
  const right = r.left + r.width - p.x
  const top = p.y - r.top
  const bottom = r.top + r.height - p.y
  const places = [
    cornerPlace(left, top, tl.x * f, tl.y * f),
    cornerPlace(right, top, tr.x * f, tr.y * f),
    cornerPlace(right, bottom, br.x * f, br.y * f),
    cornerPlace(left, bottom, bl.x * f, bl.y * f),
  ]
  if (places.includes('outside')) return 'outside'
  if (places.includes('near')) return 'near'
  return places.includes('corner') ? 'corner' : 'inside'
}

/**
 * Where a point lies against the rounded corners of the one of an element's boxes that holds it (curveAt); 'inside'
 * when its corners are not rounded.
 * @param {Element} e
 * @param {CSSStyleDeclaration} style
 * @param {Paints} paints
 * @param {{ x: number, y: number }} p in the viewport
 * @returns {'inside' | 'outside' | 'near' | 'corner'}
 */
function shapeAt(e, style, paints, p) {
  const r = paints.rounded ? rectAt(e, p) : null
  return r ? curveAt(style, r, p) : 'inside'
}

/**
 * What a generated box under a point paints there, as layers bottom first: its background, then its border's and its
 * inset paint's colours, which may not reach the point, with `transparent` among them. Past its rounded corners'
 * curve it paints nothing there. Each layer may not reach the point (`transparent` among its colours) within a pixel of
 * that curve, where it is drawn in more than one box (its union then holds points it does not paint), where it is turned
 * or scaled (its bounds then hold points its shape does not), and where a box around it clips the point (it may yet
 * escape that clip): the protocol gives its bounds, not its shape. Null for a background image that is not a gradient,
 * or a border image.
 * @param {Element} el
 * @param {PlacedBox} g
 * @param {{ x: number, y: number }} p in the viewport
 * @returns {string[][] | null}
 */
function generatedPaint(el, g, p) {
  const s = getComputedStyle(el, g.pseudo)
  const background = backgroundOf(s)
  if (!background || s.borderImageSource !== 'none') return null
  const box = {
    left: g.box.x - window.scrollX,
    top: g.box.y - window.scrollY,
    width: g.box.width,
    height: g.box.height,
  }
  const shape = curveAt(s, box, p)
  if (shape === 'outside') return []
  const edges = [...borderColours(s), ...insetColours(s)]
  const layers = [...background, ...(edges.length > 0 ? [[...edges, 'transparent']] : [])]
  const unsure = shape === 'near' || g.pieces > 1 || isTurned(s) || !inView(el, p.x, p.y)
  return unsure ? layers.map((l) => [...l, 'transparent']) : layers
}

/**
 * Whether a style turns or scales what it draws, so that its bounds hold points its shape does not paint.
 * @param {CSSStyleDeclaration} s
 */
function isTurned(s) {
  return s.transform !== 'none' || s.rotate !== 'none' || s.scale !== 'none'
}

/**
 * What an element's own box paints beneath a point, as layers bottom first: its background where it lies under the
 * point (backgroundUnder), or, clipped to its content or its text, which may not reach the point, with `transparent`
 * among its colours; its border's colours on its border, or, turned or scaled, where its border may lie, which may
 * not reach the point; and inside it, its inset shadows' and an inward outline's, which may not reach the point
 * either. Null for a background image that is not a gradient, or a border image there (the profile refuses it:
 * css.ts).
 * @param {Element} e
 * @param {CSSStyleDeclaration} style
 * @param {Paints} paints
 * @param {'outside' | 'border' | 'padding'} at
 * @returns {string[][] | null}
 */
function boxPaint(e, style, paints, at) {
  const background = backgroundPart(e, style, paints, at)
  if (!background || (at !== 'outside' && style.borderImageSource !== 'none')) return null
  const turned = at !== 'outside' && isTurned(style)
  const edges = at === 'border' || turned ? borderColours(style) : []
  const inset = at === 'outside' ? [] : insetColours(style)
  return [
    ...background,
    ...(edges.length > 0 ? [turned ? [...edges, 'transparent'] : edges] : []),
    ...(inset.length > 0 ? [[...inset, 'transparent']] : []),
  ]
}

/**
 * What an element's background paints beneath a point (boxPaint): its layers where it lies under the point, unturned or
 * clipped to its border box; layers that may not reach it (`transparent` among their colours) where it may lie there
 * (clipped to its content, or turned and clipped inside its border); else none. Null for an image that is not a
 * gradient.
 * @param {Element} e
 * @param {CSSStyleDeclaration} style
 * @param {Paints} paints
 * @param {'outside' | 'border' | 'padding'} at
 * @returns {string[][] | null}
 */
function backgroundPart(e, style, paints, at) {
  const background = paints.own ? backgroundOf(style) : []
  if (!background) return null
  const under = backgroundUnder(e, paints.clip, at)
  if (under && (paints.clip === 'border-box' || !isTurned(style))) return background
  return at === 'outside' ? [] : background.map((l) => [...l, 'transparent'])
}

/**
 * What an element's own box paints beneath a point of a text (boxPaint): nothing past its rounded corners' curve,
 * within a pixel of it layers that may not reach the point, and inside a corner, its border's colours, which its inner
 * curve may reach there (curveAt). Null when it cannot be read.
 * @param {Element} e
 * @param {{ x: number, y: number }} p in the viewport
 * @param {Look} look
 * @returns {string[][] | null}
 */
function ownPaint(e, p, look) {
  const paints = paintsOf(e, look)
  const style = getComputedStyle(e)
  const placed = paints.own || paints.edge || paints.inset ? placeOf(e, paints.widths, p) : 'outside'
  const shape = placed === 'outside' ? 'inside' : shapeAt(e, style, paints, p)
  const own = boxPaint(e, style, paints, shape === 'outside' ? 'outside' : placed)
  if (own && shape === 'corner' && placed === 'padding' && paints.edge)
    return [...own, [...borderColours(style), 'transparent']]
  return own && shape === 'near' ? own.map((l) => [...l, 'transparent']) : own
}

/**
 * A number for an element, the same for the page's whole measure: it names an opacity group in a reading.
 * @param {Element} e
 * @param {Look} look
 */
function idOf(e, look) {
  const known = look.ids.get(e)
  if (known !== undefined) return known
  look.ids.set(e, look.ids.size)
  return look.ids.size - 1
}

/**
 * The element holding a text and those around it that are drawn at an opacity below 1: each draws the text with all
 * else inside it as one group, faded together over what lies below.
 * @param {Element} holder
 * @returns {Element[]}
 */
function fadedAround(holder) {
  /** @type {Element[]} */
  const out = []
  for (let a = /** @type {Element | null} */ (holder); a; a = a.parentElement)
    if (Number.parseFloat(getComputedStyle(a).opacity || '1') < 1) out.push(a)
  return out
}

/**
 * The opacity group one paint beneath a text is drawn in (#117): an element drawn at an opacity below 1 draws all it
 * holds, and its generated boxes, as one group, faded together over what lies below, so `opacity: .1` on a black box
 * paints a pale grey, not black. The group is the one such element (or generated box) among the paint's own and the
 * elements around it, up to the first that also holds the text; '' with no such element. Null when there is more than
 * one (a group inside a group is not read), or when the paint lies inside an element around the text drawn at an
 * opacity below 1: the text and the paint then fade together, which no one opacity on the text tells.
 * @param {Element} e the element whose paint it is
 * @param {string} pseudo its generated box's ('::before', '::after'), or '' for its own box
 * @param {{ holder: Element, faded: Element[] }} text the element holding the text, and fadedAround's
 * @param {Look} look
 * @returns {{ group: string, fade: number } | null}
 */
function groupOf(e, pseudo, text, look) {
  if (text.faded.some((f) => f.contains(e))) return null
  /** @type {{ group: string, fade: number }[]} */
  const groups = []
  const own = pseudo ? Number.parseFloat(getComputedStyle(e, pseudo).opacity || '1') : 1
  if (own < 1) groups.push({ group: `${idOf(e, look)}${pseudo}`, fade: own })
  for (let a = /** @type {Element | null} */ (e); a && !a.contains(text.holder); a = a.parentElement) {
    const fade = Number.parseFloat(getComputedStyle(a).opacity || '1')
    if (fade < 1) groups.push({ group: String(idOf(a, look)), fade })
  }
  if (groups.length > 1) return null
  return groups[0] ?? { group: '', fade: 1 }
}

/**
 * Layers of colours drawn in one opacity group.
 * @param {string[][]} lists
 * @param {{ group: string, fade: number }} group
 * @returns {Layer[]}
 */
function grouped(lists, group) {
  return lists.map((colours) => ({ colours, ...group }))
}

/**
 * What one element in the stack beneath a text paints at a point (#117): its own box (ownPaint), unless it is the root
 * or the body, whose backgrounds fill the canvas (canvasOf), and each of its generated boxes under the point
 * (generatedPaint), each in its opacity group (groupOf). Null when any of it cannot be read, or the element draws
 * generated boxes whose place was not given.
 * @param {Element} e
 * @param {{ x: number, y: number }} p in the viewport
 * @param {{ holder: Element, faded: Element[], canvas: Set<Element> }} text
 * @param {Look} look
 * @returns {{ own: Layer[], pseudos: { pseudo: string, layers: Layer[] }[] } | null}
 */
function partsAt(e, p, text, look) {
  const own = text.canvas.has(e) ? [] : ownPaint(e, p, look)
  const generated = generatedHere(e, p, look)
  const ownGroup = own && own.length > 0 ? groupOf(e, '', text, look) : { group: '', fade: 1 }
  if (!own || !generated || !ownGroup) return null
  /** @type {{ pseudo: string, layers: Layer[] }[]} */
  const pseudos = []
  for (const g of generated) {
    const colours = generatedPaint(e, g, p)
    const group = groupOf(e, g.pseudo, text, look)
    if (!colours || !group) return null
    if (colours.length > 0) pseudos.push({ pseudo: g.pseudo, layers: grouped(colours, group) })
  }
  return { own: grouped(own, ownGroup), pseudos }
}

/**
 * What fills the canvas beneath every text: the root's background, and the body's when the root has none, which it
 * then takes. Null when it cannot be read.
 * @param {{ holder: Element, faded: Element[], canvas: Set<Element> }} text
 * @param {Look} look
 * @returns {Layer[] | null}
 */
function canvasOf(text, look) {
  /** @type {Layer[]} */
  const layers = []
  for (const e of text.canvas) {
    const own = backgroundOf(getComputedStyle(e))
    const group = groupOf(e, '', text, look)
    if (!own || !group) return null
    layers.push(...grouped(own, group))
  }
  return layers
}

/**
 * Whether a generated box's z-index is negative, so it may be painted under its element's own box.
 * @param {Element} e
 * @param {string} pseudo
 */
function setBeneath(e, pseudo) {
  return Number.parseFloat(getComputedStyle(e, pseudo).zIndex) < 0
}

/**
 * Whether an element surely forms a stacking context of its own, inside which its generated boxes, a negative z-index
 * included, are painted over its own box: the root, an element drawn at an opacity below 1, isolated, transformed, or
 * placed with a z-index. Any other may not, and a generated box beneath it may then be painted under its own box.
 * @param {Element} e
 */
function stacksAlone(e) {
  const s = getComputedStyle(e)
  const placed = s.zIndex !== 'auto' && s.position !== 'static'
  const faded = Number.parseFloat(s.opacity || '1') < 1
  return e === document.documentElement || faded || s.isolation === 'isolate' || isTurned(s) || placed
}

/**
 * @typedef {{ layers: Layer[], slot: number, rank: number }} Part paint beneath a text, at a place in the stack beneath
 *   it (a slot, bottom first) and, within one slot, in an order (its rank)
 */

/**
 * Every way one element's paint at a point may be placed among its hits in the stack beneath a text (#117). A generated
 * box hit-tests as its element, so the stack does not tell which hit is which: its own box is at its lowest hit, and
 * each generated box at any hit, over its own box. One set beneath with a negative z-index, of an element that may not
 * form a stacking context of its own (stacksAlone), may lie under its own box: its own box is then at any hit, and the
 * generated box at any hit, under or over it. Null past `max` ways.
 * @param {Element} e
 * @param {number[]} slots its hits in the stack, bottom first
 * @param {{ own: Layer[], pseudos: { pseudo: string, layers: Layer[] }[] }} parts
 * @param {number} max
 * @returns {Part[][] | null}
 */
function arrangementsOf(e, slots, parts, max) {
  const alone = stacksAlone(e)
  const under = parts.pseudos.some((g) => !alone && setBeneath(e, g.pseudo))
  /** @type {{ own: number, parts: Part[] }[]} */
  let ways = (under ? slots : slots.slice(0, 1)).map((own) => ({
    own,
    parts: [{ layers: parts.own, slot: own, rank: 0 }],
  }))
  for (const [k, g] of parts.pseudos.entries()) {
    const beneath = !alone && setBeneath(e, g.pseudo)
    const ranks = beneath ? [-(k + 1), k + 1] : [k + 1]
    ways = ways.flatMap((w) =>
      slots
        .filter((slot) => beneath || slot >= w.own)
        .flatMap((slot) =>
          ranks.map((rank) => ({ own: w.own, parts: [...w.parts, { layers: g.layers, slot, rank }] })),
        ),
    )
    if (ways.length > max) return null
  }
  return ways.map((w) => w.parts.filter((part) => part.layers.length > 0))
}

/**
 * Paint reaching a point from past another box (reachIndex), each as a layer of its colours, which may not reach the
 * point (`transparent` among them), in its opacity group. Null when any one's colours or group cannot be read.
 * @param {{ x: number, y: number }} p in the viewport
 * @param {{ holder: Element, faded: Element[], canvas: Set<Element> }} text
 * @param {Look} look
 * @returns {Layer[] | null}
 */
function reachedAt(p, text, look) {
  /** @type {Layer[]} */
  const layers = []
  for (const e of look.reach.rows.get(Math.floor((p.y + window.scrollY) / 512)) ?? []) {
    if (pointIn(e.box, p) || !pointIn(e.box, p, e.reach)) continue
    const group = groupOf(e.el, e.pseudo, text, look)
    if (!e.colours || !group) return null
    if (e.colours.length > 0) layers.push({ colours: [...e.colours, 'transparent'], ...group })
  }
  return layers
}

/**
 * Whether each opacity group's layers lie together in a reading, as an opacity group's paint always does.
 * @param {Layer[]} layers
 */
function contiguous(layers) {
  /** @type {Set<string>} */
  const seen = new Set()
  let last = ''
  for (const { group } of layers) {
    if (group && group !== last && seen.has(group)) return false
    seen.add(group)
    last = group
  }
  return true
}

/**
 * Every order the paint beneath a text at a point may be drawn in, each a reading of layers bottom first: the canvas,
 * then each element's paint in one of its arrangements (arrangementsOf), in the stack's order, then each paint reaching
 * the point from past another box at any place among them, since nothing tells where. Orders that split an opacity
 * group are dropped: none is drawn so. Null past `max` orders.
 * @param {Layer[]} canvas
 * @param {Part[][][]} choices each element's arrangements
 * @param {Layer[]} floating
 * @param {number} max
 * @returns {Layer[][] | null}
 */
function ordersOf(canvas, choices, floating, max) {
  /** @type {Part[][]} */
  let ways = [[]]
  for (const options of choices) {
    ways = ways.flatMap((w) => options.map((o) => [...w, ...o]))
    if (ways.length > max) return null
  }
  /** @type {Map<string, Layer[][]>} */
  const distinct = new Map()
  for (const w of ways) {
    const order = w.toSorted((a, b) => a.slot - b.slot || a.rank - b.rank).map((part) => part.layers)
    distinct.set(JSON.stringify(order), order)
  }
  let orders = [...distinct.values()]
  for (const layer of floating) {
    orders = orders.flatMap((o) =>
      Array.from({ length: o.length + 1 }, (_, i) => [...o.slice(0, i), [layer], ...o.slice(i)]),
    )
    if (orders.length > max) return null
  }
  return orders.map((o) => [...canvas, ...o.flat()]).filter(contiguous)
}

/**
 * What lies beneath a text at a point, as the readings it may be (#117): each a list of layers bottom first, each the
 * colours that may be painted there, in its opacity group. The order is the browser's: the elements at the point, from
 * the bottom up to the text (document.elementsFromPoint, in paint order), each painting its own box and its generated
 * boxes there (arrangementsOf), over the canvas, and paint reaching there from past another box at any place among
 * them. A reading that holds every order the stack leaves open never takes a layer for the one on top that another
 * covers. Null when any of it cannot be read, or the orders are more than four times `maxGrounds`.
 * @param {Element} holder
 * @param {Element[]} stack the elements at the point, topmost first
 * @param {{ x: number, y: number }} p in the viewport
 * @param {Look} look
 * @returns {Layer[][] | null}
 */
function groundAt(holder, stack, p, look) {
  if (look.reach.over) return null
  const root = document.documentElement
  // The root's background fills the canvas, and the body's with it when the root has none; else the body paints its own box.
  const bare =
    isClear(look.ctx, getComputedStyle(root).backgroundColor) && getComputedStyle(root).backgroundImage === 'none'
  const canvas = new Set(bare ? [root, document.body] : [root])
  const text = { holder, faded: fadedAround(holder), canvas }
  const at = stack.indexOf(holder)
  const below = (at < 0 ? stack : stack.slice(at)).toReversed()
  const base = canvasOf(text, look)
  const floating = reachedAt(p, text, look)
  if (!base || !floating) return null
  const max = look.maxGrounds * 4
  /** @type {Part[][][]} */
  const choices = []
  for (const e of new Set(below)) {
    const parts = partsAt(e, p, text, look)
    const slots = below.flatMap((x, i) => (x === e ? [i] : []))
    const ways = parts ? arrangementsOf(e, slots, parts, max) : null
    if (!ways) return null
    if (ways.some((w) => w.length > 0)) choices.push(ways)
  }
  return ordersOf(base, choices, floating, max)
}

/**
 * Note what lies beneath a text at a point (Ground): the background its element's contrast is read against
 * (onOwnGround), or the readings of other paint (groundAt). Past `maxGrounds` readings for one element, or where any
 * cannot be read, what lies beneath its text is unread, and its contrast unknown.
 * @param {Element} holder
 * @param {{ x: number, y: number }} p in the viewport
 * @param {Look} look
 */
function noteGround(holder, p, look) {
  const ground = look.grounds.get(holder) ?? { base: false, layers: new Map(), unread: false }
  look.grounds.set(holder, ground)
  if (ground.unread) return
  const stack = document.elementsFromPoint(p.x, p.y)
  if (onOwnGround(holder, stack, p, look)) {
    ground.base = true
    return
  }
  const readings = groundAt(holder, stack, p, look)
  for (const layers of readings ?? []) {
    const key = JSON.stringify(layers)
    if (ground.layers.has(key)) continue
    if (ground.layers.size >= look.maxGrounds) break
    ground.layers.set(key, layers)
  }
  ground.unread ||= !readings || readings.some((l) => !ground.layers.has(JSON.stringify(l)))
}

/**
 * The cover check along every line of one text (isCovered): 'covered' at the first point something else is on top,
 * 'unmeasured' when the page's budget runs out (of points, a line's included, or of time) or a point no scroll of the window shows is
 * reached (inWindow), else 'clear' with the points only the protocol can judge added to `probes` (in page
 * coordinates). The text's lines are read once, and a text with MAX_LINES lines or more, or more lines than the budget
 * has points left, is not looked at, line by line or at all (#117).
 * What lies beneath the text at each point is noted for its element (noteGround).
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
    const points = pointsAlong(lineInView(line), em, budget)
    if (!points) return 'unmeasured'
    for (const p of points) {
      if (!inView(holder, p.x, p.y)) continue
      if (!inWindow(p)) return 'unmeasured'
      budget.left -= 1
      if (budget.left < 0) return 'unmeasured'
      const verdict = coverOf(holder, suspect, document.elementFromPoint(p.x, p.y))
      if (verdict === 'covered') return 'covered'
      noteGround(holder, p, look)
      if (verdict === 'generated')
        probes.push({ x: Math.round(p.x + window.scrollX), y: Math.round(p.y + window.scrollY) })
    }
  }
  return 'clear'
}

/**
 * Whether anything is drawn over an element's text, looked for along every line of every text in it (#117), every
 * scroll then put back, noting at each point what lies beneath the text (noteGround), and which elements holding
 * text it looked at. The points where only the DevTools protocol can tell come back for capture-html to ask. A text
 * not set along the page's lines (isUpright) is not looked at, and is unmeasured (#117).
 * @param {Element} el
 * @param {Budget} budget the points the page may still look at, and until when
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @returns {{ cover: 'clear' | 'covered' | 'unmeasured', probes: { x: number, y: number }[], holders: Element[] }}
 */
function isCovered(el, budget, ctx) {
  const restore = keepScroll(el)
  /** @type {{ x: number, y: number }[]} */
  const probes = []
  /** @type {Set<Element>} */
  const holders = new Set()
  const { paints, reach, generated, grounds, maxGrounds, ids } = budget
  const look = { ctx, paints, reach, generated, grounds, maxGrounds, ids }
  try {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const holder = node.parentElement
      if (!holder || !node.textContent?.trim()) continue
      holders.add(holder)
      const verdict = isUpright(holder, budget.upright) ? coverAlong(holder, node, budget, probes, look) : 'unmeasured'
      if (verdict !== 'clear') return { cover: verdict, probes: [], holders: [...holders] }
    }
    return { cover: 'clear', probes, holders: [...holders] }
  } finally {
    restore()
  }
}

/**
 * Whether any two of a text's line boxes are drawn over each other: side by side and overlapping by more than half the
 * height of the shorter. `line-height: 0` draws every wrapped line of a block on its first, while each line box keeps a
 * glyph's height and advance (#117); a tight line height (1) overlaps its neighbours by a sliver only. Read in order of
 * their tops against those still open above, within a bound of comparisons; past it the text is taken as overprinted.
 * @param {DOMRect[]} rects
 */
function overprinted(rects) {
  let left = 200_000
  /** @type {DOMRect[]} */
  let open = []
  for (const r of rects.filter((b) => b.width > 0 && b.height > 0).toSorted((a, b) => a.top - b.top)) {
    open = open.filter((o) => o.bottom > r.top)
    left -= open.length
    if (left < 0) return true
    const over = (/** @type {DOMRect} */ o) =>
      Math.min(o.bottom, r.bottom) - r.top > Math.min(o.height, r.height) / 2 &&
      Math.min(o.right, r.right) - Math.max(o.left, r.left) > 1
    if (open.some(over)) return true
    open.push(r)
  }
  return false
}

/**
 * Whether a text outside the blocks is set too small to read in a capture, as rendered (a transform's scale
 * included): a line of it under the readable height, or its glyphs on average closer than the readable advance, or its
 * lines drawn over each other (overprinted). Marks that say nothing are not held to it, and a text not rendered is
 * judged by its own element (#117).
 * @param {Element} el
 * @param {{ linePx: number, advancePx: number }} readable
 * @param {RegExp} words a character that is not a mark
 */
function tooSmall(el, readable, words) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  /** @type {DOMRect[]} */
  const lines = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? ''
    const range = document.createRange()
    range.selectNodeContents(node)
    const rects = [...range.getClientRects()]
    if (!words.test(text) || rects.length === 0) continue
    const advance = rects.reduce((sum, r) => sum + r.width, 0) / text.replace(/\s+/gu, '').length
    if (rects.some((r) => r.height < readable.linePx) || advance < readable.advancePx) return true
    lines.push(...rects)
  }
  return overprinted(lines)
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
 * The opacity a text is drawn at, or why its contrast cannot be read from its styles: filtered, stroked, decorated, or
 * group_opacity.
 * @param {Element} el
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @returns {number | string}
 */
function drawnAlpha(el, ctx) {
  if (isFiltered(el)) return 'filtered'
  if (isStroked(el)) return 'stroked'
  return isDecorated(el) ? 'decorated' : (textAlpha(el, ctx) ?? 'group_opacity')
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
 * Whether a decoration may be drawn over a text: a line through it, or a decoration of a thickness or an offset of its
 * own, on the element or on a box around it, whose decorations its text carries. In the background's colour, a line
 * as thick as a glyph buries the text while its fill, which the render reads, stays readable (#117). The profile
 * refuses them; this holds a page that has one to an unknown contrast.
 * @param {Element} el
 */
function isDecorated(el) {
  for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) {
    const style = getComputedStyle(a)
    if (
      style.textDecorationLine.includes('line-through') ||
      !['auto', 'from-font'].includes(style.textDecorationThickness) ||
      style.textUnderlineOffset !== 'auto'
    )
      return true
  }
  return false
}

/**
 * Whether a filter or a blend mode, on the element or an ancestor, changes the colours it is drawn in: the contrast
 * read from its styles would not be the contrast a reader sees (#117). A blend of an element's own background layers
 * (`background-blend-mode`) counts too: two white layers set to `difference` paint black (#117).
 * @param {Element} el
 */
function isFiltered(el) {
  for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) {
    const style = getComputedStyle(a)
    if (
      style.filter !== 'none' ||
      style.mixBlendMode !== 'normal' ||
      (style.backdropFilter || 'none') !== 'none' ||
      style.backgroundBlendMode.split(',').some((m) => m.trim() !== 'normal')
    )
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
 * The colours a computed value names, as the computed style writes them: a gradient's stops, a shadow's colour; an
 * empty list when it names none.
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
    const own = backgroundOf(getComputedStyle(a))
    if (!own) return null
    layers.unshift(...own)
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
 * Fill a 1×1 canvas with a colour over what it holds; whatever syntax the page used, the canvas resolves it.
 * @param {OffscreenCanvasRenderingContext2D} c
 * @param {string} colour
 */
function fillWith(c, colour) {
  c.fillStyle = '#ffffff'
  c.fillStyle = colour
  c.fillRect(0, 0, 1, 1)
}

/**
 * A 1×1 canvas's colour, as sRGB bytes.
 * @param {OffscreenCanvasRenderingContext2D} c
 * @returns {[number, number, number]}
 */
function pixelOf(c) {
  const [r = 0, g = 0, b = 0] = c.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

/**
 * Draw one way a reading's layers combine, over white: each layer's colour in turn, and each opacity group's layers
 * drawn together on a scratch canvas, then over the rest at the group's opacity, as the browser composites them (#117).
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {OffscreenCanvasRenderingContext2D} scratch
 * @param {string[]} combo one colour per layer
 * @param {Layer[]} layers
 */
function drawGround(ctx, scratch, combo, layers) {
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1, 1)
  let i = 0
  while (i < combo.length) {
    const group = layers[i]?.group ?? ''
    const fade = layers[i]?.fade ?? 1
    if (group === '') {
      fillWith(ctx, combo[i] ?? 'transparent')
      i += 1
      continue
    }
    scratch.clearRect(0, 0, 1, 1)
    for (; i < combo.length && layers[i]?.group === group; i += 1) fillWith(scratch, combo[i] ?? 'transparent')
    ctx.globalAlpha = fade
    ctx.drawImage(scratch.canvas, 0, 0)
    ctx.globalAlpha = 1
  }
}

/**
 * The lowest contrast of a text's fill, drawn at its opacity, over every way the layers of each reading of what lies
 * beneath it can combine (combinations), each opacity group composited as the browser does (drawGround), or why it
 * cannot be read: an image that is not a gradient, or more than 64 ways for one reading.
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {(Layer[] | null)[]} readings
 * @param {{ fill: string, opacity: number }} text
 * @returns {number | string}
 */
function worstOver(ctx, readings, text) {
  const scratch = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })
  if (!scratch) return 'background_elsewhere'
  let worst = Number.POSITIVE_INFINITY
  for (const layers of readings) {
    if (!layers) return 'background_image'
    const behind = combinations(
      layers.map((l) => l.colours),
      64,
    )
    if (!behind) return 'background_too_complex'
    for (const combo of behind) {
      drawGround(ctx, scratch, combo, layers)
      const lo = luminance(pixelOf(ctx))
      ctx.globalAlpha = text.opacity
      fillWith(ctx, text.fill)
      ctx.globalAlpha = 1
      const [a, b] = [luminance(pixelOf(ctx)), lo].toSorted((x, y) => y - x)
      worst = Math.min(worst, ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05))
    }
  }
  return worst
}

/**
 * The reading of what lies beneath an element's text where it lies over its own background (backgroundLayers), its
 * layers in no opacity group; null when that background cannot be read.
 * @param {Element} el
 * @returns {Layer[] | null}
 */
function ownReading(el) {
  const base = backgroundLayers(el)
  return base ? base.map((colours) => ({ colours, group: '', fade: 1 })) : null
}

/**
 * An element's text contrast against what is behind it (WCAG 2): the worst case over every reading of what lay beneath
 * its text where the cover check looked (noteGround), its own background (backgroundLayers) and other paint (#117),
 * and over the stops of any gradient there, against the floor for the size its text is drawn at (3 for large text, 4.5
 * otherwise): a heading set large and scaled or zoomed down is held to the floor of the size a capture shows, and one
 * whose drawn size the styles do not tell to the higher floor (#117). Where its text was not looked at, it is read over
 * its own background. The text is painted in the colour it is filled with, at the opacity it is drawn at (#117).
 * Unknown when what lies beneath cannot be read (background_elsewhere, background_image, background_too_complex), a
 * filter or blend mode changes the colours, a stroke outlines the glyphs (#117), or opacity fades a background
 * together with the text (group_opacity).
 * @param {Element} el
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {Ground} [ground]
 * @returns {Contrast}
 */
function contrastOf(el, ctx, ground) {
  const style = getComputedStyle(el)
  const large = isLarge(el, style)
  const floor = large ? 3 : 4.5
  const opacity = drawnAlpha(el, ctx)
  if (typeof opacity === 'string') return { ratio: null, floor, large, detail: opacity }
  if (ground?.unread) return { ratio: null, floor, large, detail: 'background_elsewhere' }
  const own = ownReading(el)
  const read = [...(ground?.base === false ? [] : [own]), ...(ground?.layers.values() ?? [])]
  const fill = style.getPropertyValue('-webkit-text-fill-color') || style.color
  const worst = worstOver(ctx, read.length > 0 ? read : [own], { fill, opacity })
  if (typeof worst === 'string') return { ratio: null, floor, large, detail: worst }
  return { ratio: Math.round(worst * 100) / 100, floor, large, detail: null }
}

/**
 * The contrast an element's text is held to (contrastOf): its own text's, over what lay beneath it, and that of each
 * element inside it holding text over paint other than its own background, the worst of them. An element holding no
 * text of its own is read over its own background only when nothing inside it lies over other paint (#117).
 * @param {Element} el
 * @param {Element[]} holders the elements holding text in it that the cover check looked at
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {Map<Element, Ground>} grounds
 * @returns {Contrast}
 */
function textContrast(el, holders, ctx, grounds) {
  const over = holders.filter((h) => {
    const ground = grounds.get(h)
    return h !== el && ground !== undefined && (ground.unread || ground.layers.size > 0)
  })
  const own = holders.includes(el) || over.length === 0 ? [contrastOf(el, ctx, grounds.get(el))] : []
  const [first, ...rest] = [...own, ...over.map((h) => contrastOf(h, ctx, grounds.get(h)))]
  return first ? worstContrast(first, rest) : contrastOf(el, ctx)
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
 * @param {{ page: Box, ctx: OffscreenCanvasRenderingContext2D, runs: { left: number, over: number },
 *   grounds: Map<Element, Ground> }} at
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
    shown.map((j) => contrastOf(j.run, at.ctx, at.grounds.get(j.run))),
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
  const { cover, probes, holders } = looked ? isCovered(el, budget, ctx) : { cover: 'clear', probes: [], holders: [] }
  // A text is read over what lay beneath it where the cover check looked: its own background, or other paint (#117).
  const contrast = textContrast(el, holders, ctx, budget.grounds)
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
 *   maxLines: number, readable: { linePx: number, advancePx: number }, maxTextRects: number, besideEm: number,
 *   maxGrounds: number, generated?: Parameters<typeof generatedIndex>[0] }} opts
 * @returns {PageAnswer}
 */
function measurePage(opts) {
  const root = document.documentElement
  const page = { x: 0, y: 0, width: root.scrollWidth, height: root.scrollHeight }
  const ctx = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2D canvas to resolve colours')
  const generated = generatedIndex(opts.generated)
  /** @type {Budget} */
  const budget = {
    left: opts.maxPoints,
    until: performance.now() + opts.maxLookMs,
    maxLines: opts.maxLines,
    paints: new Map(),
    upright: new Map(),
    reach: reachIndex(generated),
    generated,
    grounds: new Map(),
    maxGrounds: opts.maxGrounds,
    ids: new Map(),
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
    const m = withRuns(strictly({ el, id: el.getAttribute('data-block') ?? '' }), el, {
      page,
      ctx,
      runs,
      grounds: budget.grounds,
    })
    if (beside === null) return { ...m, unsampled: true }
    return beside.has(el) ? { ...m, issues: [...new Set([...m.issues, 'adjoined'])].slice(0, 10) } : m
  })
  // One past the bound, so that a page with more labels than the measure keeps counts one left out (shownElements).
  const labels = shownElements(opts.maxMeasured + 1)
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
 * gives them: each element once, in document order, named by the nearest label around it, and at most `max`. A label
 * inside another is not read again for each one around it, and the page is not read past `max`, so no page's shape
 * (labels nested two hundred deep around a large page) makes the list larger than the measure keeps (#117).
 * @param {number} max
 * @returns {{ el: Element, id: string }[]}
 */
function shownElements(max) {
  /** @type {{ el: Element, id: string }[]} */
  const out = []
  for (const el of document.querySelectorAll('[data-sophia-shown], [data-sophia-shown] *')) {
    if (out.length >= max) break
    const own = el.getAttribute('data-sophia-shown')
    const holds = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '')
    const label = el.parentElement?.closest('[data-sophia-shown]')?.getAttribute('data-sophia-shown') ?? ''
    if (own !== null) out.push({ el, id: `label ${own}` })
    else if (holds) out.push({ el, id: `label ${label} ${nameOf(el)}` })
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
  ownTextOffPage,
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
  imageOutset,
  outerReach,
  reachIndex,
  paintsOf,
  placeOf,
  groundAround,
  plainAt,
  backgroundUnder,
  onOwnGround,
  inView,
  lineInView,
  inWindow,
  turns,
  isUpright,
  pointsAlong,
  generatedIndex,
  pointIn,
  reachOf,
  generatedHere,
  listItems,
  interpolationOf,
  gradientColours,
  pathOf,
  extremeNear,
  yOf,
  mixOf,
  backgroundOf,
  borderColours,
  shadowColours,
  insetColours,
  outerColours,
  radiusIn,
  rectAt,
  fitOf,
  cornerPlace,
  curveAt,
  shapeAt,
  generatedPaint,
  isTurned,
  boxPaint,
  backgroundPart,
  ownPaint,
  idOf,
  fadedAround,
  groupOf,
  grouped,
  partsAt,
  canvasOf,
  setBeneath,
  stacksAlone,
  arrangementsOf,
  reachedAt,
  contiguous,
  ordersOf,
  groundAt,
  noteGround,
  coverAlong,
  isCovered,
  overprinted,
  tooSmall,
  paint,
  opacityOf,
  textAlpha,
  isClear,
  drawnAlpha,
  isFiltered,
  isStroked,
  isDecorated,
  luminance,
  gradientStops,
  backgroundLayers,
  combinations,
  fillWith,
  pixelOf,
  drawGround,
  worstOver,
  ownReading,
  textContrast,
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
 * The look budget is the kernel's own, or less where a sweep has less time left (capture-html.mjs). `generated` is
 * where the page's generated boxes lie, as the protocol's snapshot gives them (placement.mjs generatedAt).
 * @param {{ maxListed: number, maxLookMs?: number, generated?: Parameters<typeof generatedIndex>[0] }} opts
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
    maxGrounds: MAX_GROUNDS,
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
