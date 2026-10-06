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
// It is not a proof where a box's place bends inside a band: a `min()`, `max()` or `clamp()` that changes arguments, a
// text that rewraps and moves what follows by steps, a flex or grid line that wraps, an `auto-fit` grid's column count.
// Nor is any paint inside a box that overlaps a text at both ends, beneath it, which only the ends' checks read.
// An inline mark offset by the same lengths at both ends (a citation raised with `top: -0.4em`) moves with the lines
// of its own paragraph and is compared with the texts of other blocks only. Every bound fails closed: a page with more
// boxes or pairs than are compared, or a box or text drawn at one end of a band only, fails the band.

import { MARK_CLASS } from './capture-page.mjs'

/**
 * The most boxes one band end's layout may hold to be compared, the most pairs of a placed box and a text compared
 * across one band, and the most pairs a failure names.
 */
export const PLACEMENT = Object.freeze({ maxNodes: 60_000, maxPairs: 2_000_000, maxListed: 12 })

/** The computed styles the comparison reads, in the order the protocol returns them for each box. */
const STYLES = [
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
 *   text: string, box: Edges | null, paint: [number, number] | null, style: Record<string, string> | null }} Box
 *   a node of the page as one band end lays it out, by the protocol's backend id: its parent's id (0 at the root), what
 *   it is, a short name, the content block it is (data-block), its text (a text node's), its box (the union of its
 *   layout boxes), the range of its paint order, and its computed styles (STYLES)
 * @typedef {{ nodes: Map<number, Box> }} Layout one band end's layout
 * @typedef {{ index: number[], value: number[] }} RareStrings
 * @typedef {{ parentIndex?: number[], nodeType?: number[], nodeName?: number[], nodeValue?: number[],
 *   backendNodeId?: number[], attributes?: number[][], pseudoType?: RareStrings }} SnapshotNodes
 * @typedef {{ nodeIndex: number[], styles: number[][], bounds: number[][], paintOrders?: number[] }} SnapshotLayout
 * @typedef {{ documents: { nodes: SnapshotNodes, layout: SnapshotLayout }[], strings: string[] }} Snapshot what
 *   DOMSnapshot.captureSnapshot returns, as far as it is read here (string fields are indices into `strings`) */

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
  node.style ??= Object.fromEntries(STYLES.map((name, k) => [name, stringAt(strings, styles[k])]))
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
