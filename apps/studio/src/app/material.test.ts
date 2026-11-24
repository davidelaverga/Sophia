import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The room's material on paper (docs/plans/light-material.md, informe-claro D8): the lift and the sheen are white light
// that paints nothing on a white sheet, the primary's bevel took the void and turned lighter below on paper, and the
// glass composed the page's own colour, so a field stood 1.00:1 apart from it. Now paper has its own: an ink bevel
// below, glass opaque off the stage and glass over it; and the room's values are the ones it paints today.

const uncommented = (css: string) => css.replaceAll(/\/\*[\s\S]*?\*\//g, '')
const themeCss = uncommented(readFileSync(new URL('theme.css', import.meta.url), 'utf8'))

/** The custom properties a block of theme.css declares, by name. */
function tokens(selector: string): Map<string, string> {
  const start = themeCss.indexOf(`${selector} {`)
  assert.notEqual(start, -1, selector)
  const body = themeCss.slice(start, themeCss.indexOf('}', start))
  return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]))
}

const ROOM = tokens(':root')
const OWN_PAPER = tokens(":root[data-theme='light']")
const PAPER = new Map([...ROOM, ...OWN_PAPER])
const THEMES = [
  ['room', ROOM],
  ['paper', PAPER],
] as const
const MATERIAL = ['--sheen-rgb', '--lift', '--bevel', '--glass', '--glass-stage'] as const

/** A token's value in a theme, through the token it names when it is only that. */
function value(theme: ReadonlyMap<string, string>, name: string, depth = 0): string {
  const v = theme.get(name)
  assert.ok(v !== undefined && depth < 8, `${name} is declared`)
  const named = /^var\((--[\w-]+)\)$/.exec(v)
  return named ? value(theme, named[1] ?? '', depth + 1) : v
}

type Rgba = readonly [number, number, number, number]

/** A colour as written in the tokens: #rrggbb, rgba(r, g, b, a), or channels with an alpha. */
function rgba(colour: string): Rgba {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(colour)
  if (hex) return [...[hex[1], hex[2], hex[3]].map((x) => parseInt(x ?? '', 16)), 1] as unknown as Rgba
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(colour)
  assert.ok(fn, `${colour} is a colour`)
  return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])]
}

/** A one-pixel inset line: its offset down and its colour, the channel token resolved in the theme. */
function insetLine(theme: ReadonlyMap<string, string>, name: string): { dy: number; colour: Rgba } {
  const line = /^inset 0 (-?1)px 0 rgb\(var\((--[\w-]+)\) \/ ([\d.]+)\)$/.exec(value(theme, name))
  assert.ok(line, `${name} is one inset line: ${value(theme, name)}`)
  const [r = 0, g = 0, b = 0] = value(theme, line[2] ?? '')
    .split(' ')
    .map(Number)
  return { dy: Number(line[1]), colour: [r, g, b, Number(line[3])] }
}

/** One colour laid over an opaque one. */
const over = ([r, g, b, a]: Rgba, [ur, ug, ub]: Rgba): Rgba => [
  r * a + ur * (1 - a),
  g * a + ug * (1 - a),
  b * a + ub * (1 - a),
  1,
]

/** One sRGB channel, linear. */
const channel = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
/** An opaque colour's share of the light, as WCAG counts it. */
const light = ([r, g, b]: Rgba) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** What the innermost rules of theme.css whose selector is exactly this one declare for a property. */
function declared(selector: string, property: string): string[] {
  return [...themeCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, sel = '']) => sel.trim() === selector)
    .flatMap(([, , body = '']) => [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`, 'g'))])
    .map((m) => (m[1] ?? '').trim())
}

/** What floats over the stage, over her orb and the tiles' video: the dock and its notes, the panel toggles, what she
 * made and who shows what, a reconnect over the tiles, the reactions. */
const OVER_STAGE = [
  '.dock',
  '.dock-note',
  '.sophia-looking',
  '.panel-toggles',
  '.stage-made',
  '.stage-showing',
  '.stage-reconnecting',
  '.reaction',
] as const

describe('the material, by theme (informe-claro D8)', () => {
  it('in the room is what it paints today, so it renders as before', () => {
    assert.equal(value(ROOM, '--sheen-rgb'), '255 255 255')
    assert.equal(value(ROOM, '--lift'), 'inset 0 1px 0 rgb(var(--sheen-rgb) / 0.04)')
    // The primary's bevel as `.pill.primary` wrote it: the void at 0.16, a line under its face.
    assert.equal(value(ROOM, '--bevel'), 'inset 0 -1px 0 rgb(var(--void-rgb) / 0.16)')
    assert.equal(value(ROOM, '--glass'), 'rgba(12, 11, 17, 0.74)')
    assert.equal(value(ROOM, '--glass-stage'), 'rgba(12, 11, 17, 0.74)')
  })

  it('on paper is paper’s own: no token of it falls through from the room', () => {
    for (const name of MATERIAL) assert.ok(OWN_PAPER.has(name), `${name} has a paper value`)
    // A sheen on paper is white over a white sheet, the lit plane already: it paints nothing, by decision.
    assert.equal(value(PAPER, '--sheen-rgb'), '255 255 255')
    assert.deepEqual(rgba(value(PAPER, '--plane-2')), [255, 255, 255, 1])
  })

  it('on paper the lift is an ink bevel below, as strong as the room’s sheen above', () => {
    const lift = insetLine(PAPER, '--lift')
    assert.equal(lift.dy, -1, 'under the face, not over it')
    assert.deepEqual(lift.colour.slice(0, 3), value(PAPER, '--ink-rgb').split(' ').map(Number))
    const room = insetLine(ROOM, '--lift')
    const raised = rgba(value(ROOM, '--plane-2'))
    const roomStep = ratio(light(over(room.colour, raised)), light(raised))
    for (const ground of ['--plane-2', '--void']) {
      const under = rgba(value(PAPER, ground))
      const line = light(over(lift.colour, under))
      assert.ok(line < light(under), `${ground}: darker`)
      const step = ratio(line, light(under))
      assert.ok(
        step >= 1.05 && Math.abs(step - roomStep) < 0.03,
        `${ground}: ${step.toFixed(3)} (room ${roomStep.toFixed(3)})`,
      )
    }
  })

  it('the primary’s bevel is darker below in both themes, by the same step', () => {
    assert.deepEqual(declared('.pill.primary', 'box-shadow'), ['var(--bevel)'])
    const steps = THEMES.map(([name, theme]) => {
      const bevel = insetLine(theme, '--bevel')
      const face = rgba(value(theme, '--core'))
      const line = light(over(bevel.colour, face))
      assert.equal(bevel.dy, -1, `${name}: under the face`)
      assert.ok(line < light(face), `${name}: darker below`)
      return ratio(line, light(face))
    })
    const [room = 0, paper = 0] = steps
    assert.ok(room >= 1.3 && Math.abs(room - paper) < 0.05, steps.map((s) => s.toFixed(3)).join(' / '))
  })

  it('on paper glass is opaque and stands apart from the page; over the stage it stays glass', () => {
    const glass = rgba(value(PAPER, '--glass'))
    assert.equal(glass[3], 1, 'opaque')
    const step = ratio(light(glass), light(rgba(value(PAPER, '--void'))))
    assert.ok(step >= 1.04, `field to page ${step.toFixed(3)}`)
    const stage = rgba(value(PAPER, '--glass-stage'))
    assert.ok(stage[3] < 1, 'translucent over her orb and the video')
    for (const sel of OVER_STAGE) assert.deepEqual(declared(sel, 'background'), ['var(--glass-stage)'], sel)
  })
})
