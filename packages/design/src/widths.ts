// How a CSS value moves as the window widens (#117). The render measures each band of window widths a page's media
// queries make at its two ends (capture-html's sweep, CX-0039). A value that only grows, or only shrinks, as the
// window widens lies between its values at a band's ends, so the ends bound it. One that does both does not:
// `height: max(1px, calc(1440px - 100vw), calc(100vw - 1440px))` on a clipped block passes at 320, 390, 1280 and
// 2560px and hides the block at 1440px, with no breakpoint there. So the profile refuses a value whose arithmetic
// moves both ways with the window (or that a page's attribute supplies, which it cannot read), a custom property that
// carries a length moving with the window into arithmetic it cannot see, and the units of what no capture or sweep
// varies: the window's height and a container's size. This reads each value's own arithmetic only: layout that
// changes inside a band for other reasons (wrapping, an auto-fit grid's columns, a box moving past another) is a
// stated limit, not proven here.

import { walk, type CssNode } from 'css-tree'

/** Which way a value moves as the window widens: not at all, up, down, or both ways (or a way that cannot be read). */
type Way = 'flat' | 'up' | 'down' | 'both'

/** Units of the window's width. A percentage is taken as one too: a share of a box that widens with the window. */
const WIDTH_UNITS = new Set(['vw', 'vi', 'svw', 'svi', 'lvw', 'lvi', 'dvw', 'dvi'])
/** Units of the window's height, or of the larger or smaller side, and of a container's size: no sweep varies them. */
const UNSWEPT_UNITS = /^(?:[sld]?v(?:h|b|min|max)|cq(?:w|h|i|b|min|max))$/u
/** The functions that compute a length, a value's arithmetic. */
const MATH = new Set(['calc', 'min', 'max', 'clamp', 'abs', 'sign', 'mod', 'rem', 'round'])
/** Those that take the least or greatest of their arguments: they move one way only when every argument does. */
const EXTREMES = new Set(['min', 'max', 'clamp'])
/** Those that fold a value back on itself: an absolute value or a remainder moves both ways when its value moves. */
const FOLDS = new Set(['abs', 'mod', 'rem'])
const FLIPPED: Readonly<Record<Way, Way>> = { flat: 'flat', up: 'down', down: 'up', both: 'both' }

function join(a: Way, b: Way): Way {
  if (a === 'flat') return b
  if (b === 'flat' || a === b) return a
  return 'both'
}

const operatorOf = (n: CssNode): string | null => (n.type === 'Operator' ? n.value.trim() : null)
const partsOf = (n: CssNode): CssNode[] =>
  'children' in n && n.children ? n.children.toArray().filter((c) => c.type !== 'WhiteSpace') : []

/** A list of parts split at its commas: a function's arguments. */
function argumentsOf(parts: readonly CssNode[]): CssNode[][] {
  const out: CssNode[][] = [[]]
  for (const n of parts) {
    if (operatorOf(n) === ',') out.push([])
    else out[out.length - 1]?.push(n)
  }
  return out
}

/** Which way a literal moves: a length of the window's width, or a percentage, by its sign; any other, not at all. */
function literalWay(n: CssNode & { type: 'Dimension' | 'Percentage' }): Way {
  if (n.type === 'Dimension' && !WIDTH_UNITS.has(n.unit.toLowerCase())) return 'flat'
  const sign = Math.sign(Number(n.value))
  if (sign === 0) return 'flat'
  return sign > 0 ? 'up' : 'down'
}

/** The sign of a factor that does not move: a literal's, or null when it cannot be read (a constant, a variable). */
function signOf(n: CssNode): number | null {
  return n.type === 'Number' || n.type === 'Dimension' || n.type === 'Percentage' ? Math.sign(Number(n.value)) : null
}

/** Which way a product moves: as its one moving factor, flipped by a negative one; two moving factors, or a moving
 * divisor, or a factor of a sign it cannot read, move it both ways. */
function productWay(parts: readonly CssNode[]): Way {
  let way: Way = 'flat'
  let negative = false
  let unread = false
  let divisor = false
  for (const n of parts) {
    const op = operatorOf(n)
    if (op !== null) {
      divisor = op === '/'
      continue
    }
    const moves = wayOf(n)
    if (moves !== 'flat') {
      if (moves === 'both' || divisor || way !== 'flat') return 'both'
      way = moves
      continue
    }
    const sign = signOf(n)
    if (sign === null) unread = true
    else if (sign < 0) negative = !negative
  }
  if (way === 'flat') return 'flat'
  if (unread) return 'both'
  return negative ? FLIPPED[way] : way
}

/** Which way a sum moves: as its terms, each by its own sign; terms moving opposite ways move it both ways. */
function sumWay(parts: readonly CssNode[]): Way {
  let way: Way = 'flat'
  let term: CssNode[] = []
  let negative = false
  const add = (): void => {
    const moves = productWay(term)
    way = join(way, negative ? FLIPPED[moves] : moves)
    term = []
  }
  for (const n of parts) {
    const op = operatorOf(n)
    if (op === '+' || op === '-') {
      add()
      negative = op === '-'
    } else term.push(n)
  }
  add()
  return way
}

/** `round()`'s value moves as it does, unless its step moves too; a rounding strategy may come first. */
function roundWay(args: readonly CssNode[][]): Way {
  const [first] = args
  const values = first?.length === 1 && first[0]?.type === 'Identifier' ? args.slice(1) : args
  const [value = [], step = []] = values
  return sumWay(step) === 'flat' ? sumWay(value) : 'both'
}

function functionWay(fn: CssNode & { type: 'Function' }): Way {
  const name = fn.name.toLowerCase()
  const args = argumentsOf(partsOf(fn))
  if (name === 'calc' || name === 'sign') return sumWay(args[0] ?? [])
  if (EXTREMES.has(name)) return args.map(sumWay).reduce(join, 'flat')
  if (FOLDS.has(name)) return args.some((a) => sumWay(a) !== 'flat') ? 'both' : 'flat'
  if (name === 'round') return roundWay(args)
  if (name === 'attr') return 'both'
  // A variable is a value a custom property holds, which moves with nothing (windowIssue); its fallback is read.
  if (name === 'var') return args.slice(1).map(sumWay).reduce(join, 'flat')
  // Any other function gives a value of its own (a colour, a gradient, a transform): what matters is a part of it that
  // moves both ways.
  return args.some((a) => a.some((part) => wayOf(part) === 'both')) ? 'both' : 'flat'
}

/** Which way one part of a value moves as the window widens. */
function wayOf(n: CssNode): Way {
  if (n.type === 'Dimension' || n.type === 'Percentage') return literalWay(n)
  if (n.type === 'Parentheses') return sumWay(partsOf(n))
  if (n.type === 'Function') return functionWay(n)
  return 'flat'
}

/** Whether a part of a custom property's value is a length that moves with the window, or arithmetic that does. */
function movesWithWindow(n: CssNode): boolean {
  if (n.type === 'Dimension' || n.type === 'Percentage') return literalWay(n) !== 'flat'
  return n.type === 'Function' && MATH.has(n.name.toLowerCase()) && wayOf(n) !== 'flat'
}

/** The first unit in a value that measures what no capture or sweep varies, or null. */
function unsweptUnit(value: CssNode): string | null {
  const found: string[] = []
  walk(value, (n) => {
    if (n.type === 'Dimension' && UNSWEPT_UNITS.test(n.unit.toLowerCase())) found.push(`${n.value}${n.unit}`)
  })
  return found[0] ?? null
}

/** Why a declaration's value is one the width sweep cannot bound, or null (see the header). */
export function windowIssue(node: CssNode): string | null {
  if (node.type !== 'Declaration') return null
  const unswept = unsweptUnit(node.value)
  if (unswept)
    return (
      `${node.property}: ${unswept} measures the window's height or a container, which neither the captures nor the ` +
      "width sweep vary; use the window's width (vw) or the page's own lengths"
    )
  const parts = partsOf(node.value).length > 0 ? partsOf(node.value) : [node.value]
  if (node.property.startsWith('--'))
    return parts.some(movesWithWindow)
      ? `${node.property} holds a length that moves with the window: where a property takes it, which way it moves ` +
          'could not be read; write the window-relative length in the property itself'
      : null
  return parts.some((part) => wayOf(part) === 'both')
    ? `${node.property} grows and shrinks as the window widens (the least or greatest of parts that move opposite ` +
        'ways, an absolute value or remainder of one that moves, a product of two, or a value an attribute gives), ' +
        'so it can hide text at a width between the two the render measures a band at; write it to move one way'
    : null
}
