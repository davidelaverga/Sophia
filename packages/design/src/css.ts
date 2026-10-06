// The static profile's CSS rules (SDD-01, pack 05 §5), checked with a CSS parser (css-tree), never with patterns over
// the text. It fails closed: CSS that does not parse cleanly, an escaped name (escapes belong in strings only), a
// `url()` in any form, an at-rule, a value function or a pseudo-element outside the allowlists, or a binding property
// is refused. Nothing here judges whether the CSS is good design.

import { parse, walk, type CssNode } from 'css-tree'
import { error, type Finding } from './findings.ts'

/**
 * At-rules a static research page may use. `@import`, `@font-face`, `@namespace`, `@charset` and the rest are refused,
 * and so is `@keyframes`: the page is static (#117).
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

/** Why a declaration's value is refused, for the properties held to keywords (`color-scheme`, `position`), or null. */
function keywordIssue(property: string, node: CssNode & { type: 'Declaration' }): string | null {
  if (property === 'color-scheme' && !isLightOnly(node.value))
    return `${node.property} may ask for the light scheme only: the captures are taken in it, and a dark one is drawn where no capture shows it`
  if (property === 'position' && !isPlacedOnPage(node.value))
    return `${node.property} may be static, relative or absolute: a fixed or sticky element moves over the text as a reader scrolls, where no capture shows it`
  return null
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
/** What a rule for a state may set: an outline and a text decoration, the marks of focus and of a link. */
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
/** The longest length a state's mark may take, in pixels: a mark, never a cover. */
const STATE_PX = 6
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
    if (part.type === 'Dimension' && !(part.unit.toLowerCase() === 'px' && Math.abs(Number(part.value)) <= STATE_PX))
      found.push(`${part.value}${part.unit}`)
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
        `may only mark it with an outline or a text decoration of at most ${STATE_PX}px, not ${found[0] ?? ''}; ` +
        'select by place (:first-child, :nth-of-type(), :is(), :has()...) or :any-link otherwise'
}

/** Why a media or container query reaches a state no capture shows, or null. */
function queryIssue(node: CssNode): string | null {
  if (node.type !== 'Atrule' || !['media', 'container'].includes(node.name.toLowerCase()) || !node.prelude) return null
  const found: string[] = []
  walk(node.prelude, (part) => {
    const issue = uncaptured(part)
    if (issue) found.push(issue)
  })
  return found.length === 0
    ? null
    : `@${node.name} tests ${found[0] ?? ''}: the captures are taken on a screen at two widths, in the light scheme, ` +
        'so a rule for any other condition applies where no capture shows it; a query tests the width only'
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
  walk(ast, (node) => {
    const problem = CHECKS[node.type]?.(node)
    if (problem) findings.push(error('css_unsafe', path, problem, at(node.loc?.start.line)))
  })
  return findings
}
