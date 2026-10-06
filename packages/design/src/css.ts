// The static profile's CSS rules (SDD-01, pack 05 §5), checked with a CSS parser (css-tree), never with patterns over
// the text. It fails closed: CSS that does not parse cleanly, an escaped name (escapes belong in strings only), a
// `url()` in any form, an at-rule or a value function outside the allowlists, or a binding property is refused. Nothing
// here judges whether the CSS is good design.

import { parse, walk, type CssNode } from 'css-tree'
import { error, type Finding } from './findings.ts'

/** At-rules a static research page may use. `@import`, `@font-face`, `@namespace`, `@charset` and the rest are refused. */
const AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'page', 'keyframes'])

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
  'light-dark',
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

/** The longest stylesheet a source may hold. */
export const CSS_BYTES = 131_072

type Check = (node: CssNode) => string | null

const nameIssue = (kind: string, name: string): string | null =>
  name.includes('\\') ? `an escaped ${kind} name (${name}) is not allowed; escapes belong inside strings` : null

/**
 * Properties that can draw text of their own (SDD-01-CX-0019 F2): only the research's text is shown, so these may draw
 * decoration only: keywords, counters, and strings of at most two characters that are neither letters nor digits
 * (a bullet, a quote mark, an arrow). No value may come from elsewhere: `attr()`, `var()` or `env()`.
 */
const TEXT_PROPERTIES = new Set(['content', 'quotes', 'list-style', 'list-style-type', 'text-overflow'])
const DECORATION = /^[^\p{L}\p{N}]{0,2}$/u
const TEXT_FUNCTIONS = new Set(['counter', 'counters'])

function generatedTextIssue(node: CssNode): string | null {
  if (node.type !== 'Declaration' || !TEXT_PROPERTIES.has(node.property.toLowerCase())) return null
  let issue: string | null = null
  walk(node.value, (part) => {
    if (issue) return
    if (part.type === 'String' && !DECORATION.test(part.value))
      issue = `${node.property} may draw decoration only, not the text ${JSON.stringify(part.value.slice(0, 40))}`
    else if (part.type === 'Function' && !TEXT_FUNCTIONS.has(part.name.toLowerCase()))
      issue = `${node.property} may not draw ${part.name}(): only the research's text is shown`
  })
  return issue
}

const CHECKS: Partial<Record<CssNode['type'], Check>> = {
  Url: () => 'url() loads a resource; the static profile allows none',
  Raw: (node) => (node.type === 'Raw' ? `CSS the parser could not read (${node.value.slice(0, 40)})` : null),
  Atrule: (node) => {
    if (node.type !== 'Atrule') return null
    return (
      nameIssue('at-rule', node.name) ?? (AT_RULES.has(node.name.toLowerCase()) ? null : `@${node.name} is not allowed`)
    )
  },
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
    return BINDINGS.has(node.property.toLowerCase()) ? `${node.property} binds behaviour and is not allowed` : null
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
