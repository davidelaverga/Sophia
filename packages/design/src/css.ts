// The static profile's CSS rules (SDD-01, pack 05 §5), checked with a CSS parser (css-tree), never with patterns over
// the text. It fails closed: CSS that does not parse cleanly, an escaped name (escapes belong in strings only), a
// `url()` in any form, an at-rule, a value function or a pseudo-element outside the allowlists, or a binding property
// is refused. Nothing here judges whether the CSS is good design.

import { parse, walk, type CssNode } from 'css-tree'
import { error, type Finding } from './findings.ts'
import { windowIssue } from './widths.ts'

/**
 * At-rules a static research page may use. `@import`, `@font-face`, `@namespace`, `@charset` and the rest are refused,
 * and so is `@keyframes`: the page is static (#117). `@supports` parses, to be refused by name (queryIssue).
 */
const AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'page'])

/**
 * Pseudo-elements a page may style: generated content, held to marks below (::before, ::after, ::marker), the reader's
 * own selection, and a summary's disclosure marker. Every other one styles part of a text, or a box around it, apart
 * from the element the render measures: `::first-line { color: transparent }` hides a heading whose element still
 * measures whole, and `::details-content` can fade a disclosure's text where no ancestor shows it (#117). The legacy
 * one-colon forms (`:first-line`, `:first-letter`) are pseudo-elements too.
 */
const PSEUDO_ELEMENTS = new Set(['before', 'after', 'marker', 'selection', '-webkit-details-marker'])
const LEGACY_PSEUDO_ELEMENTS = new Set(['first-line', 'first-letter'])
const pseudoIssue = (name: string): string =>
  `::${name} styles part of a text apart from the element the render measures, so a capture could lack what the ` +
  'measures pass; style the element itself (generated content is ::before, ::after or ::marker)'

/** Value functions that compute or select; none can load a resource. */
const FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
  'calc',
  'min',
  'max',
  'clamp',
  'var',
  'env',
  'attr',
  'counter',
  'counters',
  'minmax',
  'repeat',
  'fit-content',
  'linear-gradient',
  'radial-gradient',
  'conic-gradient',
  'repeating-linear-gradient',
  'repeating-radial-gradient',
  'repeating-conic-gradient',
  'translate',
  'translatex',
  'translatey',
  'rotate',
  'scale',
  'scalex',
  'scaley',
  'skew',
  'skewx',
  'skewy',
  'matrix',
  'cubic-bezier',
  'steps',
  'round',
  'mod',
  'rem',
  'abs',
  'sign',
])

/** Properties that bind behaviour in old engines. */
const BINDINGS = new Set(['behavior', '-moz-binding', '-ms-behavior'])
/**
 * The prefixes of properties only other engines read: the captures are taken in Chromium, which drops them, so what one
 * draws in Firefox, or an old Edge or Opera, no capture shows (#117).
 */
const FOREIGN = /^-(?:moz|ms|o|khtml)-/
/**
 * Text decorations, drawn over the text they decorate: a line through it crosses every glyph, and a decoration of a
 * thickness or an offset of its own can be as thick as a glyph, or raised over it. In the background's colour, one
 * buries a heading whose fill, which the render reads, stays readable (#117). So no line through a text in any rule,
 * no line over it in a rule for a state no capture takes (an underline marks a link), and in every rule a decoration
 * at the font's own thickness and place: keywords and colours only. Three lines 6px thick in the background's colour,
 * on `:target`, would strike a block out once a link to it is followed, where no capture shows it (#117).
 */
const DECORATION_LINES = /^(?:-webkit-)?text-decoration(?:-line)?$/
const DECORATION_LENGTHS = /^(?:-webkit-)?text-(?:decoration-thickness|underline-offset)$/
const DECORATION_KEYWORDS = new Set(['auto', 'from-font', 'initial', 'inherit', 'unset', 'revert', 'revert-layer'])
/**
 * Properties that change the page over time: what the captures show at load would not be what a reader sees a moment
 * later, so a static page has none (#117).
 */
const MOTION = /^(?:-webkit-)?(?:animation|transition)(?:-|$)/
/** Properties that draw text as other marks: what a capture shows would not be the text a reader is given. */
const MASKS = new Set(['-webkit-text-security', 'text-security'])
/**
 * Masks, in every form: a mask draws an element partly or wholly transparent while its box, colour and opacity, which
 * the render measures, stay whole, so a heading a mask hides would measure as shown (#117).
 */
const MASKING = /^(?:-webkit-)?mask(?:-|$)/
/**
 * A text stroke outlines each glyph in a colour of its own, over its fill: a thick one in the background's colour buries
 * the text while its fill, which the render reads for contrast, stays readable (#117).
 */
const STROKES = /^(?:-webkit-)?text-stroke(?:-|$)/
/**
 * Properties that change what a pointer reaches, not what is drawn. A static page has no pointer behaviour, and the
 * render finds what is drawn over a text by what a point there reaches: `pointer-events: none` would hide a cover from
 * it (#117).
 */
const POINTER = new Set(['pointer-events'])
/**
 * The positions an element may take: in the flow, or placed against a box of the page, and the keywords every property
 * takes. A fixed or sticky element is pinned to the window as the reader scrolls: the captures show it where the page
 * starts, and a reader would see it move over text no capture shows it over (#117). Any other value, a function
 * included, is refused.
 */
const POSITIONS = new Set(['static', 'relative', 'absolute', 'initial', 'inherit', 'unset', 'revert', 'revert-layer'])

/** Whether a `position` declaration's value is one keyword POSITIONS allows. */
function isPlacedOnPage(value: CssNode): boolean {
  const parts: CssNode[] = []
  walk(value, (part) => {
    if (part.type !== 'Value') parts.push(part)
  })
  const [only] = parts
  return parts.length === 1 && only?.type === 'Identifier' && POSITIONS.has(only.name.toLowerCase())
}

/**
 * The colour schemes a page may ask for: the light one the captures are taken in. A page that offers a dark scheme is
 * drawn in other colours for a reader who prefers it, where no capture shows them (#117); `light-dark()` is not a
 * value function for the same reason.
 */
const SCHEMES = new Set(['normal', 'light', 'only', 'initial', 'inherit', 'unset', 'revert', 'revert-layer'])

/** Whether a `color-scheme` declaration's value asks for the light scheme only. */
function isLightOnly(value: CssNode): boolean {
  const parts: CssNode[] = []
  walk(value, (part) => {
    if (part.type !== 'Value') parts.push(part)
  })
  return parts.length > 0 && parts.every((p) => p.type === 'Identifier' && SCHEMES.has(p.name.toLowerCase()))
}

/**
 * What a media or container query may test: the screen, and the width of it or of a container. The captures are taken
 * on a screen at two widths, in the light scheme with reduced motion; a rule for print, a dark or forced scheme, motion,
 * a pointer, an orientation, a height or any other condition applies where no capture shows it, so
 * `@media print { [data-block] { display: none } }` would drop the research from every printed page (#117).
 */
const MEDIA_TYPES = new Set(['screen', 'all'])
const WIDTHS = new Set(['width', 'min-width', 'max-width', 'inline-size', 'min-inline-size', 'max-inline-size'])

/** The medium a media query names, when the captures are not taken in it (print, or every medium but one), or null. */
function mediumIssue(modifier: string | null, mediaType: string | null): string | null {
  if (modifier?.toLowerCase() === 'not') return `not ${mediaType ?? ''}`.trim()
  return mediaType && !MEDIA_TYPES.has(mediaType.toLowerCase()) ? mediaType : null
}

/** The feature a range (`(width >= 40em)`) compares, when it is not a width, or null. */
function rangeIssue(range: CssNode): string | null {
  const names: string[] = []
  walk(range, (n) => {
    if (n.type === 'Identifier') names.push(n.name)
  })
  const other = names.find((n) => !WIDTHS.has(n.toLowerCase()))
  return other === undefined ? null : `(${other})`
}

/** What one part of a media or container query tests that no capture shows, or null. */
function uncaptured(part: CssNode): string | null {
  if (part.type === 'MediaQuery') return mediumIssue(part.modifier, part.mediaType)
  if (part.type === 'Feature') return WIDTHS.has(part.name.toLowerCase()) ? null : `(${part.name})`
  if (part.type === 'FeatureRange') return rangeIssue(part)
  return part.type === 'GeneralEnclosed' || part.type === 'FeatureFunction' ? 'a condition of its own' : null
}

/**
 * The values `text-shadow` may take: none, or a keyword that resets it. A text shadow is drawn from the glyphs out,
 * past the text's own box and over whatever lies there: a heading's white, blurred shadows cast 80px up wash a block
 * above it out, and neither a point the render reaches nor the block's contrast sees them (#117). Any other value, a
 * variable included, is refused.
 */
const SHADOWLESS = new Set(['none', 'initial', 'inherit', 'unset', 'revert', 'revert-layer'])

/**
 * The values a blend or a filter may take: none, or a keyword that resets it. A blend mode (`mix-blend-mode`,
 * `background-blend-mode`) or a filter (`filter`, `backdrop-filter`) changes the colours text is drawn in after its
 * styles give them: `mix-blend-mode: screen` draws black research white on white, and `filter: opacity(0)`,
 * `brightness(0)` or `invert(1)` hide or recolour it, while the render can only report the contrast as unknown, which
 * the gate takes as a limitation, not a failure (#117). Any other value, a variable included, is refused.
 */
const UNBLENDED = new Set(['normal', 'initial', 'inherit', 'unset', 'revert', 'revert-layer'])
const UNFILTERED = new Set(['none', 'initial', 'inherit', 'unset', 'revert', 'revert-layer'])
const PAINT_MODES: Readonly<Record<string, ReadonlySet<string>>> = {
  'mix-blend-mode': UNBLENDED,
  'background-blend-mode': UNBLENDED,
  filter: UNFILTERED,
  '-webkit-filter': UNFILTERED,
  'backdrop-filter': UNFILTERED,
  '-webkit-backdrop-filter': UNFILTERED,
}

/** Whether a value is one or more keywords of `allowed`, separated by commas (`normal, normal` for each layer). */
function isKeywordList(value: CssNode, allowed: ReadonlySet<string>): boolean {
  const parts: CssNode[] = []
  walk(value, (part) => {
    if (part.type !== 'Value' && !(part.type === 'Operator' && part.value.trim() === ',')) parts.push(part)
  })
  return parts.length > 0 && parts.every((p) => p.type === 'Identifier' && allowed.has(p.name.toLowerCase()))
}

/** Why a blend or a filter is refused (PAINT_MODES), or null. */
function paintModeIssue(property: string, node: CssNode & { type: 'Declaration' }): string | null {
  const allowed = PAINT_MODES[property]
  if (!allowed || isKeywordList(node.value, allowed)) return null
  const keyword = allowed === UNBLENDED ? 'normal' : 'none'
  return (
    `${node.property} may only be ${keyword}: a blend or a filter changes the colours text is drawn in, so the render ` +
    'cannot read its contrast (screen draws black text white on white)'
  )
}

/**
 * The values `unicode-bidi` may take: those that set or isolate a direction. `bidi-override` and `isolate-override`
 * draw a text's characters in the order the direction gives, so "12.50" under `direction: rtl` is drawn "05.21" while
 * every check reads "12.50" (#117).
 */
const BIDI = new Set([
  'normal',
  'embed',
  'isolate',
  'plaintext',
  'initial',
  'inherit',
  'unset',
  'revert',
  'revert-layer',
])

/** Whether a declaration's value is one keyword of `allowed`. */
function isOneOf(value: CssNode, allowed: ReadonlySet<string>): boolean {
  const parts: CssNode[] = []
  walk(value, (part) => {
    if (part.type !== 'Value') parts.push(part)
  })
  const [only] = parts
  return parts.length === 1 && only?.type === 'Identifier' && allowed.has(only.name.toLowerCase())
}

/** Why a declaration's value is refused, for the properties held to keywords (`color-scheme`, `position`), or null. */
function keywordIssue(property: string, node: CssNode & { type: 'Declaration' }): string | null {
  if (property === 'text-shadow' && !isOneOf(node.value, SHADOWLESS))
    return `${node.property} may only be none: a shadow is drawn past the text, over what lies beside it, where neither a cover nor a contrast is read`
  if (property === 'unicode-bidi' && !isOneOf(node.value, BIDI))
    return `${node.property} may set or isolate a direction, not override it: an override draws a text's characters in another order than the one read`
  if (property === 'color-scheme' && !isLightOnly(node.value))
    return `${node.property} may ask for the light scheme only: the captures are taken in it, and a dark one is drawn where no capture shows it`
  if (property === 'position' && !isPlacedOnPage(node.value))
    return `${node.property} may be static, relative or absolute: a fixed or sticky element moves over the text as a reader scrolls, where no capture shows it`
  return paintModeIssue(property, node)
}

/**
 * The pseudo-classes a page may select by: an element's place in the document, which every reader and every capture
 * see alike. Every other one selects a state the captures never take: a pointer over it, focus, a followed fragment
 * (`:target`), a visited or unvisited link (`:link`, `:visited`; `:any-link` is either), an opened disclosure. So does
 * an attribute a reader changes (`[open]`). A rule for such a state may only mark it (STATE_PROPERTIES): it never
 * changes what a text says, where it is, or how it reads, as `[data-block]:target { display: none }` would (#117).
 */
const PLACE_PSEUDO_CLASSES = new Set([
  'root',
  'first-child',
  'last-child',
  'only-child',
  'nth-child',
  'nth-last-child',
  'first-of-type',
  'last-of-type',
  'only-of-type',
  'nth-of-type',
  'nth-last-of-type',
  'not',
  'is',
  'where',
  'has',
  'empty',
  'any-link',
  'lang',
  'dir',
  'scope',
  'defined',
  // The legacy one-colon pseudo-elements that draw generated content, which parse as pseudo-classes.
  'before',
  'after',
])
const STATE_ATTRIBUTES = new Set(['open'])
/**
 * What a rule for a state may set: an outline, drawn outward, and an underline at the font's own thickness and place
 * (decorationIssue), the marks of focus and of a link.
 */
const STATE_PROPERTIES = new Set([
  'outline',
  'outline-color',
  'outline-style',
  'outline-width',
  'outline-offset',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-color',
  'text-decoration-style',
  'text-decoration-thickness',
  'text-underline-offset',
])
/**
 * The longest length a state's mark may take, in pixels, and never inward: a mark, never a cover. An outline drawn
 * outward still crosses the text beside its box: 6px wide, 6px out, it buried half of the next line of a 12px block
 * (#117, SDD-01-CX-0041). So it is held to a stroke: the width of an outline that names none (`medium`, 3px), and as
 * far out.
 */
const STATE_PX = 3
const COLOR_FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
])

/** Whether a selector, anywhere in it (`:not()`, `:is()`, `:has()` included), selects a state the captures never take. */
function selectsState(prelude: CssNode): boolean {
  const states: string[] = []
  walk(prelude, (n) => {
    if (n.type === 'PseudoClassSelector' && !PLACE_PSEUDO_CLASSES.has(n.name.toLowerCase())) states.push(n.name)
    if (n.type === 'AttributeSelector' && STATE_ATTRIBUTES.has(n.name.name.toLowerCase())) states.push(n.name.name)
  })
  return states.length > 0
}

/** What a declaration in a rule for a state sets beyond a mark of a few pixels, or null. */
function stateDeclarationIssue(node: CssNode): string | null {
  if (node.type !== 'Declaration') return null
  if (!STATE_PROPERTIES.has(node.property.toLowerCase())) return node.property
  const found: string[] = []
  walk(node.value, (part) => {
    const px = part.type === 'Dimension' && part.unit.toLowerCase() === 'px' ? Number(part.value) : Number.NaN
    if (part.type === 'Dimension' && !(px >= 0 && px <= STATE_PX)) found.push(`${part.value}${part.unit}`)
    if (part.type === 'Percentage') found.push(`${part.value}%`)
    if (part.type === 'Function' && !COLOR_FUNCTIONS.has(part.name.toLowerCase())) found.push(`${part.name}()`)
  })
  return found[0] ?? null
}

/** Why a rule for a state the captures never take is refused, or null (selectsState). */
function stateRuleIssue(node: CssNode): string | null {
  if (node.type !== 'Rule' || !selectsState(node.prelude)) return null
  const found: string[] = []
  walk(node.block, (part) => {
    const issue = stateDeclarationIssue(part)
    if (issue) found.push(issue)
  })
  return found.length === 0
    ? null
    : `a rule for a state no capture takes (a pointer, focus, :target, a link visited or not, an open disclosure) ` +
        `may only mark it with an outline of at most ${STATE_PX}px, drawn outward, or an underline, not ${found[0] ?? ''}; ` +
        'select by place (:first-child, :nth-of-type(), :is(), :has()...) or :any-link otherwise'
}

/** The declarations in rules for a state the captures never take (selectsState), nested rules included. */
function stateDeclarations(ast: CssNode): Set<CssNode> {
  const out = new Set<CssNode>()
  walk(ast, (node) => {
    if (node.type === 'Rule' && selectsState(node.prelude))
      walk(node.block, (inner) => {
        if (inner.type === 'Declaration') out.add(inner)
      })
  })
  return out
}

/** Whether one part of a decoration's value is a keyword, a colour, or a colour function. */
function isKeywordOrColour(part: CssNode, keywords: ReadonlySet<string> | null): boolean {
  if (part.type === 'Identifier') return keywords === null || keywords.has(part.name.toLowerCase())
  if (keywords !== null) return false
  return part.type === 'Hash' || (part.type === 'Function' && COLOR_FUNCTIONS.has(part.name.toLowerCase()))
}

/**
 * An outline is drawn over what its band crosses, its own text included when it is drawn inward, and no hit test meets
 * it, so the render cannot tell it covers a text. In every rule, not only a state's, it is a mark (STATE_PX wide and
 * out at most, never inward): a state takes its outline's width and offset from the cascade, so `outline-offset: -6px`
 * with `outline-style: none` in a plain rule drew nothing in the captures, then `:target { outline: 6px solid }` drew
 * a 6px outline inward over the whole block; `outline-offset: inherit` brought a parent's in (#117, SDD-CX42).
 */
const OUTLINE_KEYWORDS: Readonly<Record<string, ReadonlySet<string> | null>> = {
  outline: null,
  'outline-width': new Set(['thin', 'medium', 'initial', 'inherit', 'unset', 'revert', 'revert-layer']),
  'outline-offset': new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer']),
}

/** What a length in an outline's value gives that is not a mark, or null: a length in pixels, 0 to STATE_PX. */
function outlineLengthIssue(part: CssNode & { type: 'Dimension' }): string | null {
  const px = part.unit.toLowerCase() === 'px' ? Number(part.value) : Number.NaN
  return px >= 0 && px <= STATE_PX ? null : `${part.value}${part.unit}`
}

/** Whether a part of the `outline` shorthand is a colour: a hash or a colour function. */
const isColour = (part: CssNode): boolean =>
  part.type === 'Hash' || (part.type === 'Function' && COLOR_FUNCTIONS.has(part.name.toLowerCase()))

/** What one part of an outline's value gives that is not a mark, or null. */
function outlinePartIssue(part: CssNode, keywords: ReadonlySet<string> | null): string | null {
  if (part.type === 'Dimension') return outlineLengthIssue(part)
  if (part.type === 'Number') return Number(part.value) === 0 ? null : part.value
  if (part.type === 'Identifier') {
    const name = part.name.toLowerCase()
    return (keywords === null ? name !== 'thick' : keywords.has(name)) ? null : part.name
  }
  if (keywords === null && isColour(part)) return null
  return part.type === 'Function' ? `${part.name}()` : part.type
}

/** Why an outline in any rule is more than a mark, or null (OUTLINE_KEYWORDS). */
function outlineIssue(node: CssNode): string | null {
  if (node.type !== 'Declaration') return null
  const keywords = OUTLINE_KEYWORDS[node.property.toLowerCase()]
  if (keywords === undefined) return null
  const parts = node.value.type === 'Value' ? node.value.children.toArray() : [node.value]
  const found = parts.map((part) => outlinePartIssue(part, keywords)).find((issue) => issue !== null)
  return found === undefined
    ? null
    : `${node.property} is a mark, at most ${String(STATE_PX)}px wide and ${String(STATE_PX)}px out, never inward, ` +
        `not ${found}: an outline is drawn over the text it crosses, and no hit test meets it`
}

/** The keywords among a value's parts, in lower case. */
const keywordsIn = (parts: readonly CssNode[]): string[] =>
  parts.flatMap((p) => (p.type === 'Identifier' ? [p.name.toLowerCase()] : []))

/** Why a text decoration may be drawn over the text, or null (DECORATION_LINES): in a rule for a state or not. */
function decorationIssue(node: CssNode, inState: boolean): string | null {
  if (node.type !== 'Declaration') return null
  const property = node.property.toLowerCase()
  const lines = DECORATION_LINES.test(property)
  if (!lines && !DECORATION_LENGTHS.test(property)) return null
  const parts = node.value.type === 'Value' ? node.value.children.toArray() : [node.value]
  const drawn = lines ? keywordsIn(parts) : []
  if (drawn.includes('line-through'))
    return `${node.property} may not draw a line through the text: it crosses every glyph, and can bury them`
  if (inState && drawn.includes('overline'))
    return `${node.property} in a rule for a state no capture takes may underline only, not draw a line over the text`
  if (parts.every((p) => isKeywordOrColour(p, lines ? null : DECORATION_KEYWORDS))) return null
  return (
    `${node.property} may take keywords and colours only: a decoration of a thickness or an offset of its own can ` +
    "cover the text it decorates; the font's own is drawn beneath it"
  )
}

/**
 * The window widths the render's width sweep measures between, and the most breakpoints it measures (#117, CX-0039):
 * the same as the capture kernel's (capture-html.mjs SWEEP), which a test holds equal. Between two breakpoints a page's
 * media queries hold or fail alike, so the render measures both ends of every band they make; a width in another unit
 * (an em moves with the reader's font size), past those widths, or computed is one it cannot bound.
 */
export const SWEEP_WIDTHS = Object.freeze({ min: 320, max: 2560, breakpoints: 8 })

/** What a width a media query names gives that the render cannot measure, or null. */
function widthIssue(part: CssNode): string | null {
  if (part.type === 'Function') return `a width is a length in pixels, not ${part.name}()`
  if (part.type === 'Number') return `a width is a length in pixels, not ${part.value}`
  if (part.type !== 'Dimension') return null
  if (part.unit.toLowerCase() !== 'px')
    return `${part.value}${part.unit}: a width is a length in pixels, as the window's`
  const px = Number(part.value)
  return px >= SWEEP_WIDTHS.min && px <= SWEEP_WIDTHS.max
    ? null
    : `${part.value}px is past the ${SWEEP_WIDTHS.min}–${SWEEP_WIDTHS.max}px the render measures between`
}

/**
 * Why a media query reaches a state no capture shows, or a width the render cannot measure, or null. A container
 * query is refused: a container's width is not the window's, so no window width the render measures settles it (#117).
 */
function queryIssue(node: CssNode): string | null {
  if (node.type !== 'Atrule') return null
  if (node.name.toLowerCase() === 'container')
    return "@container tests a container's width, which no window width the render measures settles; test the window's"
  // The captures are taken in one engine, which takes one branch: another browser takes the other, which no capture
  // shows, as `@supports (-webkit-touch-callout: none) { [data-block] { display: none } }` would on Safari (#117).
  if (node.name.toLowerCase() === 'supports')
    return "@supports chooses CSS by the browser: the captures show one engine's choice, and another takes the other"
  if (node.name.toLowerCase() !== 'media' || !node.prelude) return null
  const found: string[] = []
  const widths: string[] = []
  walk(node.prelude, (part) => {
    const issue = uncaptured(part)
    if (issue) found.push(issue)
    const width = widthIssue(part)
    if (width) widths.push(width)
  })
  if (found.length > 0)
    return (
      `@${node.name} tests ${found[0] ?? ''}: the captures are taken on a screen at two widths, in the light scheme, ` +
      'so a rule for any other condition applies where no capture shows it; a query tests the width only'
    )
  return widths.length > 0 ? `@${node.name}: ${widths[0] ?? ''}` : null
}

/**
 * The widths a stylesheet's media queries name, in pixels: the breakpoints the render's sweep measures around. A
 * stylesheet that does not parse names none here; checkCss refuses it.
 */
export function mediaWidths(css: string): number[] {
  const out: number[] = []
  let ast: CssNode
  try {
    ast = parse(css, { context: 'stylesheet' })
  } catch {
    return out
  }
  walk(ast, (node) => {
    if (node.type !== 'Atrule' || node.name.toLowerCase() !== 'media' || !node.prelude) return
    walk(node.prelude, (part) => {
      if (part.type === 'Dimension' && part.unit.toLowerCase() === 'px') out.push(Number(part.value))
    })
  })
  return out
}

/** The longest stylesheet a source may hold. */
export const CSS_BYTES = 131_072

type Check = (node: CssNode) => string | null

const nameIssue = (kind: string, name: string): string | null =>
  name.includes('\\') ? `an escaped ${kind} name (${name}) is not allowed; escapes belong inside strings` : null

/**
 * Properties that can draw text of their own (SDD-01-CX-0019 F2): only the research's text is shown, so these draw no
 * text: keywords only (a quote keyword, a bullet), and no string but an empty one (`content: ""` for a decorative box).
 * A mark drawn beside the research's text reads as part of it, which the page's own text does not show: `-` before a
 * block's "10%" makes it "-10%", brackets around a figure make it negative (#117). The marks that say nothing stay
 * open to the page's own markup (framing.ts), where the render measures what lies beside a block. No value may come
 * from elsewhere: `attr()`, `var()` or `env()`, and no counter: a generated number is content no block holds, in any
 * style (#117, CX-0038). A list marker draws a bullet only: its number would be its item's place on the page, which no
 * block holds and which items the page adds (empty, or hidden) can move (#117); the profile has no `<ol>` for the same
 * reason. The same in every media (print included), in a stylesheet and in a style attribute.
 */
const TEXT_PROPERTIES = new Set([
  'content',
  'quotes',
  'list-style',
  'list-style-type',
  'text-overflow',
  'hyphenate-character',
  '-webkit-hyphenate-character',
  'text-emphasis',
  'text-emphasis-style',
  '-webkit-text-emphasis',
  '-webkit-text-emphasis-style',
])
/**
 * The marks that say nothing, whatever stands beside them (#117): separators, bullets, arrows, quote marks, brackets,
 * dashes and footnote marks. A list, not a class: a letter-shaped symbol (Ⓗ, 🄷, ℍ), a number sign, a currency,
 * percent, mathematical or check mark, or one that combines with its neighbour, is none of them; so a row of them, in
 * one string or several, side by side, still says nothing.
 */
const MARK_TEXT = /^[.,;:/|()[\]'"*\-_‐‑‒–—―…·•◦‣⁃∙▪▫■□●○◆◇▴▵▾▿→←↑↓↗↘↩⇒⇐›‹»«▸▹►▶▷◂◀◁“”‘’„‚†‡§¶]*$/u

/** Whether a text is white space and at most `max` of the marks that say nothing. */
export function onlyMarks(text: string, max: number): boolean {
  const marks = text.replace(/\s+/gu, '')
  // Each mark is one UTF-16 unit, so once every one is a mark the length counts them.
  return MARK_TEXT.test(marks) && marks.length <= max
}
/**
 * Properties that choose the numbers a list draws. A list's numbers follow its items; a page that sets them can number
 * an item, or append to a block, a value no block holds (#117).
 */
const COUNTERS = new Set(['counter-reset', 'counter-set', 'counter-increment'])
/** The counter styles a list marker may draw in: bullets, which spell and number nothing. */
export const COUNTER_STYLES: ReadonlySet<string> = new Set([
  'disc',
  'circle',
  'square',
  'disclosure-open',
  'disclosure-closed',
  'none',
])
/** What else a list-style may say: where its marker sits, and the keywords every property takes. */
const LIST_KEYWORDS = new Set([
  ...COUNTER_STYLES,
  'inside',
  'outside',
  'initial',
  'inherit',
  'unset',
  'revert',
  'revert-layer',
])

/** What one part of a text property's value draws that is not decoration, or null. */
function partIssue(property: string, part: CssNode, list: boolean): string | null {
  if (part.type === 'String')
    return part.value === ''
      ? null
      : `${property} may draw no text of its own, not ${JSON.stringify(part.value.slice(0, 40))}: a mark beside the ` +
          "research's text reads as part of it; write marks in the page"
  if (part.type === 'Function')
    return /^counters?$/i.test(part.name)
      ? `${property} may not draw ${part.name}(): a generated number, in any style, is content no block holds`
      : `${property} may not draw ${part.name}(): only the research's text is shown`
  if (list && part.type === 'Identifier' && !LIST_KEYWORDS.has(part.name.toLowerCase()))
    return `${property} may draw bullets only, not ${part.name}: it can spell words or number an item`
  return null
}

function generatedTextIssue(node: CssNode): string | null {
  if (node.type !== 'Declaration') return null
  const property = node.property.toLowerCase()
  if (MASKS.has(property)) return `${node.property} draws text as other marks: a capture would not show the text`
  if (!TEXT_PROPERTIES.has(property)) return null
  const list = property === 'list-style' || property === 'list-style-type'
  const parts: CssNode[] = []
  walk(node.value, (part) => {
    parts.push(part)
  })
  return parts.map((part) => partIssue(node.property, part, list)).find((i) => i !== null) ?? null
}

const CHECKS: Partial<Record<CssNode['type'], Check>> = {
  Url: () => 'url() loads a resource; the static profile allows none',
  Raw: (node) => (node.type === 'Raw' ? `CSS the parser could not read (${node.value.slice(0, 40)})` : null),
  Atrule: (node) => {
    if (node.type !== 'Atrule') return null
    return (
      nameIssue('at-rule', node.name) ??
      (AT_RULES.has(node.name.toLowerCase()) ? queryIssue(node) : `@${node.name} is not allowed`)
    )
  },
  Rule: stateRuleIssue,
  PseudoElementSelector: (node) =>
    node.type === 'PseudoElementSelector' && !PSEUDO_ELEMENTS.has(node.name.toLowerCase())
      ? pseudoIssue(node.name)
      : null,
  PseudoClassSelector: (node) =>
    node.type === 'PseudoClassSelector' && LEGACY_PSEUDO_ELEMENTS.has(node.name.toLowerCase())
      ? pseudoIssue(node.name)
      : null,
  Function: (node) => {
    if (node.type !== 'Function') return null
    return (
      nameIssue('function', node.name) ??
      (FUNCTIONS.has(node.name.toLowerCase()) ? null : `${node.name}() is not allowed`)
    )
  },
  Declaration: (node) => {
    if (node.type !== 'Declaration') return null
    const problem = nameIssue('property', node.property) ?? generatedTextIssue(node)
    if (problem) return problem
    const property = node.property.toLowerCase()
    if (FOREIGN.test(property))
      return `${node.property} is read only by other engines: the captures, taken in Chromium, show none of it`
    if (MASKING.test(property))
      return `${node.property} draws what it masks as transparent; the render would measure it as shown`
    if (MOTION.test(property))
      return `${node.property} changes the page after it is captured; a static page has no motion`
    if (STROKES.test(property))
      return `${node.property} outlines the text in a colour of its own; the render reads the contrast of its fill`
    if (COUNTERS.has(property)) return `${node.property} chooses the numbers a list draws; they follow its items`
    if (POINTER.has(property)) return `${node.property} changes what a pointer reaches; a static page has no pointer`
    return (
      keywordIssue(property, node) ??
      (BINDINGS.has(property) ? `${node.property} binds behaviour and is not allowed` : null)
    )
  },
}

/**
 * Check CSS text as a stylesheet, or as a `style` attribute's declarations.
 * @param path - where the CSS lives, for findings (`styles.css`, `index.html`).
 * @param baseLine - the line the CSS starts on in that file (1 for a file of its own).
 */
export function checkCss(
  css: string,
  path: string,
  context: 'stylesheet' | 'declarationList',
  baseLine = 1,
): Finding[] {
  const findings: Finding[] = []
  const at = (line: number | undefined) => ({ line: baseLine + (line ?? 1) - 1 })
  if (Buffer.byteLength(css, 'utf8') > CSS_BYTES)
    return [error('css_too_large', path, `CSS is limited to ${CSS_BYTES} bytes`)]
  // Compiled into a <style> element, these would close it (or open markup) whatever the parser thinks of the CSS.
  if (/<\/?style|<!--|-->/i.test(css))
    return [error('css_breakout', path, 'CSS may not contain </style, <style, <!-- or -->', { line: baseLine })]
  const ast = parse(css, {
    context,
    positions: true,
    parseCustomProperty: true,
    onParseError: (e) => findings.push(error('css_invalid', path, `CSS does not parse: ${e.message}`, at(e.line))),
  })
  const states = stateDeclarations(ast)
  walk(ast, (node) => {
    const problem =
      CHECKS[node.type]?.(node) ?? decorationIssue(node, states.has(node)) ?? outlineIssue(node) ?? windowIssue(node)
    if (problem) findings.push(error('css_unsafe', path, problem, at(node.loc?.start.line)))
  })
  return findings
}
