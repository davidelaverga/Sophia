// #117, SDD-CX45: where placed boxes and texts may meet between the ends of a band (placement.mjs). The capture kernel's
// browser tests read real pages; these read layouts written out, for the pair rule and every bound.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  generatedAt,
  generatedOf,
  layoutChanges,
  layoutOf,
  meetingsIn,
  meetingsOf,
  PLACEMENT,
  placementIssue,
  STYLES,
  placementStep,
  shapeOf,
  withinTime,
  type Layout,
} from '../placement.mjs'

type Edges = [number, number, number, number]
type Style = Record<string, string>
interface Spec {
  readonly parent: number
  readonly kind?: 'element' | 'pseudo' | 'text'
  readonly name?: string
  readonly block?: string
  readonly section?: string
  readonly text?: string
  readonly box: Edges | null
  readonly paint?: number
  readonly style?: Style
}

const STATIC: Style = {
  position: 'static',
  display: 'block',
  visibility: 'visible',
  left: 'auto',
  top: 'auto',
  right: 'auto',
  bottom: 'auto',
  'margin-top': '0px',
  'margin-right': '0px',
  'margin-bottom': '0px',
  'margin-left': '0px',
  transform: 'none',
  translate: 'none',
  rotate: 'none',
  scale: 'none',
  'offset-path': 'none',
  'overflow-x': 'visible',
  'overflow-y': 'visible',
  'background-color': 'rgba(0, 0, 0, 0)',
  'background-image': 'none',
  'border-top-width': '0px',
  'border-right-width': '0px',
  'border-bottom-width': '0px',
  'border-left-width': '0px',
  'border-image-source': 'none',
  'box-shadow': 'none',
  'outline-style': 'none',
  filter: 'none',
  'backdrop-filter': 'none',
  'z-index': 'auto',
  opacity: '1',
  isolation: 'auto',
  'mix-blend-mode': 'normal',
  'outline-width': '0px',
  'outline-offset': '0px',
}
const COVER: Style = { ...STATIC, position: 'absolute', 'background-color': 'rgb(17, 17, 17)' }

/** A layout of nodes by id, each a Box with the static style unless it says otherwise. */
function layout(specs: Record<number, Spec>): Layout {
  return {
    nodes: new Map(
      Object.entries(specs).map(([id, n]) => [
        Number(id),
        {
          parent: n.parent,
          kind: n.kind ?? 'element',
          name: n.name ?? 'div',
          block: n.block ?? null,
          section: n.section ?? null,
          text: n.text ?? '',
          box: n.box,
          paint: n.paint === undefined ? [1, 1] : [n.paint, n.paint],
          style: n.style ?? STATIC,
        },
      ]),
    ),
  }
}

/**
 * A page at one band end: a body (1), a block b1 (2) holding a text (3) at `text`, and a box (4) at `box`, with the
 * box's style and paint order.
 */
function end(text: Edges, box: Edges, style: Style = COVER, paint = 2, extra: Record<number, Spec> = {}): Layout {
  return layout({
    1: { parent: 0, name: 'body', box: [0, 0, 2560, 800] },
    2: { parent: 1, name: 'p', block: 'b1', box: [text[0], text[1], text[2] + 200, text[3]] },
    3: { parent: 2, kind: 'text', text: 'Not free.', box: text },
    4: { parent: 1, name: 'div.cover', box, paint, style },
    ...extra,
  })
}
const TEXT: Edges = [100, 100, 180, 130]
/** The layout with its box (4) set inside the clipping stage (5). */
function inStage(l: Layout): Layout {
  const n = l.nodes.get(4)
  if (n) n.parent = 5
  return l
}
/** A layout box's styles as the snapshot lists them: its position's string, and none for the rest. */
const styleWith = (position: number): number[] => [position, ...Array.from({ length: 35 }, () => -1)]

describe('placed boxes and texts between the ends of a band (#117, placement.mjs)', () => {
  it('names a box that changes sides of a text, along either axis', () => {
    assert.equal(
      placementIssue(end(TEXT, [200, 100, 260, 130]), end(TEXT, [20, 100, 80, 130])),
      '1 placed boxes and texts may meet: div.cover and b1',
    )
    assert.match(placementIssue(end(TEXT, [100, 0, 180, 40]), end(TEXT, [100, 200, 180, 240])) ?? '', /div\.cover/u)
  })

  it('names a box kept apart along one axis at one end and the other axis at the other: a diagonal path', () => {
    // Left of the text and level with it at the first end; below it and across it at the last.
    assert.match(placementIssue(end(TEXT, [20, 100, 80, 130]), end(TEXT, [120, 200, 160, 240])) ?? '', /div\.cover/u)
  })

  it('names a box that overlaps a text at one end only, or at both while painted above it', () => {
    assert.match(placementIssue(end(TEXT, [110, 100, 150, 130]), end(TEXT, [300, 100, 360, 130])) ?? '', /div/u)
    assert.match(placementIssue(end(TEXT, [110, 100, 150, 130]), end(TEXT, [120, 100, 160, 130])) ?? '', /div/u)
  })

  it('passes a box on one side of a text at both ends, and one beneath it where they overlap at both', () => {
    assert.equal(placementIssue(end(TEXT, [200, 100, 260, 130]), end(TEXT, [600, 100, 660, 130])), null)
    assert.equal(
      placementIssue(end(TEXT, [20, 0, 600, 40]), end(TEXT, [900, 0, 1500, 40])),
      null,
      'a box moving along above it',
    )
    const under = { ...COVER, 'z-index': '-1' }
    assert.equal(
      placementIssue(end(TEXT, [90, 110, 190, 130], under, 0), end(TEXT, [95, 112, 185, 130], under, 0)),
      null,
    )
  })

  it('takes a box beneath a text that its stacking context numbers with itself, as the protocol does', () => {
    // A heading at z-index 0 (2) whose highlight (4) sits at z-index -1: numbered after the heading, painted under it.
    const heading: Style = { ...STATIC, position: 'relative', 'z-index': '0' }
    const highlight: Style = { ...COVER, 'z-index': '-1' }
    const at = (box: Edges) =>
      layout({
        1: { parent: 0, name: 'body', box: [0, 0, 2560, 800] },
        2: { parent: 1, name: 'h3', box: [100, 100, 300, 130], paint: 3, style: heading },
        3: { parent: 2, kind: 'text', text: 'Marked', box: TEXT, paint: 3 },
        4: { parent: 2, kind: 'pseudo', name: '::before', box, paint: 4, style: highlight },
      })
    assert.equal(placementIssue(at([96, 112, 184, 130]), at([96, 115, 184, 130])), null)
    const above = { ...highlight, 'z-index': '1' }
    const over = (box: Edges) => {
      const l = at(box)
      const n = l.nodes.get(4)
      if (n) n.style = above
      return l
    }
    assert.match(placementIssue(over([96, 112, 184, 130]), over([96, 115, 184, 130])) ?? '', /h3::before and h3/u)
  })

  it('takes where its ancestors let a box be drawn as a bound, at both ends, never mixed with its own box', () => {
    // The box is drawn inside a clipping stage (5) above the text at both ends, though its own box reaches over it.
    const stage: Style = { ...STATIC, position: 'relative', 'overflow-x': 'hidden', 'overflow-y': 'hidden' }
    const clipped = (box: Edges) =>
      end(TEXT, box, COVER, 2, { 5: { parent: 1, name: 'div.stage', box: [0, 0, 2560, 90], style: stage } })
    assert.equal(placementIssue(inStage(clipped([90, 60, 400, 200])), inStage(clipped([20, 60, 300, 200]))), null)
    assert.match(placementIssue(clipped([90, 60, 400, 200]), clipped([20, 60, 300, 200])) ?? '', /div\.cover/u)
    // Kept apart by its own box at one end and by the stage at the other: the two bounds are not mixed.
    const shifted = (box: Edges, stageBox: Edges) =>
      inStage(end(TEXT, box, COVER, 2, { 5: { parent: 1, name: 'div.stage', box: stageBox, style: stage } }))
    assert.match(
      placementIssue(shifted([200, 100, 260, 130], [0, 0, 2560, 800]), shifted([20, 60, 300, 200], [0, 0, 2560, 90])) ??
        '',
      /div\.cover/u,
    )
  })

  it('compares no text that moves with the box: inside it, inside the same placed box, or an inline mark among its lines', () => {
    // The text inside the placed box itself.
    const inBox = (box: Edges, text: Edges) =>
      layout({
        1: { parent: 0, name: 'body', box: [0, 0, 2560, 800] },
        4: { parent: 1, name: 'div.card', box, paint: 2, style: COVER },
        3: { parent: 4, kind: 'text', text: 'Not free.', box: text, paint: 2 },
      })
    assert.equal(
      placementIssue(inBox([0, 0, 100, 40], [10, 10, 90, 30]), inBox([900, 0, 1000, 40], [910, 10, 990, 30])),
      null,
    )
    // A raised mark (5) on one of a paragraph's lines, offset alike at both ends, among lines that rewrap.
    const raised: Style = { ...STATIC, position: 'relative', display: 'inline', top: '-5px' }
    const mark = (text: Edges, at: Edges) =>
      layout({
        1: { parent: 0, name: 'body', box: [0, 0, 2560, 800] },
        2: { parent: 1, name: 'p', block: 'b1', box: [0, 0, 2560, 200] },
        3: { parent: 2, kind: 'text', text: 'Not free at all.', box: text },
        5: { parent: 2, name: 'span.raise', box: at, paint: 2, style: raised },
        6: { parent: 5, kind: 'text', text: '*', box: at, paint: 2 },
      })
    assert.equal(
      placementIssue(mark([0, 0, 300, 60], [120, 25, 130, 45]), mark([0, 0, 800, 30], [810, 0, 820, 20])),
      null,
    )
    // Offset by the window's width, it is no mark: it moves across its own lines.
    const moving = (text: Edges, at: Edges, top: string) => {
      const l = mark(text, at)
      const n = l.nodes.get(5)
      if (n) n.style = { ...raised, left: top }
      return l
    }
    assert.match(
      placementIssue(
        moving([0, 0, 300, 60], [120, 25, 130, 45], '16px'),
        moving([0, 0, 800, 30], [810, 0, 820, 20], '128px'),
      ) ?? '',
      /span\.raise in b1 and b1/u,
    )
  })

  it('names a box or a text drawn at one end of the band only, never comparing what is left', () => {
    const gone = end(TEXT, [200, 100, 260, 130])
    gone.nodes.delete(4)
    assert.match(placementIssue(end(TEXT, [200, 100, 260, 130]), gone) ?? '', /^drawn at one end of the band only/u)
    const hidden = end(TEXT, [200, 100, 260, 130])
    const t = hidden.nodes.get(3)
    if (t) t.style = { ...STATIC, visibility: 'hidden' }
    assert.match(
      placementIssue(end(TEXT, [200, 100, 260, 130]), hidden) ?? '',
      /^drawn at one end of the band only: |b1/u,
    )
  })

  it('fails a band with more pairs than it compares, and a band end with more boxes than it reads', () => {
    const a = end(TEXT, [200, 100, 260, 130])
    const b = end(TEXT, [600, 100, 660, 130])
    assert.equal(placementIssue(a, b, { ...PLACEMENT, maxPairs: 1 }), null)
    assert.equal(
      placementIssue(a, b, { ...PLACEMENT, maxPairs: 0 }),
      '1 pairs of placed boxes and texts, more than the 0 compared',
    )
    const snapshot = {
      documents: [{ nodes: {}, layout: { nodeIndex: [0, 1, 2], styles: [], bounds: [] } }],
      strings: [],
    }
    assert.deepEqual(layoutOf(snapshot, { maxNodes: 2 }), {
      issue: '3 boxes, more than the 2 whose placements are compared',
    })
  })

  it('reads a snapshot: each node once, by its backend id, its layout boxes joined, its generated boxes by type', () => {
    const strings = ['HTML', 'P', '#text', 'Not free.', '::after', 'after', 'data-block', 'b1', 'absolute', 'static']
    const snapshot = {
      documents: [
        {
          nodes: {
            parentIndex: [-1, 0, 1, 1],
            nodeType: [1, 1, 3, 1],
            nodeName: [0, 1, 2, 4],
            nodeValue: [-1, -1, 3, -1],
            backendNodeId: [10, 11, 12, 13],
            attributes: [[], [6, 7], [], []],
            pseudoType: { index: [3], value: [5] },
          },
          layout: {
            nodeIndex: [0, 1, 2, 3, 3],
            styles: [styleWith(9), styleWith(9), styleWith(9), styleWith(8), styleWith(8)],
            bounds: [
              [0, 0, 800, 600],
              [0, 0, 800, 24],
              [0, 3, 60, 17],
              [400, 0, 10, 10],
              [0, 0, 0, 0],
            ],
            paintOrders: [1, 1, 1, 4, 4],
          },
        },
      ],
      strings,
    }
    const read = layoutOf(snapshot)
    assert.ok('nodes' in read)
    assert.deepEqual([...read.nodes.keys()], [10, 11, 12, 13])
    assert.deepEqual(
      [...read.nodes.values()].map((n) => [n.kind, n.name, n.block, n.parent, n.box, n.style?.position]),
      [
        ['element', 'html', null, 0, [0, 0, 800, 600], 'static'],
        ['element', 'p', 'b1', 10, [0, 0, 800, 24], 'static'],
        ['text', '#text', null, 11, [0, 3, 60, 20], 'static'],
        ['pseudo', '::after', null, 11, [400, 0, 410, 10], 'absolute'],
      ],
    )
  })
})

type Lie = { state: string } | { issue: string }
/** A probe of a page that lies as `at` says at each width: it answers each batch at once, and counts what it reads. */
function batched(at: (width: number) => string) {
  const widths: number[] = []
  const batches: number[] = []
  const probe = (ws: number[]): Promise<Lie[]> => {
    widths.push(...ws)
    batches.push(ws.length)
    return Promise.resolve(ws.map((w) => ({ state: at(w) })))
  }
  return { probe, widths, batches }
}
/** A page where how a text lies changes at each of `at`. */
const stepped = (at: readonly number[]) => batched((w) => `lies ${String(at.filter((x) => w >= x).length)}`)
/** A page where a box lies on a text only between `from` and `to`, as a wrap that comes and goes. */
const between = (from: number, to: number) => batched((w) => (w >= from && w < to ? '5:3' : ''))
const LATER = (): number => Date.now() + 60_000
/** A page whose probe never answers a batch that holds 2560px. */
const silent = (ws: number[]): Promise<Lie[]> =>
  ws.includes(2560) ? new Promise<never>(() => {}) : Promise.resolve(ws.map(() => ({ state: 'a' })))
/** A page whose width 700px the window did not take. */
const unread = (ws: number[]): Promise<Lie[]> =>
  Promise.resolve(ws.map((w) => (w === 700 ? { issue: 'the window was not 700px wide' } : { state: 'a' })))
/** A probe that answers one width fewer than it is asked. */
const short = (ws: number[]): Promise<Lie[]> => Promise.resolve(ws.slice(1).map(() => ({ state: 'a' })))
/** A page where how a text lies changes at 321px, answering at once. */
const quick = batched((w) => `lies ${String(w >= 321 ? 1 : 0)}`).probe
/** A reader that answers with `answer` after `ms`. */
const readAfter = (ms: number, answer: Layout) => (): Promise<Layout> =>
  new Promise<Layout>((resolve) => {
    setTimeout(() => resolve(answer), ms)
  })

describe('how the texts lie inside a band (#117, placement.mjs)', () => {
  it('reads every width once, in batches, and measures the widths either side of each change as band ends', async () => {
    const page = stepped([640, 960, 1280])
    const { ends, issue } = await layoutChanges(page.probe, [320, 2560], LATER())
    assert.equal(issue, null)
    assert.deepEqual(ends, [320, 639, 640, 959, 960, 1279, 1280, 2560])
    // Every whole width of the band, once each, in batches of at most 32.
    assert.equal(page.widths.length, 2560 - 320 + 1)
    assert.equal(new Set(page.widths).size, page.widths.length)
    assert.ok(page.batches.every((n) => n <= 32))
  })

  it("reads a band whose texts lie alike throughout as it is, and no width of a breakpoint's pair", async () => {
    const still = stepped([])
    assert.deepEqual(await layoutChanges(still.probe, [320, 599, 600, 2560], LATER()), {
      ends: [320, 599, 600, 2560],
      issue: null,
    })
    assert.equal(still.widths.length, 599 - 320 + 1 + (2560 - 600 + 1))
  })

  // The security review of ecf149b (4199947395): flex items or inline blocks sized min(600px, max(100px, calc(75vw -
  // 200px))) in a parent 100px high share a line at both ends of 320–2560 and wrap onto the text that follows between
  // about 801 and 1200px (4200072778, 4200177121); the owner's min(510px, max(100px, calc(100vw - 506px))) wrap only
  // between 1012 and 1020px (4199983800's thread); and one wraps at a single width.
  it('finds a box that comes to lie on a text and leaves it inside a band, whose ends match, at every width', async () => {
    const changes = async (from: number, to: number) =>
      (await layoutChanges(between(from, to).probe, [320, 2560], LATER())).ends
    assert.deepEqual(await changes(801, 1200), [320, 800, 801, 1199, 1200, 2560])
    assert.deepEqual(await changes(1012, 1020), [320, 1011, 1012, 1019, 1020, 2560])
    assert.deepEqual(await changes(900, 901), [320, 899, 900, 901, 2560])
  })

  it('fails past its widths, its changes, a width it cannot read, or its time, never leaving a change out', async () => {
    const many = Array.from({ length: 40 }, (_, i) => 400 + i * 50)
    const changes = await layoutChanges(stepped(many).probe, [320, 2560], LATER())
    assert.match(changes.issue ?? '', /^more than 32 changes of how the texts lie inside the bands/u)
    const probes = await layoutChanges(stepped([640, 960]).probe, [320, 2560], LATER(), { ...PLACEMENT, maxProbes: 5 })
    assert.equal(probes.issue, 'how the texts lie inside the bands was not read: 2241 widths, more than the 5 read')
    assert.equal(
      (await layoutChanges(unread, [320, 2560], LATER())).issue,
      'how the texts lie at 700px was not read: the window was not 700px wide',
    )
    assert.match(
      (await layoutChanges(short, [320, 2560], LATER())).issue ?? '',
      /^how the texts lie at \d+px was not read: no answer$/u,
    )
    const time = await layoutChanges(stepped([640]).probe, [320, 2560], Date.now() - 1)
    assert.match(time.issue ?? '', /not read at every width within the sweep's time$/u)
  })

  it("races every batch against the sweep's time: a late or silent one fails, a timely one passes", async () => {
    const LATE_ISSUE = "how the texts lie inside the bands was not read at every width within the sweep's time"
    // The batches after the first answer 200ms late, past a 60ms budget.
    let calls = 0
    const slow = (ws: number[]): Promise<Lie[]> => {
      calls += 1
      const answer = ws.map((w) => ({ state: `lies ${String(w >= 640 ? 1 : 0)}` }))
      return calls <= 1 ? Promise.resolve(answer) : new Promise<Lie[]>((r) => setTimeout(() => r(answer), 200))
    }
    const started = Date.now()
    assert.deepEqual(await layoutChanges(slow, [320, 2560], Date.now() + 60), { ends: [320, 2560], issue: LATE_ISSUE })
    assert.ok(Date.now() - started < 190, 'it returns when the time runs out, not when the probe answers')
    // Batches that each take 10ms, at a pace that would read the band's 2241 widths past a 200ms budget: it fails after
    // the first, not when the time runs out.
    const steady = (ws: number[]): Promise<Lie[]> =>
      new Promise<Lie[]>((r) => setTimeout(() => r(ws.map(() => ({ state: 'a' }))), 10))
    const paced = Date.now()
    assert.equal((await layoutChanges(steady, [320, 2560], Date.now() + 200)).issue, LATE_ISSUE)
    assert.ok(Date.now() - paced < 100, 'it fails once the pace shows the rest will not be read in time')
    // The same pace over a band it can read in time passes.
    assert.deepEqual(await layoutChanges(steady, [320, 380], Date.now() + 1000), { ends: [320, 380], issue: null })
    // A batch that never answers.
    assert.equal((await layoutChanges(silent, [320, 2560], Date.now() + 30)).issue, LATE_ISSUE)
    // A batch whose page work runs past the time before it answers: its change is not taken.
    const until = Date.now() + 40
    const spin = (ws: number[]): Promise<Lie[]> => {
      while (Date.now() <= until) Math.sqrt(ws.length)
      return Promise.resolve(ws.map((w) => ({ state: `lies ${String(w >= 321 ? 1 : 0)}` })))
    }
    assert.equal((await layoutChanges(spin, [320, 322], until)).issue, LATE_ISSUE)
    // The same batch in time takes the change.
    assert.deepEqual(await layoutChanges(quick, [320, 322], Date.now() + 1000), { ends: [320, 321, 322], issue: null })
  })
})

const BLACK: Style = { ...STATIC, 'background-color': 'rgb(0, 0, 0)' }
/**
 * The owner's page at one width (4200072778): a body (1) and its root (9), a layout 100px high (2) holding a black item
 * (3) at `item`, and the frozen paragraph b1 (4) with its text (5) on one line below the layout.
 */
function owner(item: Edges, extra: Record<number, Spec> = {}, style: Style = BLACK): Layout {
  return layout({
    9: { parent: 0, name: 'html', box: [0, 0, 1000, 800] },
    1: { parent: 9, name: 'body', box: [0, 0, 1000, 800] },
    2: { parent: 1, name: 'div.layout', box: [0, 0, 1000, 100] },
    3: { parent: 2, name: 'div.second', box: item, style },
    4: { parent: 1, name: 'p', block: 'b1', box: [0, 100, 100, 132] },
    5: { parent: 4, kind: 'text', text: 'Not free.', box: [0, 100, 90, 132] },
    ...extra,
  })
}
const LINE = new Map<number, Edges[]>([[5, [[0, 100, 90, 132]]]])

/** A snapshot of a window `window` high: its root element `root` high, a paragraph, and its one line at `line` (shapeOf). */
const shaped = (window: number, root: number, line: number) => ({
  documents: [
    {
      // The document (9), whose box is the window's, then the root element, a paragraph and its text.
      nodes: { parentIndex: [-1, 0, 1, 2], nodeType: [9, 1, 1, 3] },
      layout: {
        nodeIndex: [0, 1, 2, 3],
        styles: [[], [], [], []],
        bounds: [
          [0, 0, 800, window],
          [0, 0, 800, root],
          [0, 0, 800, 24],
          [0, line, 60, 17],
        ],
      },
      textBoxes: { layoutIndex: [3], bounds: [[0, line, 60, 17]] },
    },
  ],
  strings: [],
})

describe('how the texts lie at one width (#117, placement.mjs meetingsIn)', () => {
  it('names a drawn box that lies on a line of text, and nothing for one beside it or the boxes the text is in', () => {
    assert.equal(meetingsIn(owner([500, 0, 1000, 100]), LINE), '')
    assert.equal(meetingsIn(owner([0, 100, 600, 200]), LINE), '5:3')
    // A box past the rows the boxes are indexed by, and one on the text's row far below the page's top.
    assert.equal(meetingsIn(owner([0, -5000, 600, 9000]), LINE), '5:3')
    const low = new Map<number, Edges[]>([[5, [[0, 8100, 90, 8132]]]])
    assert.equal(meetingsIn(owner([0, 8110, 600, 8200]), low), '5:3')
    // Touching is not lying on it; overlapping by a pixel is.
    assert.equal(meetingsIn(owner([0, 132, 600, 200]), LINE), '')
    assert.equal(meetingsIn(owner([0, 131, 600, 200]), LINE), '5:3')
    // A box that draws nothing lies on nothing.
    assert.equal(meetingsIn(owner([0, 100, 600, 200], {}, STATIC), LINE), '')
    // The paragraph's own background is the box the text is in.
    const own = owner([500, 0, 1000, 100], { 4: { parent: 1, block: 'b1', box: [0, 100, 100, 132], style: BLACK } })
    assert.equal(meetingsIn(own, LINE), '')
  })

  it('reads a box by its ink, its outer shadows and outline included, and inside what its ancestors clip', () => {
    const shadow = (s: string) => owner([0, 0, 600, 50], {}, { ...STATIC, 'box-shadow': s })
    assert.equal(meetingsIn(shadow('rgb(0, 0, 0) 0px 60px 0px 20px'), LINE), '5:3')
    assert.equal(meetingsIn(shadow('rgb(0, 0, 0) 0px 60px 0px 20px inset'), LINE), '')
    assert.equal(meetingsIn(shadow('rgba(0, 0, 0, 0.2) 0px 1px 3px 0px'), LINE), '')
    const outline = { ...STATIC, 'outline-style': 'solid', 'outline-width': '40px', 'outline-offset': '20px' }
    assert.equal(meetingsIn(owner([0, 0, 600, 50], {}, outline), LINE), '5:3')
    // The layout clips what it holds: the item's part below it is not drawn.
    const clipped = owner([0, 100, 600, 200], {
      2: { parent: 1, box: [0, 0, 1000, 100], style: { ...STATIC, 'overflow-y': 'hidden' } },
    })
    assert.equal(meetingsIn(clipped, LINE), '')
  })

  it('leaves out an inline box or a text of the same block of lines, and names one of another block', () => {
    const mark = { ...BLACK, display: 'inline' }
    const inOwn = owner([500, 0, 1000, 100], { 6: { parent: 4, box: [50, 95, 120, 135], style: mark } })
    assert.equal(meetingsIn(inOwn, LINE), '')
    const inOther = owner([500, 0, 1000, 100], { 6: { parent: 2, box: [50, 95, 120, 135], style: mark } })
    assert.equal(meetingsIn(inOther, LINE), '5:6')
    // Another block's text, on the paragraph's line.
    const text = owner([500, 0, 1000, 100], { 7: { parent: 2, kind: 'text', text: 'Over.', box: [0, 90, 80, 120] } })
    assert.equal(meetingsIn(text, new Map([...LINE, [7, [[0, 90, 80, 120]]]])), '5:7 7:5')
  })

  it('names a line a clip cuts, a line off the page, and a line outside its section', () => {
    const cut = owner([500, 0, 1000, 100], {
      4: { parent: 1, block: 'b1', box: [0, 100, 100, 120], style: { ...STATIC, 'overflow-y': 'clip' } },
    })
    assert.equal(meetingsIn(cut, LINE), '5:!cut')
    assert.equal(meetingsIn(owner([500, 0, 1000, 100]), new Map([[5, [[960, 100, 1050, 132]]]])), '5:!off')
    const sections = owner([500, 0, 1000, 100], {
      1: { parent: 9, name: 'section', section: 's1', box: [0, 0, 1000, 110] },
    })
    assert.equal(meetingsIn(sections, LINE), '5:!out')
  })

  it('reads a snapshot: its lines, a page wider than its window, and a bound', () => {
    const strings = ['HTML', 'P', '#text', 'Not free.', 'visible', 'block', '#document']
    // Each layout box's styles: a block, visible, its overflow visible; the rest none.
    const named: Record<string, number> = { display: 5, visibility: 4, 'overflow-x': 4, 'overflow-y': 4 }
    const style = () => STYLES.map((name) => named[name] ?? -1)
    const snapshot = (contentWidth: number, x = 0) => ({
      documents: [
        {
          // The document (9), as the protocol lists it first, then the root element, a paragraph and its text.
          nodes: {
            parentIndex: [-1, 0, 1, 2],
            nodeType: [9, 1, 1, 3],
            nodeName: [6, 0, 1, 2],
            nodeValue: [-1, -1, -1, 3],
            backendNodeId: [9, 10, 11, 12],
            attributes: [[], [], [], []],
          },
          layout: {
            nodeIndex: [1, 2, 3],
            styles: [style(), style(), style()],
            bounds: [
              [0, 0, 800, 600],
              [0, 0, 800, 24],
              [x, 3, 60, 17],
            ],
          },
          textBoxes: { layoutIndex: [2], bounds: [[x, 3, 60, 17]] },
          contentWidth,
        },
      ],
      strings,
    })
    assert.deepEqual(meetingsOf(snapshot(800)), { state: '' })
    assert.deepEqual(meetingsOf(snapshot(800.5)), { state: 'wide ' })
    assert.deepEqual(meetingsOf(snapshot(1200)), { state: 'wide ' })
    // A line past the root element's right edge is off the page.
    assert.deepEqual(meetingsOf(snapshot(850, 790)), { state: 'wide 12:!off' })
    assert.deepEqual(meetingsOf(snapshot(800), { maxNodes: 2 }), {
      issue: '3 boxes, more than the 2 whose placements are compared',
    })
  })

  // #117 (4201008903): what a window's height alone must leave as it is (capture-html.mjs heightIssue).
  it("reads where a snapshot lays out its boxes and lines, the window's own box left out, within a bound", () => {
    const own = shapeOf(shaped(800, 600, 3))
    assert.equal(shapeOf(shaped(320, 600, 3)), own, 'a shorter window, the page laid out the same')
    assert.notEqual(shapeOf(shaped(320, 320, 3)), own, 'a root as tall as the window')
    assert.notEqual(shapeOf(shaped(800, 600, 300)), own, 'a line placed elsewhere')
    assert.equal(shapeOf(shaped(800, 600, 3), { maxNodes: 3 }), null)
    assert.equal(shapeOf({ documents: [], strings: [] }), null)
  })
})

describe("the placements read within the sweep's time (#117, placement.mjs)", () => {
  const one = end([100, 100, 180, 130], [200, 100, 260, 130])

  it('takes an answer in time, and drops one that comes late', async () => {
    assert.deepEqual(await withinTime(Promise.resolve(7), Date.now() + 1000), { value: 7 })
    assert.deepEqual(await withinTime(new Promise((r) => setTimeout(() => r(7), 200)), Date.now() + 20), { late: true })
  })

  it('fails a band end whose snapshot answers late, and passes one that answers in time', async () => {
    const late = await placementStep(readAfter(200, one), { width: 2560, state: 's' }, null, Date.now() + 20)
    assert.deepEqual(late, { issue: "at 2560px: placements not read within the sweep's time", end: null })
    const ok = await placementStep(readAfter(5, one), { width: 2560, state: 's' }, null, Date.now() + 1000)
    assert.equal(ok.issue, null)
    assert.equal(ok.end?.width, 2560)
  })

  it('fails a band end compared past the time, and names a crossing found in time', async () => {
    const before = { width: 320, state: 's', layout: end([100, 100, 180, 130], [200, 100, 260, 130]) }
    const crossed = end([100, 100, 180, 130], [20, 100, 80, 130])
    const past = await placementStep(
      () => Promise.resolve(crossed),
      { width: 2560, state: 's' },
      before,
      Date.now() - 1,
    )
    assert.match(past.issue ?? '', /^at 2560px: placements not (read|compared) within the sweep's time$/u)
    const met = await placementStep(() => Promise.resolve(crossed), { width: 2560, state: 's' }, before, LATER())
    assert.equal(met.issue, 'between 320 and 2560px: 1 placed boxes and texts may meet: div.cover and b1')
    const other = await placementStep(() => Promise.resolve(crossed), { width: 2560, state: 't' }, before, LATER())
    assert.equal(other.issue, null, 'another band')
  })
})

/** A snapshot of a page: html, head, body, a p with a ::before (one box and an empty one), its text and an ::after in two
 * boxes, and a li whose ::marker draws a glyph, not a box. */
function withGenerated() {
  const strings = [
    'HTML',
    'HEAD',
    'BODY',
    'P',
    '::before',
    'before',
    '#text',
    'LI',
    '::marker',
    'marker',
    '::after',
    'after',
  ]
  return {
    documents: [
      {
        nodes: {
          parentIndex: [-1, 0, 0, 2, 3, 3, 3, 2, 7],
          nodeType: [1, 1, 1, 1, 1, 3, 1, 1, 1],
          nodeName: [0, 1, 2, 3, 4, 6, 10, 7, 8],
          backendNodeId: [10, 11, 12, 13, 14, 15, 16, 17, 18],
          pseudoType: { index: [4, 6, 8], value: [5, 11, 9] },
        },
        layout: {
          nodeIndex: [0, 2, 3, 4, 4, 5, 6, 6, 7, 8],
          styles: [[], [], [], [], [], [], [], [], [], []],
          bounds: [
            [0, 0, 800, 600],
            [0, 0, 800, 600],
            [8, 16, 784, 24],
            [8, 16, 784, 24],
            [0, 0, 0, 0],
            [8, 19, 90, 17],
            [700, 40, 10, 10],
            [8, 50, 20, 10],
            [8, 80, 784, 24],
            [-10, 80, 7, 17],
          ],
        },
      },
    ],
    strings,
  }
}

describe('where generated boxes lie, for the paint beneath a text (#117, placement.mjs)', () => {
  it("reads each ::before and ::after by its element's place among the page's elements, its boxes joined", () => {
    assert.deepEqual(generatedOf(withGenerated()), {
      elements: 5,
      boxes: [
        { at: 3, tag: 'P', pseudo: '::before', box: [8, 16, 792, 40], pieces: 1 },
        { at: 3, tag: 'P', pseudo: '::after', box: [8, 40, 710, 60], pieces: 2 },
      ],
    })
  })

  it('reads none past its bound, or from a snapshot whose boxes it cannot place', () => {
    assert.equal(generatedOf(withGenerated(), { maxGenerated: 1 }), null, 'past the bound')
    assert.equal(generatedOf(withGenerated(), { maxGenerated: 2 })?.boxes.length, 2, 'at the bound')
    const orphan = withGenerated()
    orphan.documents[0]!.nodes.parentIndex[4] = 5
    assert.equal(generatedOf(orphan), null, 'a generated box whose parent is no element')
    assert.equal(generatedOf({ documents: [], strings: [] }), null, 'no document')
    assert.equal(generatedOf(null), null, 'no snapshot')
  })

  it('reads them within the time, and none from a snapshot that answers late or fails', async () => {
    const answering = (ms: number, fail = false) =>
      ({
        send: () =>
          new Promise((resolve, reject) => {
            setTimeout(() => (fail ? reject(new Error('protocol')) : resolve(withGenerated())), ms)
          }),
      }) as unknown as Parameters<typeof generatedAt>[0]
    assert.equal((await generatedAt(answering(5), Date.now() + 1000))?.boxes.length, 2, 'in time')
    const start = Date.now()
    assert.equal(await generatedAt(answering(300), Date.now() + 20), null, 'late')
    assert.ok(Date.now() - start < 200, 'it returns when the time is out, not when the snapshot answers')
    assert.equal(await generatedAt(answering(5, true), Date.now() + 1000), null, 'failed')
  })
})
