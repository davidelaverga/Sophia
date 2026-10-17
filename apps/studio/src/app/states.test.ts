import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The states (docs/plans/light-states.md, informe-claro D20): on paper a field, a control at rest and the one chosen on
// its track are white pieces over what holds them, where the ink at an alpha sank them; hover, selection and the focus
// ring stay in the ink. In the room each token is the alpha its rules painted by hand, so the room renders as before.

const src = new URL('../', import.meta.url)
const uncommented = (css: string) => css.replaceAll(/\/\*[\s\S]*?\*\//g, '')
const read = (path: string) => uncommented(readFileSync(new URL(path, src), 'utf8'))
const themeCss = read('app/theme.css')

/** The custom properties a block of theme.css declares, by name. */
function tokens(selector: string): Map<string, string> {
  const start = themeCss.indexOf(`${selector} {`)
  assert.notEqual(start, -1, selector)
  const body = themeCss.slice(start, themeCss.indexOf('}', start))
  return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]))
}

const ROOM = tokens(':root')
const PAPER = new Map([...ROOM, ...tokens(":root[data-theme='light']")])

/** Each token as the room declares it: the alpha its rules wrote by hand, or a shadow that paints nothing. */
const IN_THE_ROOM = {
  '--field': 'rgb(var(--ink-rgb) / 0.03)',
  '--field-focus': 'rgb(var(--ink-rgb) / 0.05)',
  '--control': 'rgb(var(--ink-rgb) / 0.04)',
  '--control-quiet': 'rgb(var(--ink-rgb) / 0.03)',
  '--control-selected': 'rgb(var(--ink-rgb) / 0.08)',
  '--control-selected-quiet': 'rgb(var(--ink-rgb) / 0.075)',
  '--control-selected-shadow': '0 0 transparent',
  '--control-track': 'var(--glass)',
  '--state-hover': 'rgb(var(--ink-rgb) / 0.06)',
  '--state-selected': 'rgb(var(--ink-rgb) / 0.06)',
  '--focus-ring': 'rgb(var(--halo-text-rgb) / 0.7)',
} as const
const WHITE = [
  '--field',
  '--field-focus',
  '--control',
  '--control-quiet',
  '--control-selected',
  '--control-selected-quiet',
]
const INK = ['--state-hover', '--state-selected']

/** A value with every token it names put in, through the tokens those name. */
function resolve(theme: ReadonlyMap<string, string>, value: string, depth = 0): string {
  return value.replaceAll(/var\((--[\w-]+)\)/g, (_, name: string) => {
    const named = theme.get(name)
    assert.ok(named !== undefined && depth < 8, `${name} is declared`)
    return resolve(theme, named, depth + 1)
  })
}

/** A colour as its channels and alpha: #rrggbb, or rgb(r g b / a). */
function rgba(colour: string): [number, number, number, number] {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(colour)
  if (hex) return [parseInt(hex[1] ?? '', 16), parseInt(hex[2] ?? '', 16), parseInt(hex[3] ?? '', 16), 1]
  const fn = /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(colour)
  assert.ok(fn, `${colour} is a colour`)
  return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])]
}

/** One sRGB channel, linear. */
const channel = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)

/** A token's share of the light in a theme, laid over a ground (an opaque token) when it lets some through. */
function light(theme: ReadonlyMap<string, string>, name: string, ground: string): number {
  const [r, g, b, a] = rgba(resolve(theme, `var(${name})`))
  const [gr, gg, gb] = rgba(resolve(theme, `var(${ground})`))
  const mix = (c: number, u: number) => channel(c * a + u * (1 - a))
  return 0.2126 * mix(r, gr) + 0.7152 * mix(g, gg) + 0.0722 * mix(b, gb)
}

/** Every innermost rule of the Studio's CSS: its file, its selector (spaces collapsed) and its declarations. */
function rules(): { file: string; selector: string; decls: Map<string, string> }[] {
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.css'))
  return files.flatMap((file) => {
    const path = file.replaceAll('\\', '/')
    return [...read(path).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector = '', body = '']) => ({
      file: path,
      selector: selector.trim().replaceAll(/\s+/g, ' '),
      decls: new Map(
        body
          .split(';')
          .map((d) => d.trim())
          .filter((d) => d.includes(':'))
          .map((d) => [
            d.slice(0, d.indexOf(':')).trim(),
            d
              .slice(d.indexOf(':') + 1)
              .trim()
              .replaceAll(/\s+/g, ' '),
          ]),
      ),
    }))
  })
}
const RULES = rules()

/** What a rule of a file declares for a property: undefined where the rule or the property is missing. */
const declared = (file: string, selector: string, property: string) =>
  RULES.find((r) => r.file === file && r.selector === selector)?.decls.get(property)

const THEME = 'app/theme.css'
/** A rule of paper's alone, as light as `selector`'s own (light-states.md). */
const onPaper = (selector: string) => `:where(:root[data-theme='light']) ${selector}`
const READS = [
  [THEME, ':focus-visible', 'outline', '2px solid var(--focus-ring)'],
  [THEME, '.goal-press:focus-visible::after', 'box-shadow', '0 0 0 2px var(--focus-ring)'],
  [THEME, 'input, textarea', 'background', 'var(--field)'],
  [THEME, 'input:focus-visible, textarea:focus-visible', 'background', 'var(--field-focus)'],
  [THEME, 'select', 'background', 'var(--field)'],
  [THEME, '.device-choice-open', 'background', 'var(--field)'],
  ['features/resources/resources.css', '.act-guide input', 'background', 'var(--field)'],
  [THEME, '.pill', 'background', 'var(--control)'],
  ['features/work/planning/board.css', '.decision-pill', 'background', 'var(--control)'],
  [THEME, '.round', 'background', 'var(--control-quiet)'],
  [THEME, '.segmented', 'background', 'var(--control-track)'],
  [THEME, '.segmented::before', 'background', 'var(--control-selected)'],
  [
    'features/artifacts/artifacts.css',
    ".knowledge-filters .segmented button[aria-pressed='true']",
    'background',
    'var(--control-selected)',
  ],
  [
    'features/conversations/conversations.css',
    ".conv-row[aria-pressed='true']",
    'background',
    'var(--control-selected-quiet)',
  ],
  [
    'features/conversations/conversations.css',
    ".conv-show button[aria-pressed='true']",
    'background',
    'var(--control-selected-quiet)',
  ],
  [THEME, ".palette-row[aria-selected='true']", 'background', 'var(--state-selected)'],
  ['features/artifacts/artifacts.css', ".pdf-rail button[aria-current='page']", 'background', 'var(--state-selected)'],
] as const

describe('the states (informe-claro D20)', () => {
  it('in the room are the alphas their rules painted, so the room renders as before', () => {
    for (const [name, value] of Object.entries(IN_THE_ROOM)) assert.equal(ROOM.get(name), value, name)
  })

  it('on paper a field, a control at rest and the one chosen are white: over the page and over a well', () => {
    for (const name of WHITE) {
      assert.equal(rgba(resolve(PAPER, `var(${name})`))[3], 1, `${name} is opaque on paper`)
      assert.ok(light(PAPER, name, '--void') > light(PAPER, '--void', '--void'), `${name} over the page`)
      assert.ok(light(PAPER, name, '--plane') > light(PAPER, '--plane', '--plane'), `${name} over a well`)
    }
  })

  it('hover and selection are said in the ink: they lift in the room and sink on paper', () => {
    for (const name of INK) {
      assert.ok(light(ROOM, name, '--void') > light(ROOM, '--void', '--void'), `${name} lifts the void`)
      assert.ok(light(PAPER, name, '--void') < light(PAPER, '--void', '--void'), `${name} sinks the paper`)
    }
  })

  it('the chosen piece’s shadow paints nothing in the room and on paper is the first level (light-shadows.md)', () => {
    assert.equal(PAPER.get('--control-selected-shadow'), 'var(--elev-1)')
  })

  it('on paper a track sinks under the white piece chosen on it, over the page and over a white sheet', () => {
    for (const ground of ['--void', '--plane-2']) {
      const track = light(PAPER, '--control-track', ground)
      assert.ok(track < light(PAPER, ground, ground), `the track sinks ${ground}`)
      assert.ok(light(PAPER, '--control-selected', ground) > track, `the chosen piece stands over it on ${ground}`)
    }
  })

  it('the fields, the controls and the states read them', () => {
    for (const [file, selector, property, value] of READS)
      assert.equal(declared(file, selector, property), value, `${file} ${selector}: ${property}`)
    // The track's background is said once, by the rule that reads its token.
    const tracks = RULES.filter((r) => /(^|\s)\.segmented$/.test(r.selector) && r.decls.has('background'))
    assert.deepEqual(
      tracks.map((r) => r.decls.get('background')),
      ['var(--control-track)'],
    )
  })

  it('a thumb, a pressed segment and the open conversation keep their room edges; paper adds the chosen level', () => {
    const edge = 'inset 0 0 0 1px rgb(var(--ink-rgb) / 0.08)'
    const artifacts = 'features/artifacts/artifacts.css'
    const conversations = 'features/conversations/conversations.css'
    const pressed = ".knowledge-filters .segmented button[aria-pressed='true']"
    const row = ".conv-row[aria-pressed='true']"
    // The room's rules cast what they did on main: their edge, no layer added.
    assert.equal(declared(THEME, '.segmented::before', 'box-shadow'), edge)
    assert.equal(declared(artifacts, pressed, 'box-shadow'), edge)
    assert.equal(declared(conversations, row, 'box-shadow'), undefined)
    assert.equal(declared(conversations, `${row}:hover`, 'box-shadow'), 'inset 0 0 0 1px var(--line-2)')
    // Paper's own rules, as light as those, add the level after the edge.
    const level = 'var(--control-selected-shadow)'
    assert.equal(declared(THEME, onPaper('.segmented::before'), 'box-shadow'), `${edge}, ${level}`)
    assert.equal(declared(artifacts, onPaper(pressed), 'box-shadow'), `${edge}, ${level}`)
    assert.equal(declared(conversations, onPaper(row), 'box-shadow'), level)
    assert.equal(
      declared(conversations, onPaper(`${row}:hover`), 'box-shadow'),
      `inset 0 0 0 1px var(--line-2), ${level}`,
    )
  })

  it('no rule writes their values by hand: a hover at 0.06, a chosen one in the ink, a focus ring', () => {
    const byHand = RULES.flatMap((r) =>
      [...r.decls].flatMap(([property, value]) => {
        const hover = r.selector.includes(':hover') && value.includes('rgb(var(--ink-rgb) / 0.06)')
        const chosen =
          /aria-(selected|current|pressed)=/.test(r.selector) &&
          property.startsWith('background') &&
          value.includes('rgb(var(--ink-rgb)')
        const ring = r.selector.includes(':focus-visible') && value.includes('rgb(var(--halo-text-rgb) / 0.7)')
        return hover || chosen || ring ? [`${r.file} ${r.selector}: ${property}`] : []
      }),
    )
    assert.deepEqual(byHand, [])
  })
})
