import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The surfaces by level (docs/plans/light-surfaces.md, informe-claro D6): the page, a well, a raised sheet and an
// overlay climb in both themes; the room's are the planes it paints today, so it renders as before; and no rule paints
// `--plane` any more, whose paper value sat 1.07:1 under the page and sank what rises in the room.

const src = new URL('../', import.meta.url)
const uncommented = (css: string) => css.replaceAll(/\/\*[\s\S]*?\*\//g, '')
const themeCss = uncommented(readFileSync(new URL('app/theme.css', src), 'utf8'))

/** The custom properties a block of theme.css declares, by name. */
function tokens(selector: string): Map<string, string> {
  const start = themeCss.indexOf(`${selector} {`)
  assert.notEqual(start, -1, selector)
  const body = themeCss.slice(start, themeCss.indexOf('}', start))
  return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]))
}

const ROOM = tokens(':root')
const PAPER = new Map([...ROOM, ...tokens(":root[data-theme='light']")])
const THEMES = [
  ['room', ROOM],
  ['paper', PAPER],
] as const
const LEVELS = ['--surface-page', '--surface-well', '--surface-raised', '--surface-overlay'] as const

/** A token's value in a theme, through the tokens it names. */
function colour(theme: ReadonlyMap<string, string>, name: string, depth = 0): string {
  const value = theme.get(name)
  assert.ok(value !== undefined && depth < 8, `${name} is declared`)
  const named = /^var\((--[\w-]+)\)$/.exec(value)
  return named ? colour(theme, named[1] ?? '', depth + 1) : value
}

/** One sRGB channel, linear. */
const channel = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)

/** A #rrggbb colour's share of the light, as WCAG counts it. */
function light(hex: string): number {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  assert.ok(m, `${hex} is a #rrggbb colour`)
  const [r = 0, g = 0, b = 0] = [m[1], m[2], m[3]].map((x) => channel(parseInt(x ?? '', 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** The four levels' light in a theme, page first. */
function levels(theme: ReadonlyMap<string, string>): [number, number, number, number] {
  const [page = NaN, well = NaN, raised = NaN, overlay = NaN] = LEVELS.map((t) => light(colour(theme, t)))
  return [page, well, raised, overlay]
}

/** Every declaration in the Studio's CSS that paints `--plane` (a token naming it aside), as "file selector: property". */
function planePainted(): string[] {
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.css'))
  return files.flatMap((file) => {
    const path = file.replaceAll('\\', '/')
    // Innermost rules: a media query's head stays outside the selector it holds.
    const rules = uncommented(readFileSync(new URL(path, src), 'utf8')).matchAll(/([^{}]+)\{([^{}]*)\}/g)
    return [...rules].flatMap(([, selector = '', body = '']) =>
      body
        .split(';')
        .map((d) => d.trim())
        .filter((d) => /var\(--plane\)/.test(d) && !d.startsWith('--'))
        .map((d) => `${path} ${selector.trim()}: ${d.slice(0, d.indexOf(':'))}`),
    )
  })
}

describe('the surfaces, by level (informe-claro D6)', () => {
  it('climb in both themes: the page under a well under a raised sheet, an overlay at least as raised', () => {
    for (const [name, theme] of THEMES) {
      const [page, well, raised, overlay] = levels(theme)
      const said = `${name}: ${LEVELS.map((t) => colour(theme, t)).join(', ')}`
      assert.ok(page < well && well < raised && raised <= overlay, said)
    }
  })

  it('in the room are the planes it paints today, so it renders as before', () => {
    assert.deepEqual(
      LEVELS.map((t) => colour(ROOM, t)),
      ['#050408', '#0b0a0f', '#121118', '#121118'],
    )
  })

  it('on paper the well is a step over the page and a step under white, as the room’s plane is over its void', () => {
    // The room climbs 1.036:1 from the void to the plane and 1.051:1 on to the raised plane; paper has 1.059:1 from its
    // page to white, so each of its steps is smaller, but both are there.
    const [page, well, raised] = levels(PAPER)
    assert.ok(ratio(page, well) >= 1.02, `page to well ${ratio(page, well).toFixed(3)}`)
    assert.ok(ratio(well, raised) >= 1.02, `well to raised ${ratio(well, raised).toFixed(3)}`)
  })

  it('no rule paints the plane: each reads the surface of its level', () => {
    assert.deepEqual(planePainted(), [])
  })
})
