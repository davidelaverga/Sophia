// Where placed boxes meet text between the widths the sweep measures (#117, SDD-CX45). The width sweep (capture-html.mjs)
// measures both ends of each band of window widths a page's media conditions make, and inside a band the page's
// rules hold alike; but two things that move at different rates can meet between a band's ends and part again: a block
// at `left: 50vw` and a cover at `left: calc(100vw - 720px)` lie apart at 320 and 2560px and on each other at 1440px, as
// a centred column does with a box at `left: 400px` between 500 and 1220px. In normal flow, boxes do not overlap one
// another; a box placed out of it does: an absolutely positioned one, one offset by `position: relative`, a
// transformed one, or one given a negative margin, with everything inside it, and the generated boxes (`::before`,
// `::after`) placed so. So at each band end the kernel reads, in one call to the DevTools protocol, the box of every
// element, generated box and text on the page, and compares each placed box with each text that does not move with it,
// on both axes.
// A pair passes when, along one axis, the box lies on the same side of the whole text at both ends of the band (its
// visible part, inside what its ancestors' overflow clips, may stand for it, when that part is on that side at both
// ends), or when the two overlap at both ends and the box is painted beneath the text, where the ends' cover and
// contrast checks judge them. Anything else fails: sides swapped, apart along one axis at one end and along the other
// at the other (a diagonal path that may meet in between), or overlapping at one end only.
// Positions inside a band move affinely with the window where they are fixed lengths, `vw` or percentages of boxes
// that widen with it, and their sums: two such boxes on one side of each other at both ends stay on it throughout.
// Inside a band, how a text is drawn can change and change back where no media condition does: a grid's column count,
// a flex line, an inline box or a float that wraps, or a text that rewraps, moves a box onto a text, or out of a parent
// of fixed height onto the text that follows it, in the flow, and off it again; or cuts a text, sets it off the page or
// outside its section, widens the page, or moves a research table's cells or a block's runs of text out of their
// order (#117). So at every whole width of every band the kernel reads, for each line of text, the drawn boxes and
// lines of other texts that lie on it, and whether a clip cuts it, it leaves the page or its section; whether the page
// is wider than the window; and which research tables' cells are drawn elsewhere and which blocks' text out of its
// order (meetingsOf, and capture-page.mjs orderScript). Each width where any of that changes is measured as band ends
// (layoutChanges), every check included, so each piece of a band holds the same at every whole width: a box that lies
// on a text anywhere in it lies on it at both its ends, where the cover, contrast and placement checks read them. Not read between the ends: the paint inside a box that lies on a text throughout (a
// gradient's colours beneath it), and an inline box drawn across lines, which is read by the box around its pieces.
// Each band end's snapshot and comparison run within the sweep's time (placementStep).
// The window's height is the sweep's own throughout. A static page lays nothing out by it, so at each band end the page is
// also laid out at a few other heights, and a box or a line of text placed otherwise at any fails the band end (shapeOf,
// capture-html.mjs heightIssue); heights between those are not read.
// An inline mark offset by the same lengths at both ends (a citation raised with `top: -0.4em`) moves with the lines
// of its own paragraph and is compared with the texts of other blocks only. Every bound fails closed: a page with more
// boxes or pairs than are compared, or a box or text drawn at one end of a band only, fails the band.

import { channel } from 'node:diagnostics_channel'
import { MARK_CLASS } from './capture-page.mjs'

const WIDTH_TRACE = channel('sophia.renderer.width-sweep')

/**
 * The most boxes one band end's layout may hold to be compared, the most pairs of a placed box and a text compared
 * across one band, the most pairs a failure names, and the most changes of how the texts lie found inside the bands
 * and the most widths read to find them (layoutChanges). Also the most
 * generated boxes whose place the page measure is given to read paint beneath text by (generatedOf).
 */
export const PLACEMENT = Object.freeze({
  maxNodes: 60_000,
  maxPairs: 2_000_000,
  maxListed: 12,
  maxChanges: 32,
  maxProbes: 2_400,
  maxGenerated: 4_000,
})

/** The computed styles the comparison reads, in the order the protocol returns them for each box. */
export const STYLES = [
  'position',
  'display',
  'visibility',
  'left',
  'top',
  'right',
  'bottom',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'transform',
  'translate',
  'rotate',
  'scale',
  'offset-path',
  'overflow-x',
  'overflow-y',
  'background-color',
  'background-image',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-image-source',
  'box-shadow',
  'outline-style',
  'filter',
  'backdrop-filter',
  'z-index',
  'opacity',
  'isolation',
  'mix-blend-mode',
  'outline-width',
  'outline-offset',
]
const OFFSETS = ['left', 'top', 'right', 'bottom']
const MARGINS = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']
const TRANSFORMS = ['transform', 'translate', 'rotate', 'scale', 'offset-path']
const PAINTS = ['background-image', 'border-image-source', 'box-shadow', 'outline-style', 'filter', 'backdrop-filter']
const WORDS = new RegExp(`[^\\s${MARK_CLASS}]`, 'u')
const UNBOUNDED = /** @type {Edges} */ ([-Infinity, -Infinity, Infinity, Infinity])

/** @typedef {[number, number, number, number]} Edges a box's left, top, right and bottom, in page coordinates */
/**
 * @typedef {{ parent: number, kind: 'element' | 'pseudo' | 'text' | 'other', name: string, block: string | null,
 *   section: string | null, text: string, box: Edges | null, paint: [number, number] | null,
 *   style: Record<string, string> | null }} Box a node of the page as one band end lays it out, by the protocol's
 *   backend id: its parent's id (0 at the root), what it is, a short name, the content block and the section it is
 *   (data-block, data-section), its text (a text node's), its box (the union of its layout boxes), the range of its
 *   paint order, and its computed styles (STYLES)
 * @typedef {{ nodes: Map<number, Box> }} Layout one band end's layout
 * @typedef {{ index: number[], value: number[] }} RareStrings
 * @typedef {{ parentIndex?: number[], nodeType?: number[], nodeName?: number[], nodeValue?: number[],
 *   backendNodeId?: number[], attributes?: number[][], pseudoType?: RareStrings }} SnapshotNodes
 * @typedef {{ nodeIndex: number[], styles: number[][], bounds: number[][], paintOrders?: number[] }} SnapshotLayout
 * @typedef {{ layoutIndex: number[], bounds: number[][] }} SnapshotTextBoxes each line of a text, by its layout box
 * @typedef {{ documents: { nodes: SnapshotNodes, layout: SnapshotLayout, textBoxes?: SnapshotTextBoxes,
 *   contentWidth?: number }[], strings: string[] }} Snapshot what DOMSnapshot.captureSnapshot returns, as far as it is
 *   read here (string fields are indices into `strings`) */

/**
 * Read one band end's layout through the protocol: every node's box, paint order and the styles the comparison reads.
 * @param {import('playwright-core').CDPSession} cdp
 * @returns {Promise<Layout | { issue: string }>}
 */
export async function layoutAt(cdp) {
  return layoutOf(await cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: STYLES, includePaintOrder: true }))
}

/**
 * @typedef {{ parent: number[], type: number[], name: number[], value: number[], id: number[], attrs: number[][],
 *   pseudo: Map<number, string>, strings: string[] }} Columns the snapshot's node fields, each present
 */

/**
 * A string of the snapshot by its index, or '' for none.
 * @param {string[]} strings
 * @param {number | undefined} i
 */
const stringAt = (strings, i) => strings[i ?? -1] ?? ''

/**
 * The snapshot's node fields, each present, and its pseudo-elements' types by node index.
 * @param {SnapshotNodes} n
 * @param {string[]} strings
 * @returns {Columns}
 */
function columnsOf(n, strings) {
  const rare = n.pseudoType ?? { index: [], value: [] }
  return {
    parent: n.parentIndex ?? [],
    type: n.nodeType ?? [],
    name: n.nodeName ?? [],
    value: n.nodeValue ?? [],
    id: n.backendNodeId ?? [],
    attrs: n.attributes ?? [],
    pseudo: new Map(rare.index.map((ni, k) => [ni, stringAt(strings, rare.value[k])])),
    strings,
  }
}

/**
 * A node's attributes, as the snapshot lists them (name and value string indices in turn).
 * @param {number[]} list
 * @param {string[]} strings
 * @returns {Map<string, string>}
 */
function attributesOf(list, strings) {
  /** @type {Map<string, string>} */
  const out = new Map()
  for (let i = 0; i + 1 < list.length; i += 2) out.set(stringAt(strings, list[i]), stringAt(strings, list[i + 1]))
  return out
}

/**
 * A short name for an element: its tag, and its id or first class.
 * @param {string} tag
 * @param {Map<string, string>} attrs
 */
function elementName(tag, attrs) {
  const id = attrs.get('id')
  const cls = (attrs.get('class') ?? '').trim().split(/\s+/u)[0]
  const suffix = id ? `#${id}` : cls ? `.${cls}` : ''
  return `${tag}${suffix}`.slice(0, 60)
}

/**
 * What a node of the snapshot is.
 * @param {Columns} c
 * @param {number} ni
 * @returns {Box['kind']}
 */
function kindOf(c, ni) {
  if (c.pseudo.has(ni)) return 'pseudo'
  const type = c.type[ni]
  return type === 1 ? 'element' : type === 3 ? 'text' : 'other'
}

/**
 * One node of the snapshot as a Box, without its layout yet.
 * @param {Columns} c
 * @param {number} ni
 * @returns {Box}
 */
function boxOf(c, ni) {
  const attrs = attributesOf(c.attrs[ni] ?? [], c.strings)
  const parentIndex = c.parent[ni] ?? -1
  const kind = kindOf(c, ni)
  return {
    parent: parentIndex >= 0 ? (c.id[parentIndex] ?? 0) : 0,
    kind,
    name:
      kind === 'pseudo'
        ? `::${c.pseudo.get(ni) ?? ''}`
        : elementName(stringAt(c.strings, c.name[ni]).toLowerCase(), attrs),
    block: attrs.get('data-block') ?? null,
    section: attrs.get('data-section') ?? null,
    text: kind === 'text' ? stringAt(c.strings, c.value[ni]) : '',
    box: null,
    paint: null,
    style: null,
  }
}

/**
 * A laid-out node's Box, and its ancestors', made where there are none yet.
 * @param {Map<number, Box>} nodes
 * @param {Columns} c
 * @param {number} ni
 * @returns {Box | undefined}
 */
function nodeAt(nodes, c, ni) {
  /** @type {Box | undefined} */
  let made
  for (let at = ni; at >= 0; at = c.parent[at] ?? -1) {
    const id = c.id[at] ?? 0
    const known = nodes.get(id)
    if (known) return made ?? known
    const box = boxOf(c, at)
    nodes.set(id, box)
    made ??= box
  }
  return made
}

/**
 * Add one of a node's layout boxes to it: its bounds, its paint order and (from the first) its styles.
 * @param {Box} node
 * @param {SnapshotLayout} layout
 * @param {number} li
 * @param {string[]} strings
 */
function addLayout(node, layout, li, strings) {
  const [x = 0, y = 0, w = 0, h = 0] = layout.bounds[li] ?? []
  if (w > 0 || h > 0 || !node.box) node.box = unite(node.box, [x, y, x + w, y + h])
  node.paint = widen(node.paint, layout.paintOrders?.[li])
  const styles = layout.styles[li] ?? []
  node.style ??= stylesOf(styles, strings)
}

/**
 * Decode every requested computed style without allocating a pair array for each property.
 * @param {number[]} indices
 * @param {string[]} strings
 * @returns {Record<string, string>}
 */
function stylesOf(indices, strings) {
  /** @type {Record<string, string>} */
  const values = {}
  let k = 0
  for (const name of STYLES) values[name] = stringAt(strings, indices[k++])
  return values
}

/**
 * A range of paint orders widened to hold one more.
 * @param {[number, number] | null} range
 * @param {number | undefined} order
 * @returns {[number, number] | null}
 */
function widen(range, order) {
  if (order === undefined) return range
  return range ? [Math.min(range[0], order), Math.max(range[1], order)] : [order, order]
}

/**
 * @typedef {{ at: number, tag: string, pseudo: string, box: Edges, pieces: number }} GeneratedBox a generated box
 *   (::before or ::after) and where it lies, by the index of the element that draws it among the page's elements in
 *   document order (as document.querySelectorAll('*') lists them) and that element's tag, which the page measure checks
 *   the index by; and how many boxes of some size it is drawn in (an inline one across lines in more than one, whose
 *   union holds points it does not paint)
 * @typedef {{ elements: number, boxes: GeneratedBox[] }} Generated the page's generated boxes, and how many elements
 *   it has
 */

/**
 * The element order of a snapshot's elements, by node index: generated boxes are not counted, so the order is the one
 * document.querySelectorAll('*') gives.
 * @param {Columns} c
 * @returns {Map<number, number>}
 */
function elementOrder(c) {
  /** @type {Map<number, number>} */
  const order = new Map()
  for (const [ni, type] of c.type.entries()) if (type === 1 && !c.pseudo.has(ni)) order.set(ni, order.size)
  return order
}

/**
 * Where the page's generated boxes lie, from a snapshot. A generated box hit-tests as the element that draws it, so
 * only the protocol tells where one is, and the page measure reads the paint beneath a text from it
 * (capture-page.mjs, #117). Null where the snapshot holds no document, a box's element is not one of its elements, or
 * it holds more than `maxGenerated` boxes: the measure then leaves unread the paint beneath every text whose element or
 * an element around it draws one.
 * @param {Snapshot | null} snapshot
 * @param {{ maxGenerated: number }} [limits]
 * @returns {Generated | null}
 */
export function generatedOf(snapshot, limits = PLACEMENT) {
  const doc = snapshot?.documents[0]
  if (!snapshot || !doc) return null
  const c = columnsOf(doc.nodes, snapshot.strings)
  const order = elementOrder(c)
  /** @type {Map<number, GeneratedBox>} */
  const boxes = new Map()
  for (const [li, ni] of doc.layout.nodeIndex.entries())
    if (!addGenerated(boxes, { c, order, layout: doc.layout, li, ni }, limits)) return null
  return { elements: order.size, boxes: [...boxes.values()] }
}

/**
 * One layout box's bounds, as edges.
 * @param {SnapshotLayout} layout
 * @param {number} li
 * @returns {Edges}
 */
function edgesAt(layout, li) {
  const [x = 0, y = 0, w = 0, h = 0] = layout.bounds[li] ?? []
  return [x, y, x + w, y + h]
}

/**
 * Add one layout box to the generated boxes when its node is a ::before or ::after (its boxes united); false when its
 * element is not one of the snapshot's, or the boxes would be more than `maxGenerated`.
 * @param {Map<number, GeneratedBox>} boxes by node index
 * @param {{ c: Columns, order: Map<number, number>, layout: SnapshotLayout, li: number, ni: number }} at
 * @param {{ maxGenerated: number }} limits
 */
function addGenerated(boxes, at, limits) {
  const { c, order, layout, li, ni } = at
  const kind = c.pseudo.get(ni)
  if (kind !== 'before' && kind !== 'after') return true
  const parent = c.parent[ni] ?? -1
  const box = edgesAt(layout, li)
  const sized = box[2] > box[0] || box[3] > box[1]
  const known = boxes.get(ni)
  if (known) {
    if (sized) known.box = unite(known.box, box)
    known.pieces += sized ? 1 : 0
    return true
  }
  const index = order.get(parent)
  if (index === undefined || boxes.size >= limits.maxGenerated) return false
  const tag = stringAt(c.strings, c.name[parent])
  boxes.set(ni, { at: index, tag, pseudo: `::${kind}`, box, pieces: sized ? 1 : 0 })
  return true
}

/**
 * The page's generated boxes (generatedOf), read through the protocol by `until` (Date.now()); null when the snapshot
 * does not answer by then or fails.
 * @param {import('playwright-core').CDPSession} cdp
 * @param {number} until
 * @returns {Promise<Generated | null>}
 */
export async function generatedAt(cdp, until) {
  /** @type {Promise<Snapshot | null>} */
  const snapshot = cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: [] }).catch(() => null)
  const got = await withinTime(snapshot, until)
  return 'late' in got ? null : generatedOf(got.value)
}

/**
 * One band end's layout from a snapshot, or why it is not compared: more boxes than PLACEMENT.maxNodes.
 * @param {Snapshot} snapshot
 * @param {{ maxNodes: number }} [limits]
 * @returns {Layout | { issue: string }}
 */
export function layoutOf(snapshot, limits = PLACEMENT) {
  const doc = snapshot.documents[0]
  if (!doc) return { issue: 'no document whose placements could be read' }
  const { layout } = doc
  if (layout.nodeIndex.length > limits.maxNodes)
    return { issue: `${layout.nodeIndex.length} boxes, more than the ${limits.maxNodes} whose placements are compared` }
  const c = columnsOf(doc.nodes, snapshot.strings)
  /** @type {Map<number, Box>} */
  const nodes = new Map()
  for (const [li, ni] of layout.nodeIndex.entries()) {
    const node = nodeAt(nodes, c, ni)
    if (node) addLayout(node, layout, li, snapshot.strings)
  }
  return { nodes }
}

/**
 * The union of two boxes, the first absent or empty.
 * @param {Edges | null} a
 * @param {Edges} b
 * @returns {Edges}
 */
function unite(a, b) {
  if (!a || a[2] - a[0] <= 0 || a[3] - a[1] <= 0) return b
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
}

/**
 * Whether a box is placed out of normal flow: absolutely (or fixed, sticky), offset by `position: relative`,
 * transformed or put on a path, or given a negative margin.
 * @param {Record<string, string> | null | undefined} s
 */
function isPlaced(s) {
  if (!s) return false
  if (s.position === 'absolute' || s.position === 'fixed' || s.position === 'sticky') return true
  if (s.position === 'relative' && OFFSETS.some((k) => Number.parseFloat(s[k] ?? '') !== 0)) return true
  return TRANSFORMS.some((k) => (s[k] ?? 'none') !== 'none') || MARGINS.some((k) => Number.parseFloat(s[k] ?? '') < 0)
}

/**
 * Whether a box paints anything a text beside or beneath it could be hidden by or read against: a text's glyphs, a
 * generated list marker, or a box's background, border, shadow, outline or filter.
 * @param {Box} node
 */
function paints(node) {
  if (node.kind === 'text') return node.text.trim() !== ''
  if (node.name === '::marker') return true
  const s = node.style
  if (!s) return false
  if (!/^(?:transparent|rgba\(.*,\s*0\))$/u.test(s['background-color'] ?? '')) return true
  if (PAINTS.some((k) => (s[k] ?? 'none') !== 'none')) return true
  return ['top', 'right', 'bottom', 'left'].some((edge) => Number.parseFloat(s[`border-${edge}-width`] ?? '') > 0)
}

/**
 * The part of the page an element's overflow lets its content be drawn in, on the axes it clips.
 * @param {Box} el
 * @returns {Edges}
 */
function ownClip(el) {
  const s = el.style
  if (!s || !el.box) return UNBOUNDED
  const x = s['overflow-x'] !== 'visible'
  const y = s['overflow-y'] !== 'visible'
  return [x ? el.box[0] : -Infinity, y ? el.box[1] : -Infinity, x ? el.box[2] : Infinity, y ? el.box[3] : Infinity]
}

/** Whether a box is placed out of flow against another (absolute, or fixed). @param {Record<string, string> | null} s */
const isAbsolute = (s) => s?.position === 'absolute' || s?.position === 'fixed'
/** Whether a box is the one an absolutely positioned box inside it is placed against. @param {Record<string, string> | null} s */
const isContaining = (s) => !!s && (s.position !== 'static' || TRANSFORMS.some((k) => (s[k] ?? 'none') !== 'none'))

/**
 * Where a box's ancestors let it be drawn: what each one's overflow clips. An absolutely positioned box escapes every
 * ancestor up to the one it is placed against (positioned or transformed), whose overflow clips it.
 * @param {Layout} layout
 * @param {number} id
 * @param {boolean} escaping whether the box is absolutely positioned and not yet in its containing block
 * @param {Map<string, Edges>} memo
 * @returns {Edges}
 */
function clipAbove(layout, id, escaping, memo) {
  const key = `${id} ${escaping}`
  const known = memo.get(key)
  if (known) return known
  const parentId = layout.nodes.get(id)?.parent ?? 0
  const parent = layout.nodes.get(parentId)
  let clip = UNBOUNDED
  if (parent?.kind === 'element')
    clip =
      escaping && !isContaining(parent.style)
        ? clipAbove(layout, parentId, true, memo)
        : meet(ownClip(parent), clipAbove(layout, parentId, isAbsolute(parent.style), memo))
  memo.set(key, clip)
  return clip
}

/**
 * The overlap of two boxes (possibly empty: a right edge left of its left edge).
 * @param {Edges} a
 * @param {Edges} b
 * @returns {Edges}
 */
function meet(a, b) {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]
}

/**
 * Which side of a text a box lies on along one axis: -1 before it, 1 after it, 0 overlapping it.
 * @param {Edges} box
 * @param {Edges} text
 * @param {0 | 1} axis 0 across (x), 1 down (y)
 */
function side(box, text, axis) {
  const [start, end] = axis === 0 ? [0, 2] : [1, 3]
  if ((box[end] ?? 0) <= (text[start] ?? 0)) return -1
  if ((box[start] ?? 0) >= (text[end] ?? 0)) return 1
  return 0
}

/**
 * Whether, by one bound of a box (its own box, or where its ancestors let it be drawn), it lies on the same side of a
 * text along one axis at both ends of a band. Each bound moves affinely between the ends where the page's lengths do,
 * so it then stays on that side throughout; mixing bounds across the ends would not.
 * @param {Edges[]} atA the box's bounds at the band's first end
 * @param {Edges[]} atB the same bounds at its last
 * @param {Edges} textA
 * @param {Edges} textB
 */
function keptApart(atA, atB, textA, textB) {
  return atA.some((boundA, k) => {
    const boundB = atB[k]
    if (!boundB) return false
    return /** @type {(0 | 1)[]} */ ([0, 1]).some((axis) => {
      const s = side(boundA, textA, axis)
      return s !== 0 && s === side(boundB, textB, axis)
    })
  })
}

/**
 * The ids of a node and every ancestor of it.
 * @param {Layout} layout
 * @param {number} id
 */
function lineage(layout, id) {
  /** @type {Set<number>} */
  const out = new Set()
  for (let at = id; at !== 0 && !out.has(at); at = layout.nodes.get(at)?.parent ?? 0) out.add(at)
  return out
}

/**
 * Whether a box creates a stacking context: positioned with a z-index, or transformed, filtered, translucent, isolated or
 * blended.
 * @param {Record<string, string> | null} s
 */
function isStacking(s) {
  if (!s) return false
  if (s.position !== 'static' && s['z-index'] !== 'auto') return true
  if (TRANSFORMS.some((k) => (s[k] ?? 'none') !== 'none') || Number(s.opacity) < 1) return true
  return (
    s.filter !== 'none' ||
    s['backdrop-filter'] !== 'none' ||
    s.isolation === 'isolate' ||
    s['mix-blend-mode'] !== 'normal'
  )
}

/**
 * When a negative z-index sets a box (or the placed box it is in) beneath its stacking context, that context's paint
 * order, or null. The protocol numbers a context's own in-flow content with the context, before the boxes set beneath
 * it, though it paints them after (CSS 2 Appendix E): a highlight at z-index -1 inside a heading at z-index 0 is
 * numbered after the heading's text, and painted under it.
 * @param {Layout} layout
 * @param {number} id
 * @param {number} root
 * @returns {number | null}
 */
function stackedUnder(layout, id, root) {
  const set = [id, root].find((at) => at !== 0 && Number.parseFloat(layout.nodes.get(at)?.style?.['z-index'] ?? '') < 0)
  return set === undefined ? null : contextPaint(layout, layout.nodes.get(set)?.parent ?? 0)
}

/**
 * The paint order of the stacking context a node is in: the nearest element from it up that creates one, or the root.
 * @param {Layout} layout
 * @param {number} from
 * @returns {number | null}
 */
function contextPaint(layout, from) {
  for (let at = from; at !== 0;) {
    const node = layout.nodes.get(at)
    if (!node) return null
    const isRoot = layout.nodes.get(node.parent)?.kind !== 'element'
    if (node.kind === 'element' && (isStacking(node.style) || isRoot)) return node.paint?.[0] ?? null
    at = node.parent
  }
  return null
}

/**
 * Whether a text is painted with its stacking context's own content: numbered as that context is.
 * @param {[number, number]} paint
 * @param {number | null} context
 */
const isPaintedWith = (paint, context) => context !== null && paint[0] === context && paint[1] === context

/**
 * What one pair's two ends show: kept apart, overlapping at both ends with the box painted beneath the text, or
 * neither, when they may meet between the ends.
 * @param {{ a: Edges[], b: Edges[], paint: [number, number] | null, under: number | null }} box its bounds at each end,
 *   its paint order, and its stacking context's when it is set beneath it
 * @param {{ a: Edges, b: Edges, paint: [number, number] | null }} text
 */
function mayMeet(box, text) {
  if (keptApart(box.a, box.b, text.a, text.b)) return false
  const [ownA, ownB] = [box.a[0], box.b[0]]
  const over = (/** @type {Edges | undefined} */ own, /** @type {Edges} */ t) =>
    !!own && side(own, t, 0) === 0 && side(own, t, 1) === 0
  const beneath = !!box.paint && !!text.paint && (box.paint[1] < text.paint[0] || isPaintedWith(text.paint, box.under))
  return !(over(ownA, text.a) && over(ownB, text.b) && beneath)
}

/**
 * @typedef {{ id: number, root: number, a: Edges[], b: Edges[], paint: [number, number] | null, under: number | null }}
 *   Placed a box: its bounds at each end (its own box, and where its ancestors let it be drawn), its paint order, and,
 *   when a negative z-index sets it beneath its stacking context, that context's paint order (stackedUnder)
 */
/** @typedef {{ id: number, root: number, a: Edges, b: Edges, paint: [number, number] | null, lineage: Set<number>,
 *   container: number }} Text */

/**
 * The structure both ends share: which boxes are placed (at either end), each node's placed root (the nearest placed
 * element or generated box around it, or itself; 0 in normal flow), and each node's block container.
 * @param {Layout} a
 * @param {Layout} b
 */
function structureOf(a, b) {
  /** @type {Map<number, number>} */
  const roots = new Map()
  /** @param {number} id */
  const rootOf = (id) => {
    /** @type {number[]} */
    const path = []
    let at = id
    let found = 0
    while (at !== 0) {
      const known = roots.get(at)
      if (known !== undefined) {
        found = known
        break
      }
      path.push(at)
      const node = a.nodes.get(at)
      if (node && node.kind !== 'text' && (isPlaced(node.style) || isPlaced(b.nodes.get(at)?.style))) {
        found = at
        break
      }
      at = node?.parent ?? 0
    }
    // Every node walked shares the root found; a placed node found is its own.
    for (const p of path) roots.set(p, found)
    return found
  }
  /** @param {number} id the nearest ancestor of a node (not itself) that lays out a block of lines */
  const containerOf = (id) => {
    for (let at = a.nodes.get(id)?.parent ?? 0; at !== 0; at = a.nodes.get(at)?.parent ?? 0) {
      const display = a.nodes.get(at)?.style?.display ?? ''
      if (display !== '' && !display.startsWith('inline') && display !== 'contents') return at
    }
    return 0
  }
  return { rootOf, containerOf }
}

/**
 * Whether a placed root is an inline mark offset by the same lengths at both ends (a raised citation), which moves with
 * the lines of its own paragraph.
 * @param {Box | undefined} atA
 * @param {Box | undefined} atB
 */
function isInlineMark(atA, atB) {
  const [s, t] = [atA?.style, atB?.style]
  if (!s || !t || atA?.kind !== 'element' || !(s.display ?? '').startsWith('inline')) return false
  return [...OFFSETS, ...MARGINS, ...TRANSFORMS].every((k) => s[k] === t[k])
}

/**
 * @typedef {{ a: Layout, b: Layout, rootOf: (id: number) => number, containerOf: (id: number) => number,
 *   memo: { a: Map<string, Edges>, b: Map<string, Edges> } }} Band one band's two ends, and the structure they share
 */

/** Whether a node is drawn visibly at a band end. @param {Box | undefined} n */
const visible = (n) => !!n?.box && n.style?.visibility === 'visible'
/** Whether a node is drawn visibly, and paints, at a band end. @param {Box | undefined} n */
const drawn = (n) => !!n && n.kind !== 'other' && visible(n) && paints(n)

/**
 * What one node is in the comparison: a box (anything drawn), also a text when it is one with words, or a node drawn
 * at one end of the band only.
 * @param {Band} band
 * @param {number} id
 * @returns {{ unpaired: string } | { box: Placed, text: Text | null } | null}
 */
function entryOf(band, id) {
  const [atA, atB] = [band.a.nodes.get(id), band.b.nodes.get(id)]
  if (drawn(atA) !== drawn(atB)) return { unpaired: nameOf(atA ? band.a : band.b, id) }
  if (!atA?.box || !atB?.box || !drawn(atA)) return null
  const root = band.rootOf(id)
  const words = atA.kind === 'text' && WORDS.test(atA.text)
  const lines = { id, root, a: atA.box, b: atB.box, paint: atA.paint }
  const text = words ? { ...lines, lineage: lineage(band.a, id), container: band.containerOf(id) } : null
  const escaping = atA.kind !== 'text' && isAbsolute(atA.style)
  const a = [atA.box, clipAbove(band.a, id, escaping, band.memo.a)]
  const b = [atB.box, clipAbove(band.b, id, escaping, band.memo.b)]
  return { box: { id, root, a, b, paint: atA.paint, under: stackedUnder(band.a, id, root) }, text }
}

/**
 * Why the placed boxes and the texts of one band, read at its two ends, may meet between them, or null when no pair
 * may: the pairs that may, by name, or a bound the comparison reached (see the header).
 * @param {Layout} a the layout at the band's first end
 * @param {Layout} b the layout at its last end
 * @param {{ maxPairs: number, maxListed: number }} [limits]
 * @returns {string | null}
 */
export function placementIssue(a, b, limits = PLACEMENT) {
  /** @type {Band} */
  const band = { a, b, ...structureOf(a, b), memo: { a: new Map(), b: new Map() } }
  /** @type {string[]} */
  const unpaired = []
  /** @type {Text[]} */
  const texts = []
  /** @type {Placed[]} */
  const boxes = []
  for (const id of new Set([...a.nodes.keys(), ...b.nodes.keys()])) {
    const entry = entryOf(band, id)
    if (entry && 'unpaired' in entry) unpaired.push(entry.unpaired)
    else if (entry) {
      boxes.push(entry.box)
      if (entry.text) texts.push(entry.text)
    }
  }
  if (unpaired.length > 0)
    return `drawn at one end of the band only, so not compared: ${listed(unpaired, limits.maxListed)}`
  const count = pairCount(boxes, texts)
  if (count > limits.maxPairs)
    return `${count} pairs of placed boxes and texts, more than the ${limits.maxPairs} compared`
  const met = metPairs(band, boxes, texts)
  return met.length > 0 ? `${met.length} placed boxes and texts may meet: ${listed(met, limits.maxListed)}` : null
}

/**
 * How many pairs of a box and a text in another placed root the comparison reads: a box in normal flow with each text
 * of a placed root, a placed box with each text outside its own root.
 * @param {Placed[]} boxes
 * @param {Text[]} texts
 */
function pairCount(boxes, texts) {
  /** @type {Map<number, number>} */
  const perRoot = new Map()
  for (const t of texts) perRoot.set(t.root, (perRoot.get(t.root) ?? 0) + 1)
  return boxes.reduce((sum, m) => sum + texts.length - (perRoot.get(m.root) ?? 0), 0)
}

/**
 * The pairs of the boxes and texts of one band that may meet, by name. A box is compared with each text that does not
 * move with it: not inside the same placed root, not inside the box itself, and not a raised inline mark among its own
 * paragraph's lines.
 * @param {Band} band
 * @param {Placed[]} boxes
 * @param {Text[]} texts
 * @returns {string[]}
 */
function metPairs(band, boxes, texts) {
  /** @type {Set<string>} */
  const met = new Set()
  const placedTexts = texts.filter((t) => t.root !== 0)
  for (const m of boxes) {
    const mark = m.root !== 0 && isInlineMark(band.a.nodes.get(m.root), band.b.nodes.get(m.root))
    const markIn = mark ? band.containerOf(m.root) : -1
    for (const t of m.root === 0 ? placedTexts : texts) {
      if (t.root === m.root || t.lineage.has(m.id) || t.container === markIn) continue
      if (mayMeet(m, t)) met.add(`${nameOf(band.a, m.root === 0 ? m.id : m.root)} and ${nameOf(band.a, t.id)}`)
    }
  }
  return [...met]
}

/**
 * A node's name in a failure: the content block it is, or its element's tag and id or first class and the block it is
 * in; a generated box after its element's name, and a text by its element's.
 * @param {Layout} layout
 * @param {number} id
 * @returns {string}
 */
function nameOf(layout, id) {
  const node = layout.nodes.get(id)
  if (!node) return '?'
  if (node.kind === 'text') return nameOf(layout, node.parent)
  if (node.kind === 'pseudo') return `${nameOf(layout, node.parent)}${node.name}`
  if (node.block) return node.block
  for (let at = node.parent; at !== 0; at = layout.nodes.get(at)?.parent ?? 0) {
    const block = layout.nodes.get(at)?.block
    if (block) return `${node.name} in ${block}`
  }
  return node.name
}

/**
 * Names as a failure lists them: at most `max`, and how many more.
 * @param {string[]} names
 * @param {number} max
 */
function listed(names, max) {
  const shown = names.slice(0, max).join(', ')
  return names.length > max ? `${shown} and ${names.length - max} more` : shown
}

/**
 * In the page: the items a container sets, its children in flow and a `display: contents` child's own.
 * @param {Element} el
 * @returns {Element[]}
 */
function itemsOf(el) {
  return [...el.children].flatMap((k) => {
    const ks = getComputedStyle(k)
    if (ks.display === 'contents') return itemsOf(k)
    return ks.display === 'none' || ks.position === 'absolute' || ks.position === 'fixed' ? [] : [k]
  })
}

/**
 * In the page: each item's line (items that share height share a line) and place along it, as one string.
 * @param {DOMRect[]} rects
 */
function linesOf(rects) {
  const order = rects.map((_, i) => i).toSorted((x, y) => (rects[x]?.top ?? 0) - (rects[y]?.top ?? 0))
  /** @type {number[]} */
  const line = []
  let n = -1
  let bottom = -Infinity
  for (const i of order) {
    const r = rects[i]
    if (!r) continue
    if (r.top >= bottom - 0.5) {
      n += 1
      bottom = r.bottom
    } else bottom = Math.max(bottom, r.bottom)
    line[i] = n
  }
  const lefts = [...new Set(rects.map((r) => Math.round(r.left)))].toSorted((x, y) => x - y)
  return rects.map((r, i) => `${String(line[i])}.${String(lefts.indexOf(Math.round(r.left)))}`).join(',')
}

/**
 * In the page: which of the page's media conditions hold, and where every grid, flex or multi-column container sets its
 * items (linesOf), so a change in a container's column count (`repeat(auto-fit, …)`), a flex line that wraps or a
 * column that fills changes the string. Two band ends are compared as one band's only when it is alike at both
 * (placementStep). Page JavaScript is off: the kernel sends these functions' source (structureScript).
 * @param {string[]} conditions the page's media conditions
 * @returns {{ state: string }}
 */
function structureNow(conditions) {
  /** @type {string[]} */
  const containers = []
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    if (!/grid|flex/u.test(s.display) && s.columnCount === 'auto' && s.columnWidth === 'auto') continue
    containers.push(linesOf(itemsOf(el).map((k) => k.getBoundingClientRect())))
  }
  const media = conditions.map((q) => matchMedia(q).matches).join()
  return { state: `${media}|${containers.join(';')}` }
}

/** The functions above, as the source the kernel sends. */
const IN_PAGE = [itemsOf, linesOf, structureNow]

/**
 * An expression that returns the page's structure (structureNow) for its media conditions.
 * @param {string[]} conditions
 */
export function structureScript(conditions) {
  const source = IN_PAGE.map((f) => f.toString()).join('\n')
  return `(() => {\n${source}\nreturn structureNow(${JSON.stringify(conditions)})\n})()`
}

/**
 * How each line of text lies at one width: for each text with words that is visible, the drawn boxes and other texts
 * whose ink lies on one of its lines, overlapping it along both axes (lies), inside what their ancestors' overflow
 * clips; and whether a clip around it cuts a line (`cut`), a line leaves the page (`off`) or its section's box
 * (`out`), each by more than a pixel; as one string (by backend ids). A box's ink is its box, with its outer shadows
 * and its outline. Left out: the boxes the text is in, and an inline box or a text of the same block of lines (whose
 * lines the line layout keeps apart, and an inline mark moves with). In the flow, nothing else lies on a text and no
 * line leaves its boxes; a box placed out of it, or drawn past its parent's box, does (#117).
 * @param {Layout} layout
 * @param {Map<number, Edges[]>} lines each text's lines, by its backend id (linesIn)
 * @returns {string}
 */
export function meetingsIn(layout, lines) {
  const reader = readerOf(layout, lines)
  const at = { near: rowsOf(marksOf(layout, reader)), page: pageOf(layout) }
  /** @type {string[]} */
  const met = []
  for (const [id, node] of layout.nodes) {
    if (node.kind !== 'text' || !WORDS.test(node.text) || !visible(node)) continue
    const entry = textEntry(layout, reader, { ...at, id, node })
    if (entry) met.push(entry)
  }
  return met.join(' ')
}

/**
 * @typedef {{ id: number, container: number | null, ink: Edges[], bound: Edges }} Mark a drawn box or text that may
 *   lie on a text: its ink inside what clips it, the box around that, and, when it is inline, its block of lines
 * @typedef {{ inkIn: (id: number, node: Box) => { own: Edges[], seen: Edges[] }, containerOf: (id: number) => number }}
 *   Reader a node's ink, unclipped and inside what its ancestors clip, and its block of lines
 */

/**
 * The reader of a layout's ink and blocks of lines (meetingsIn).
 * @param {Layout} layout
 * @param {Map<number, Edges[]>} lines
 * @returns {Reader}
 */
function readerOf(layout, lines) {
  const { containerOf } = structureOf(layout, layout)
  /** @type {Map<string, Edges>} */
  const memo = new Map()
  return {
    containerOf,
    inkIn: (id, node) => {
      const clip = clipAbove(layout, id, node.kind !== 'text' && isAbsolute(node.style), memo)
      const own = node.kind === 'text' ? (lines.get(id) ?? []) : node.box ? [inkOf(node.box, node.style)] : []
      return { own, seen: own.map((e) => meet(e, clip)).filter((e) => e[2] > e[0] && e[3] > e[1]) }
    },
  }
}

/**
 * Every drawn box and text whose ink shows, as what may lie on a text.
 * @param {Layout} layout
 * @param {Reader} reader
 * @returns {Mark[]}
 */
function marksOf(layout, reader) {
  /** @type {Mark[]} */
  const marks = []
  for (const [id, node] of layout.nodes) {
    if (!drawn(node)) continue
    const { seen } = reader.inkIn(id, node)
    if (seen.length === 0) continue
    const inline = node.kind === 'text' || (node.style?.display ?? '').startsWith('inline')
    marks.push({ id, container: inline ? reader.containerOf(id) : null, ink: seen, bound: seen.reduce(unite) })
  }
  return marks
}

/**
 * One text's entry in meetingsIn: the marks on its lines and its flags, or null when it has neither.
 * @param {Layout} layout
 * @param {Reader} reader
 * @param {{ id: number, node: Box, near: (bound: Edges) => Mark[], page: Edges | null }} at
 * @returns {string | null}
 */
function textEntry(layout, reader, at) {
  const { own, seen } = reader.inkIn(at.id, at.node)
  if (own.length === 0) return null
  const around = lineage(layout, at.id)
  const flags = flagsOf({ own, seen }, at.page, sectionOf(layout, around))
  const text = { seen, around, container: reader.containerOf(at.id) }
  const on = seen.length > 0 ? marksOn(text, at.near) : []
  return on.length > 0 || flags ? `${String(at.id)}:${on.map((m) => String(m.id)).join('.')}${flags}` : null
}

/**
 * A text's flags: a line a clip cuts, a line off the page, a line outside its section's box.
 * @param {{ own: Edges[], seen: Edges[] }} lines its lines, unclipped and as they show
 * @param {Edges | null} page
 * @param {Edges | null} section
 */
function flagsOf(lines, page, section) {
  const cut = lines.own.some((e) => !lines.seen.some((v) => within(e, v)))
  const off = page !== null && lines.own.some((e) => !within(e, page))
  const out = section !== null && lines.own.some((e) => !within(e, section))
  return `${cut ? '!cut' : ''}${off ? '!off' : ''}${out ? '!out' : ''}`
}

/**
 * The marks that lie on a text's lines as they show: not a box it is in, nor an inline box or a text of its own block
 * of lines.
 * @param {{ seen: Edges[], around: Set<number>, container: number }} text
 * @param {(bound: Edges) => Mark[]} near
 */
function marksOn(text, near) {
  const bound = text.seen.reduce(unite)
  return near(bound).filter(
    (m) =>
      lies(m.bound, bound) &&
      !text.around.has(m.id) &&
      m.container !== text.container &&
      m.ink.some((e) => text.seen.some((t) => lies(e, t))),
  )
}

/** The height of a row of the page by which meetingsIn indexes the boxes, and the most rows one box is indexed in. */
const ROW = Object.freeze({ px: 64, most: 64 })

/**
 * The boxes that may lie on a box, in their order: those on the rows of the page it spans, and every box spanning
 * ROW.most rows or more (indexed in none); every box for a box that spans as many. So a text is compared with the boxes
 * near it, not with every box of the page.
 * @template {{ bound: Edges }} T
 * @param {T[]} marks
 * @returns {(bound: Edges) => T[]}
 */
function rowsOf(marks) {
  /** @type {Map<number, number[]>} */
  const rows = new Map()
  /** @type {number[]} */
  const tall = []
  /**
   * The first and last rows a box spans.
   * @param {Edges} b
   * @returns {[number, number]}
   */
  const span = (b) => [Math.floor(b[1] / ROW.px), Math.floor(b[3] / ROW.px)]
  for (const [k, m] of marks.entries()) {
    const [from, to] = span(m.bound)
    if (to - from >= ROW.most) tall.push(k)
    else for (let r = from; r <= to; r += 1) addTo(rows, r, k)
  }
  return (bound) => {
    const [from, to] = span(bound)
    if (to - from >= ROW.most) return marks
    /** @type {Set<number>} */
    const found = new Set(tall)
    for (let r = from; r <= to; r += 1) for (const k of rows.get(r) ?? []) found.add(k)
    return [...found].toSorted((x, y) => x - y).flatMap((k) => marks[k] ?? [])
  }
}

/**
 * Whether a box lies inside another, to a pixel on each side.
 * @param {Edges} box
 * @param {Edges} around
 */
function within(box, around) {
  return box[0] >= around[0] - 1 && box[1] >= around[1] - 1 && box[2] <= around[2] + 1 && box[3] <= around[3] + 1
}

/**
 * The page's own box: the root element's (the element whose parent is the document, or none), from its top left (0,
 * 0) to its right edge and below without end; or null when the layout holds none.
 * @param {Layout} layout
 * @returns {Edges | null}
 */
function pageOf(layout) {
  for (const node of layout.nodes.values())
    if (node.kind === 'element' && layout.nodes.get(node.parent)?.kind !== 'element' && node.box)
      return [0, 0, node.box[2], Infinity]
  return null
}

/**
 * The box of the nearest section a node is in (data-section), among its lineage.
 * @param {Layout} layout
 * @param {Set<number>} around a node's lineage (lineage)
 * @returns {Edges | null}
 */
function sectionOf(layout, around) {
  for (const at of around) {
    const node = layout.nodes.get(at)
    if (typeof node?.section === 'string' && node.box) return node.box
  }
  return null
}

/**
 * Whether one box lies on another: they overlap along both axes, by any part of a pixel (the cover check counts a box
 * over a line by a pixel; this finds where it starts to).
 * @param {Edges} a
 * @param {Edges} b
 */
function lies(a, b) {
  return Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0
}

/**
 * Where a box draws: its box, with each outer shadow (offset, and widened by its blur and spread) and its outline.
 * @param {Edges} box
 * @param {Record<string, string> | null} s
 * @returns {Edges}
 */
function inkOf(box, s) {
  const shadows = s?.['box-shadow'] ?? 'none'
  const reach = shadows === 'none' ? [] : shadows.split(/,(?![^(]*\))/u).flatMap((shadow) => shadowInk(box, shadow))
  return [...reach, ...outlineInk(box, s)].reduce(unite, box)
}

/**
 * Where one shadow of a box draws, unless it is inset: its box offset, and widened by its blur and spread.
 * @param {Edges} box
 * @param {string} shadow as the computed style lists it (its colour, then its lengths)
 * @returns {Edges[]}
 */
function shadowInk(box, shadow) {
  if (/\binset\b/u.test(shadow)) return []
  const lengths = [...shadow.replaceAll(/\([^)]*\)/gu, '').matchAll(/-?[\d.]+px/gu)].map((m) => Number.parseFloat(m[0]))
  const [x = 0, y = 0, blur = 0, spread = 0] = lengths
  const r = blur + spread
  return [[box[0] + x - r, box[1] + y - r, box[2] + x + r, box[3] + y + r]]
}

/**
 * Where a box's outline draws, outside it.
 * @param {Edges} box
 * @param {Record<string, string> | null} s
 * @returns {Edges[]}
 */
function outlineInk(box, s) {
  if (!s || (s['outline-style'] ?? 'none') === 'none') return []
  const o = Number.parseFloat(s['outline-width'] ?? '') + Number.parseFloat(s['outline-offset'] ?? '')
  return o > 0 ? [[box[0] - o, box[1] - o, box[2] + o, box[3] + o]] : []
}

/**
 * Each text's lines in a snapshot, by its backend id.
 * @param {Snapshot} snapshot
 * @returns {Map<number, Edges[]>}
 */
export function linesIn(snapshot) {
  const doc = snapshot.documents[0]
  /** @type {Map<number, Edges[]>} */
  const out = new Map()
  const boxes = doc?.textBoxes
  if (!doc || !boxes) return out
  const ids = doc.nodes.backendNodeId ?? []
  for (const [k, li] of boxes.layoutIndex.entries()) {
    const id = ids[doc.layout.nodeIndex[li] ?? -1]
    const line = lineOf(boxes.bounds[k])
    if (id !== undefined && line) addTo(out, id, line)
  }
  return out
}

/**
 * Add a value to the list a map holds under a key, made where there is none.
 * @template T
 * @param {Map<number, T[]>} map
 * @param {number} key
 * @param {T} value
 */
function addTo(map, key, value) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * A line's box from its bounds, or null when it has no size.
 * @param {number[] | undefined} bounds its left, top, width and height
 * @returns {Edges | null}
 */
function lineOf(bounds) {
  const [x = 0, y = 0, w = 0, h = 0] = bounds ?? []
  return w > 0 && h > 0 ? [x, y, x + w, y + h] : null
}

/**
 * How each line of text lies at one width (meetingsIn), from a snapshot (DOMSnapshot.captureSnapshot with STYLES), and
 * whether the page is wider than its window (`wide`: its content wider than its root element's box, by any part of a
 * pixel); or why not: no
 * document, or more boxes than PLACEMENT.maxNodes.
 * @param {Snapshot} snapshot
 * @param {{ maxNodes: number }} [limits]
 * @returns {{ state: string } | { issue: string }}
 */
export function meetingsOf(snapshot, limits = PLACEMENT) {
  const layout = layoutOf(snapshot, limits)
  if ('issue' in layout) return layout
  const page = pageOf(layout)
  // Wider by any part of a pixel, as the measure's overflow is (capture-page.mjs overflowPx).
  const wide = page !== null && Math.ceil((snapshot.documents[0]?.contentWidth ?? 0) - page[2]) > 0
  return { state: `${wide ? 'wide ' : ''}${meetingsIn(layout, linesIn(snapshot))}` }
}

/**
 * Where the page lays out every box and line of text, from a snapshot (DOMSnapshot.captureSnapshot), the window's own
 * box left out: what the window's height alone must leave as it is (#117). A static page sizes and places nothing by
 * the window's height, so one laid out otherwise at another height (a block at `top: 700px` in a section of
 * `height: 100%`, cut in a window 600px high; a box placed against the window's bottom) shows a reader there what no
 * capture shows (capture-html.mjs heightIssue). Null where the snapshot holds no document, or more boxes than
 * PLACEMENT.maxNodes.
 * @param {Snapshot} snapshot
 * @param {{ maxNodes: number }} [limits]
 * @returns {string | null}
 */
export function shapeOf(snapshot, limits = PLACEMENT) {
  const doc = snapshot.documents[0]
  if (!doc || doc.layout.nodeIndex.length > limits.maxNodes) return null
  const type = doc.nodes.nodeType ?? []
  // The document's own box is the window's (node type 9).
  const boxes = doc.layout.nodeIndex.flatMap((ni, li) => (type[ni] === 9 ? [] : [ni, ...(doc.layout.bounds[li] ?? [])]))
  const lines = doc.textBoxes ?? { layoutIndex: [], bounds: [] }
  return `${boxes.join()}|${lines.layoutIndex.join()}|${lines.bounds.flat().join()}`
}

/** @typedef {(widths: number[]) => Promise<({ state: string } | { issue: string })[]>} Probe how the texts lie at each
 *   of some window widths (meetingsOf, and the research tables whose cells are drawn elsewhere), read together */

/** The most widths one probe reads together. */
const BATCH = 32

/**
 * The band ends the sweep measures, with the widths inside the bands where how the texts lie changes (Probe): every
 * whole width of every band is read, in batches the browser works through without waiting on the kernel, and both
 * widths either side of each change become band ends, measured and compared as a breakpoint's are. A grid's column
 * count (`repeat(auto-fit, minmax(320px, 1fr))`), a flex line or an inline box that wraps, or a text that rewraps
 * changes where no media condition does and moves what follows, and can change back before the band ends: flex items
 * sized `min(510px, max(100px, calc(100vw - 506px)))` share a line at both ends of 320–2560 and wrap only between 1012
 * and 1020px, where a raised one lands on a block; flex items or inline blocks sized `min(600px, max(100px, calc(75vw
 * - 200px)))` in a parent 100px high wrap between about 800 and 1200px, all in the flow, onto the text that follows
 * (#117). The window's width is a whole number of pixels, so this reads how the texts lie at every width the band
 * holds. Bounded: more widths than PLACEMENT.maxProbes, more changes than PLACEMENT.maxChanges, a width that cannot be
 * read, or the sweep's time running out fails the sweep, never a width left out; so does a pace that would run it out
 * (the widths read so far, at their rate, leaving the rest past it), as soon as it shows.
 * @param {Probe} probe
 * @param {number[]} ends the band ends the media conditions make (bandEnds)
 * @param {number} until Date.now() by which to stop
 * @param {{ maxChanges: number, maxProbes: number }} [limits]
 * @returns {Promise<{ ends: number[], issue: string | null }>}
 */
export async function layoutChanges(probe, ends, until, limits = PLACEMENT) {
  const out = new Set(ends)
  const done = (/** @type {string | null} */ issue) => ({ ends: [...out].toSorted((x, y) => x - y), issue })
  /** @type {[number, number][]} */
  const bands = []
  for (const [i, a] of ends.entries()) {
    const b = ends[i + 1]
    if (b !== undefined && b - a > 1) bands.push([a, b])
  }
  const widths = bands.reduce((n, [a, b]) => n + b - a + 1, 0)
  if (widths > limits.maxProbes)
    return done(
      `how the texts lie inside the bands was not read: ${widths} widths, more than the ${limits.maxProbes} read`,
    )
  // The widths read so far, and when the first was asked for: once the rate they were read at shows the rest will not
  // be read in time, the sweep fails then, not when its time runs out.
  const at = { out, until, limits, widths, changes: 0, read: 0, started: Date.now() }
  for (const band of bands) {
    const issue = await readBand(probe, band, at)
    if (issue) return done(issue)
  }
  return done(null)
}

/**
 * @typedef {{ out: Set<number>, until: number, limits: { maxChanges: number }, widths: number, changes: number,
 *   read: number, started: number }} Reading the sweep's band ends so far, its time and bounds, how many widths it reads
 *   and has read, the changes found, and when it started reading
 */

/**
 * Read every whole width of one band in batches, adding the widths either side of each change to the band ends; or why
 * not.
 * @param {Probe} probe
 * @param {[number, number]} band
 * @param {Reading} at
 * @returns {Promise<string | null>}
 */
async function readBand(probe, band, at) {
  const [a, b] = band
  /** @type {{ before: string | null }} */
  const last = { before: null }
  for (let from = a; from <= b; from += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, b - from + 1) }, (_, k) => from + k)
    const got = await withinTime(probe(batch), at.until)
    const late = 'late' in got || Date.now() > at.until || pastPace(at, batch.length)
    if (WIDTH_TRACE.hasSubscribers)
      WIDTH_TRACE.publish({
        phase: 'layout-batch',
        first: from,
        count: batch.length,
        read: at.read,
        total: at.widths,
        elapsedMs: Date.now() - at.started,
        remainingMs: at.until - Date.now(),
        late,
        timedOut: 'late' in got,
      })
    if (late) return LATE
    const issue = takeBatch(batch, got.value, at, last)
    if (issue) return issue
  }
  return null
}

/**
 * Take one batch's answers in order: each that differs from the one before it is a change (changeAt); or why not.
 * @param {number[]} batch its widths
 * @param {({ state: string } | { issue: string })[]} answers
 * @param {Reading} at
 * @param {{ before: string | null }} last how the texts lay at the width before, in this band
 * @returns {string | null}
 */
function takeBatch(batch, answers, at, last) {
  for (const [k, width] of batch.entries()) {
    const answer = answers[k]
    if (!answer || 'issue' in answer)
      return `how the texts lie at ${width}px was not read: ${answer?.issue ?? 'no answer'}`
    const issue = last.before !== null && answer.state !== last.before ? changeAt(width, at) : null
    if (issue) return issue
    last.before = answer.state
  }
  return null
}

/**
 * Whether, with `read` more widths read, the rate they were read at leaves the rest past the sweep's time.
 * @param {Reading} at
 * @param {number} read
 */
function pastPace(at, read) {
  at.read += read
  const perWidth = (Date.now() - at.started) / at.read
  return Date.now() + perWidth * (at.widths - at.read) > at.until
}

/**
 * Take a change at a width: the width before it and it become band ends; or why not, past PLACEMENT.maxChanges.
 * @param {number} width
 * @param {Reading} at
 * @returns {string | null}
 */
function changeAt(width, at) {
  at.changes += 1
  if (at.changes > at.limits.maxChanges)
    return `more than ${at.limits.maxChanges} changes of how the texts lie inside the bands, more than the sweep measures`
  at.out.add(width - 1).add(width)
  return null
}

const LATE = "how the texts lie inside the bands was not read at every width within the sweep's time"

/**
 * A promise's value, or `late` when Date.now() reaches `until` first. The work itself goes on; its answer is dropped.
 * @template T
 * @param {Promise<T>} work
 * @param {number} until
 * @returns {Promise<{ value: T } | { late: true }>}
 */
export async function withinTime(work, until) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  /** @type {Promise<{ late: true }>} */
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ late: true }), Math.max(0, until - Date.now()))
  })
  try {
    return await Promise.race([work.then((value) => ({ value })), late])
  } finally {
    clearTimeout(timer)
  }
}

/** @typedef {{ width: number, state: string, layout: Layout }} BandEnd */

/**
 * Read the placements at a band end and compare them with the last band end's, when both are ends of one band (their
 * states, the page's conditions and its containers' lines, alike), within the sweep's time: a snapshot that does not
 * answer in time, or a comparison that ends past it, fails the band end, never passes it unread (#117).
 * @param {() => Promise<Layout | { issue: string }>} read the band end's layout (layoutAt)
 * @param {{ width: number, state: string }} here
 * @param {BandEnd | null} before the last band end read
 * @param {number} until Date.now() by which to stop
 * @returns {Promise<{ issue: string | null, end: BandEnd | null }>} what is wrong, and this band end for the next
 */
export async function placementStep(read, here, before, until) {
  const got = await withinTime(read(), until)
  if ('late' in got) return { issue: `at ${here.width}px: placements not read within the sweep's time`, end: null }
  const layout = got.value
  if ('issue' in layout) return { issue: `at ${here.width}px: ${layout.issue}`, end: null }
  const met = before?.state === here.state ? placementIssue(before.layout, layout) : null
  if (Date.now() > until)
    return { issue: `at ${here.width}px: placements not compared within the sweep's time`, end: null }
  const between = met ? `between ${String(before?.width)} and ${here.width}px: ${met}` : null
  return { issue: between, end: { ...here, layout } }
}
