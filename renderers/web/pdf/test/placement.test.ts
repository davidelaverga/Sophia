// #117, SDD-CX45: where placed boxes and texts may meet between the ends of a band (placement.mjs). The capture kernel's
// browser tests read real pages; these read layouts written out, for the pair rule and every bound.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  layoutChanges,
  layoutOf,
  PLACEMENT,
  placementIssue,
  placementStep,
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
const styleWith = (position: number): number[] => [position, ...Array.from({ length: 33 }, () => -1)]

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

/** A page whose one container's lines change at each of `at`, and that holds placed boxes or not; it counts probes. */
function stepped(at: readonly number[], placed = true) {
  const widths: number[] = []
  const probe = (width: number) => {
    widths.push(width)
    return Promise.resolve({ state: `lines ${String(at.filter((w) => width >= w).length)}`, placed })
  }
  return { probe, widths }
}
const LATER = (): number => Date.now() + 60_000
/** A page whose probe at 2560px never answers. */
const silent = (width: number): Promise<{ state: string; placed: boolean }> =>
  width === 2560 ? new Promise<never>(() => {}) : Promise.resolve({ state: 'a', placed: true })
/** A page whose one container's lines change at 321px, answering at once. */
const quick = (width: number): Promise<{ state: string; placed: boolean }> =>
  Promise.resolve({ state: `lines ${String(width >= 321 ? 1 : 0)}`, placed: true })
/** A reader that answers with `answer` after `ms`. */
const readAfter = (ms: number, answer: Layout) => (): Promise<Layout> =>
  new Promise<Layout>((resolve) => {
    setTimeout(() => resolve(answer), ms)
  })

describe("a container's lines changing inside a band (#117, placement.mjs)", () => {
  it('finds each change to the pixel and measures the widths either side of it as band ends', async () => {
    const page = stepped([640, 960, 1280])
    const { ends, issue } = await layoutChanges(page.probe, [320, 2560], LATER())
    assert.equal(issue, null)
    assert.deepEqual(ends, [320, 639, 640, 959, 960, 1279, 1280, 2560])
    assert.ok(page.widths.length <= 2 + 3 * 12, `${String(page.widths.length)} probes`)
  })

  it('leaves a band without placed boxes, and one whose lines do not change, as it is', async () => {
    const plain = stepped([640, 960], false)
    assert.deepEqual(await layoutChanges(plain.probe, [320, 2560], LATER()), { ends: [320, 2560], issue: null })
    assert.deepEqual(plain.widths, [320, 2560])
    const still = stepped([])
    assert.deepEqual(await layoutChanges(still.probe, [320, 599, 600, 2560], LATER()), {
      ends: [320, 599, 600, 2560],
      issue: null,
    })
  })

  it('fails past its changes, its probes or its time, never leaving a change out', async () => {
    const many = Array.from({ length: 40 }, (_, i) => 400 + i * 50)
    const changes = await layoutChanges(stepped(many).probe, [320, 2560], LATER())
    assert.match(changes.issue ?? '', /^more than 32 changes of a grid's, a flex container's or columns' lines/u)
    const probes = await layoutChanges(stepped([640, 960]).probe, [320, 2560], LATER(), { ...PLACEMENT, maxProbes: 5 })
    assert.match(probes.issue ?? '', /not found within 5 widths$/u)
    const time = await layoutChanges(stepped([640]).probe, [320, 2560], Date.now() - 1)
    assert.match(time.issue ?? '', /not found within the sweep's time$/u)
  })

  it("races every probe against the sweep's time: a late or silent probe fails, a timely one passes", async () => {
    const LATE_ISSUE = "the changes of a container's lines inside the bands were not found within the sweep's time"
    // The bisection's last probes answer 200ms late, past a 60ms budget.
    let calls = 0
    const slow = (width: number) => {
      calls += 1
      const answer = { state: `lines ${String(width >= 640 ? 1 : 0)}`, placed: true }
      return calls <= 4 ? Promise.resolve(answer) : new Promise<typeof answer>((r) => setTimeout(() => r(answer), 200))
    }
    const started = Date.now()
    assert.deepEqual(await layoutChanges(slow, [320, 2560], Date.now() + 60), {
      ends: [320, 2560],
      issue: LATE_ISSUE,
    })
    assert.ok(Date.now() - started < 190, 'it returns when the time runs out, not when the probe answers')
    // A band end's probe that never answers.
    assert.equal((await layoutChanges(silent, [320, 2560], Date.now() + 30)).issue, LATE_ISSUE)
    // A probe whose page work runs past the time before it answers: the last change is not taken.
    const until = Date.now() + 40
    const spin = (width: number) => {
      if (width === 321) while (Date.now() <= until) Math.sqrt(width)
      return Promise.resolve({ state: `lines ${String(width >= 321 ? 1 : 0)}`, placed: true })
    }
    assert.equal((await layoutChanges(spin, [320, 322], until)).issue, LATE_ISSUE)
    // The same probes in time take the change.
    assert.deepEqual(await layoutChanges(quick, [320, 322], Date.now() + 1000), { ends: [320, 321, 322], issue: null })
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
