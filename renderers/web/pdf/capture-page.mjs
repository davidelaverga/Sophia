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
 * @typedef {{ left: number, until: number, maxLines: number }} Budget the points the cover check may still look at,
 *   the time (performance.now) it must stop by, and the fewest lines a text may have to be refused unread
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
 * element, unless that is fixed or sticky (a header that follows the reader).
 * @param {Element} el the measured element
 * @param {Element} holder the element that holds the text
 * @param {boolean} suspect whether the holder draws generated content that could reach the text
 * @param {Element | null} hit
 * @returns {'clear' | 'covered' | 'generated'}
 */
function coverOf(el, holder, suspect, hit) {
  if (!hit) return 'clear'
  if (hit === holder) return suspect ? 'generated' : 'clear'
  if (hit.contains(holder)) return 'covered'
  const stop = el.contains(hit) ? el : null
  for (let a = /** @type {Element | null} */ (hit); a && a !== stop; a = a.parentElement) {
    const position = getComputedStyle(a).position
    if (position === 'fixed' || position === 'sticky') return 'clear'
  }
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
 * The cover check along every line of one text (isCovered): 'covered' at the first point something else is on top,
 * 'unmeasured' when the page's budget runs out (of points, or of time), else 'clear' with the points only the protocol
 * can judge added to `probes` (in page coordinates). The text's lines are read once, and a text with MAX_LINES lines
 * or more, or more lines than the budget has points left, is not looked at, line by line or at all (#117).
 * @param {Element} el
 * @param {Element} holder the element that holds the text
 * @param {Node} node the text
 * @param {Budget} budget
 * @param {{ x: number, y: number }[]} probes
 * @returns {'clear' | 'covered' | 'unmeasured'}
 */
function coverAlong(el, holder, node, budget, probes) {
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
      const verdict = coverOf(el, holder, suspect, document.elementFromPoint(p.x, p.y))
      if (verdict === 'covered') return 'covered'
      if (verdict === 'generated')
        probes.push({ x: Math.round(p.x + window.scrollX), y: Math.round(p.y + window.scrollY) })
    }
  }
  return 'clear'
}

/**
 * Whether anything is drawn over an element's text, looked for along every line of every text in it (#117), every
 * scroll then put back. The points where only the DevTools protocol can tell come back for capture-html to ask.
 * @param {Element} el
 * @param {Budget} budget the points the page may still look at, and until when
 * @returns {{ cover: 'clear' | 'covered' | 'unmeasured', probes: { x: number, y: number }[] }}
 */
function isCovered(el, budget) {
  const restore = keepScroll(el)
  /** @type {{ x: number, y: number }[]} */
  const probes = []
  try {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const holder = node.parentElement
      if (!holder || !node.textContent?.trim()) continue
      const verdict = coverAlong(el, holder, node, budget, probes)
      if (verdict !== 'clear') return { cover: verdict, probes: [] }
    }
    return { cover: 'clear', probes }
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
 * The opacity a text is drawn at, or why its contrast cannot be read from its styles: filtered, or group_opacity.
 * @param {Element} el
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @returns {number | string}
 */
function drawnAlpha(el, ctx) {
  return isFiltered(el) ? 'filtered' : (textAlpha(el, ctx) ?? 'group_opacity')
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
 * (#117). Unknown when the background cannot be read, a filter or blend mode changes the colours, or opacity fades a
 * background together with the text (group_opacity).
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
  const contrast = contrastOf(el, ctx)
  if (contrast.ratio !== null && contrast.ratio < contrast.floor) issues.push('low_contrast')
  const looked = hidden.length === 0 && !issues.includes('off_page')
  const { cover, probes } = looked ? isCovered(el, budget) : { cover: 'clear', probes: [] }
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
 *   maxLines: number, readable: { linePx: number, advancePx: number } }} opts
 * @returns {PageAnswer}
 */
function measurePage(opts) {
  const root = document.documentElement
  const page = { x: 0, y: 0, width: root.scrollWidth, height: root.scrollHeight }
  const ctx = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2D canvas to resolve colours')
  const budget = { left: opts.maxPoints, until: performance.now() + opts.maxLookMs, maxLines: opts.maxLines }
  const words = new RegExp(`[^\\s${opts.marks}]`, 'u')
  const strictly = (/** @type {{ el: Element, id: string }} */ { el, id }) => {
    const measure = measureBlock(el, page, ctx, budget)
    const concealed = [...concealedIssues(el), ...(tooSmall(el, opts.readable, words) ? ['no_visible_text'] : [])]
    return { ...measure, id: id.slice(0, 200), issues: [...new Set([...concealed, ...measure.issues])].slice(0, 10) }
  }
  // A block is held to what a label is, and so is each run of its text in an element inside it (#117).
  const runs = { left: opts.maxMeasured, over: 0 }
  const blocks = [...document.querySelectorAll('[data-block]')].map((el) =>
    withRuns(strictly({ el, id: el.getAttribute('data-block') ?? '' }), el, { page, ctx, runs }),
  )
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
 * @param {{ maxListed: number }} opts
 */
export function pageScript(opts) {
  const all = {
    ...opts,
    maxMeasured: MAX_MEASURED,
    marks: MARK_CLASS,
    maxPoints: MAX_POINTS,
    maxLookMs: MAX_LOOK_MS,
    maxLines: MAX_LINES,
    readable: READABLE,
  }
  return `(() => {\n${IN_PAGE.map((f) => f.toString()).join('\n')}\nreturn measurePage(${JSON.stringify(all)})\n})()`
}
