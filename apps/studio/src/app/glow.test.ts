import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Glows (docs/plans/light-live.md): every glow a piece casts reads a role from the theme's two token blocks, the room's
// light and paper's answer side by side; and no rule outside those blocks writes a colour into a shadow, a filter or a
// gradient, so an effect drawn for the dark room alone can't land unseen on paper.

const STUDIO = new URL('../../', import.meta.url)

/** Every sheet the app paints with (src/). The opening's (public/entry.css) paints before the theme has loaded. */
function sheets(): { name: string; css: string }[] {
  return readdirSync(new URL('src/', STUDIO), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.css'))
    .map((path) => `src/${path.replaceAll('\\', '/')}`)
    .map((name) => ({ name, css: readFileSync(new URL(name, STUDIO), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }))
}

/** `text` cut at each `sep` outside parentheses: a shadow's layers at commas, a layer's words at spaces. */
function split(text: string, sep: string): string[] {
  const out = ['']
  let depth = 0
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === sep && depth === 0) out.push('')
    else out[out.length - 1] += ch
  }
  return out.map((part) => part.trim()).filter(Boolean)
}

interface Declaration {
  property: string
  value: string
}
interface Rule {
  /** What wraps it (`@media …`, `@keyframes …`), empty at a sheet's top. */
  at: string
  selector: string
  declarations: Declaration[]
}

const declarationsOf = (body: string): Declaration[] =>
  split(body, ';')
    .filter((d) => d.includes(':'))
    .map((d) => {
      const colon = d.indexOf(':')
      return {
        property: d.slice(0, colon).trim(),
        value: d
          .slice(colon + 1)
          .trim()
          .replace(/\s+/g, ' '),
      }
    })

/** Each block of declarations in a sheet, with its selector and what wraps it (a keyframe is `@keyframes name to`). */
function rules(css: string): Rule[] {
  const out: Rule[] = []
  const open: string[] = []
  let text = ''
  for (const ch of css) {
    if (ch === '{') {
      open.push(text.trim().replace(/\s+/g, ' '))
      text = ''
    } else if (ch === '}') {
      const declarations = declarationsOf(text)
      if (declarations.length) out.push({ at: open.slice(0, -1).join(' '), selector: open.at(-1) ?? '', declarations })
      open.pop()
      text = ''
    } else text += ch
  }
  return out
}

/** The theme's two token blocks at the top of theme.css: the room's (`:root`) and paper's. Every other rule is a piece's. */
const THEME = 'src/app/theme.css'
const PAPER = ":root[data-theme='light']"
const isTokens = (name: string, r: Rule) => name === THEME && r.at === '' && [':root', PAPER].includes(r.selector)
const theme = rules(sheets().find((s) => s.name === THEME)?.css ?? '')
const tokensOf = (selector: string) =>
  new Map(
    (theme.find((r) => r.at === '' && r.selector === selector)?.declarations ?? []).map(
      (d) => [d.property, d.value] as const,
    ),
  )
const room = tokensOf(':root')
/** Paper's block over the room's: what paper does not name, it reads from the room's. */
const paper = new Map([...room, ...tokensOf(PAPER)])

/** A value with every token the block holds put in, read as the page reads it (`calc(a * 1)` is `a`). */
function resolve(value: string, tokens: Map<string, string>): string {
  const once = value.replace(/var\((--[\w-]+)\)/g, (whole, name: string) => tokens.get(name) ?? whole)
  if (once !== value) return resolve(once, tokens)
  return once.replace(/calc\(([\d.]+) \* 1\)/g, '$1')
}

/** The arguments of each `drop-shadow()` in a filter. */
function dropShadows(value: string): string[] {
  const out: string[] = []
  for (let at = value.indexOf('drop-shadow('); at !== -1; at = value.indexOf('drop-shadow(', at + 1)) {
    const start = at + 'drop-shadow('.length
    let depth = 1
    let end = start
    for (; end < value.length && depth > 0; end++) {
      if (value[end] === '(') depth++
      if (value[end] === ')') depth--
    }
    out.push(value.slice(start, end - 1).trim())
  }
  return out
}

const SHADOWS = new Set(['box-shadow', 'text-shadow'])
const FILTERS = new Set(['filter', '-webkit-filter', 'backdrop-filter', '-webkit-backdrop-filter'])
/** A declaration's shadow layers: a shadow's own, a filter's drop shadows; a local token may hold either. */
function layersOf({ property, value }: Declaration): string[] {
  const custom = property.startsWith('--')
  return [
    ...(SHADOWS.has(property) || custom ? split(value, ',') : []),
    ...(FILTERS.has(property) || custom ? dropShadows(value) : []),
  ]
}

const LENGTH = /^-?(\d*\.)?\d+(px|r?em)?$|^calc\(/
/** A layer's lengths (offsets, blur, spread) and its other words (its colour). */
function partsOf(layer: string) {
  const words = split(layer, ' ')
  const [x = '0', y = '0', blur = '0', spread = '0'] = words.filter((w) => LENGTH.test(w))
  const colour = words.filter((w) => !LENGTH.test(w) && w !== 'inset')
  return { inset: words[0] === 'inset', x, y, blur, spread, colour }
}
/** A glow: on its box (no offset), blurred, in a colour. A ring has no blur; a cast shadow is off its box. */
function glows(layer: string): boolean {
  const { inset, x, y, blur, colour } = partsOf(layer)
  const blurred = blur.startsWith('calc(') || parseFloat(blur) > 0
  const coloured = colour.some((w) => w !== 'transparent')
  return !inset && parseFloat(x) === 0 && parseFloat(y) === 0 && blurred && coloured
}

/** Every declaration of a piece (the token blocks left out), with where it is. */
function pieces() {
  return sheets().flatMap(({ name, css }) =>
    rules(css)
      .filter((r) => !isTokens(name, r))
      .flatMap((r) => r.declarations.map((d) => ({ where: [name, r.at, r.selector].filter(Boolean).join(' '), ...d }))),
  )
}

/** The flash of a tile that changed glows in its tool's own colour, set on the tile: no root token can carry it. */
const OWN_COLOUR = ['src/features/resources/resources.css @keyframes tile-changed 0%']
/**
 * Her orb's glow on paper (paper-orb.md) rises with her state, set on the light (her breath, her voice, a call): no root
 * token can carry it either.
 */
const HER_ORB = "src/app/theme.css :root[data-theme='light'] .light::after"
/** Her mark keeps its soft light on paper (light-paper-mark.md): the one light of colour paper keeps is hers. */
const HERS = new Set([
  '--glow-mark',
  '--glow-mark-live',
  '--glow-threshold-from',
  '--glow-threshold-to',
  '--glow-threshold-still',
])
/** A large live piece is ringed on paper, where the room lit it. */
const RINGED = ['--glow-speaking', '--glow-orbit', '--glow-lit']

/** What each piece that glows cast in the room before the tokens (main at 8222aa4b8), every layer of it. */
const ROOM: Record<string, string> = {
  'src/app/theme.css .pill-dot[data-live] { box-shadow }': '0 0 8px 1px rgb(156 130 245 / 0.8)',
  'src/app/theme.css .umbral-sophia { filter }': 'drop-shadow(0 0 2px rgb(156 130 245 / 0.45))',
  'src/app/theme.css .umbral[data-live] .umbral-sophia { filter }': 'drop-shadow(0 0 4px rgb(156 130 245 / 0.85))',
  'src/app/theme.css @keyframes threshold-breathe from { filter }': 'drop-shadow(0 0 4px rgb(156 130 245 / 0.45))',
  'src/app/theme.css @keyframes threshold-breathe to { filter }': 'drop-shadow(0 0 12px rgb(156 130 245 / 0.85))',
  'src/app/theme.css @media (prefers-reduced-motion: reduce) .threshold .umbral-sophia { filter }':
    'drop-shadow(0 0 6px rgb(156 130 245 / 0.6))',
  'src/app/theme.css .presence[data-speaking] .orbit { box-shadow }':
    '0 0 0 3px rgb(241 220 199 / 0.12), 0 0 24px rgb(241 220 199 / 0.22)',
  'src/app/theme.css .tile[data-speaking] { box-shadow }':
    '0 0 0 1px rgb(241 220 199 / 0.6), 0 0 28px rgb(241 220 199 / 0.16)',
  'src/app/theme.css .qr { filter }': 'drop-shadow(0 0 32px rgb(156 130 245 / 0.24))',
  'src/app/theme.css .toggle-dot { box-shadow }': '0 0 8px 1px rgb(156 130 245 / 0.8)',
  'src/app/theme.css .report-sections a[data-sophia]::before { box-shadow }': '0 0 8px #9c82f5',
  'src/features/conversations/conversations.css .conv-field-box:focus-within { box-shadow }':
    '0 0 0 1px rgb(156 130 245 / 0.45), 0 18px 50px rgb(0 0 0 / 0.55), 0 0 30px rgb(156 130 245 / 0.08)',
  'src/features/conversations/conversations.css .conv-ask:has(input:checked) .umbral { filter }':
    'drop-shadow(0 0 6px rgb(156 130 245 / 0.8))',
  'src/features/personal/personal.css .places .hw-her { box-shadow }': '0 0 10px 2px rgb(156 130 245 / 0.55)',
  'src/features/personal/personal.css .places .sdot { box-shadow }': '0 0 8px 2px rgb(156 130 245 / 0.5)',
  "src/features/personal/personal.css .places .c3-who[data-who='sophia'] { filter }":
    'drop-shadow(0 0 5px rgb(156 130 245 / 0.7))',
  'src/features/personal/personal.css .places .c2-t .by::before { box-shadow }': '0 0 6px 1px rgb(156 130 245 / 0.6)',
  'src/features/personal/personal.css .places .c3-notes-toggle.ticked { text-shadow }':
    '0 0 12px rgb(185 168 255 / 0.8)',
  'src/features/resources/resources.css .ask-light { box-shadow }': '0 0 10px #9c82f5',
  'src/features/resources/resources.css @keyframes ask-light to { box-shadow }': '0 0 16px #9c82f5',
  'src/features/resources/resources.css .resource-tile[data-away] .resource-tile-head::after { box-shadow }':
    '0 0 10px #9c82f5',
  'src/features/resources/resources.css .act-steps li::after { box-shadow }': '0 0 8px rgb(127 214 196 / 0.6)',
  'src/features/resources/resources.css @keyframes tile-changed 0% { box-shadow }':
    'var(--rim), 0 0 0 1px color-mix(in srgb, var(--tool-accent) 80%, transparent), 0 0 24px color-mix(in srgb, var(--tool-accent) 35%, transparent)',
  'src/features/resources/resources.css .capacity-meter.is-full .capacity-meter-fill { box-shadow }':
    '0 0 8px color-mix(in srgb, #ee9fb0 45%, transparent)',
  'src/features/work/planning/board.css .goal-rail::after { box-shadow }': '0 0 12px rgb(156 130 245 / 0.6)',
  "src/features/work/planning/board.css .goal-tab-dot[data-status='running'] { box-shadow }":
    '0 0 8px rgb(127 214 196 / 0.6)',
  'src/features/work/planning/board.css .plan-tab-mine::before { box-shadow }': '0 0 8px rgb(239 191 134 / 0.7)',
  'src/features/work/planning/board.css .task-tile[data-lit] { box-shadow }':
    '0 0 0 4px rgb(156 130 245 / 0.14), 0 0 28px rgb(156 130 245 / 0.2)',
  'src/features/work/planning/board.css .task-tile[data-changed] .task-tile-body::after { box-shadow }':
    '0 0 10px #9c82f5',
  'src/features/work/planning/board.css .plan-sophia { box-shadow }': '0 0 10px rgb(156 130 245 / 0.35)',
  'src/features/work/planning/board.css .thread { filter }': 'drop-shadow(0 0 6px rgb(156 130 245 / 0.85))',
  'src/features/work/planning/board.css .thread-spark { filter }': 'drop-shadow(0 0 6px #9c82f5)',
}

/** A colour written by hand: hex, a colour function on numbers, black or white. Channels read from a token are not. */
const LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]|\bcolor\(\s*(?:srgb|display-p3)|\b(?:white|black)\b/i
/** A declaration that draws an effect: a shadow, a filter, a gradient (a mask's alpha is no colour), a token of one. */
function drawsEffect({ property, value }: Declaration): boolean {
  if (SHADOWS.has(property) || FILTERS.has(property)) return true
  if (property.startsWith('--')) return /-gradient\(|drop-shadow\(/.test(value)
  return /-gradient\(/.test(value) && !/^(-webkit-)?mask/.test(property)
}
/** The hand-written colours in effects today, each to go with its branch of the light-mode plan (informe-claro §6). */
const WRITTEN = [
  // Her orb on paper (paper-orb.md), which replaced the halo: her clouds, her glass and its light, in her ramp until the
  // ramp is tokens (light-paper.md, row 13).
  "src/app/theme.css :root[data-theme='light'] .light::before { background-image }",
  "src/app/theme.css :root[data-theme='light'] .light::after { background-image }",
  "src/app/theme.css :root[data-theme='light'] .light::after { box-shadow }",
  // GPT's own gradient and glints, a tool's look.
  "src/features/resources/resources.css .effort[data-look='gpt'][data-alive] .effort-fill { background }",
  "src/features/resources/resources.css .effort[data-look='gpt'][data-alive] .effort-fill::after { background }",
  // Personal's hour (light/luz-de-papel) and a report's cover (light/documentos).
  "src/features/personal/personal.css .places .c3-space.you[data-hour='morning'] .c3-ambient { background }",
  "src/features/personal/personal.css .places .c3-space.you[data-hour='evening'] .c3-ambient { background }",
  "src/features/personal/personal.css .places .c3-space.you[data-hour='night'] .c3-ambient { background }",
  'src/features/artifacts/artifacts.css .report-cover-page::after { background }',
]

/** A colour with nothing showing through: hex without alpha, or rgb() with none. */
const opaque = (colour: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colour) || /^rgb\([\d.\s]+\)$/.test(colour)

describe('glows (light-live.md)', () => {
  it('no piece glows of its own: each glow reads a --glow token', () => {
    const own = pieces()
      .filter((d) => !OWN_COLOUR.includes(d.where) && d.where !== HER_ORB)
      .flatMap((d) =>
        layersOf(d)
          .filter(glows)
          .map((layer) => `${d.where} { ${d.property}: ${layer} }`),
      )
    assert.deepEqual(own, [])
  })

  it('every glow a piece reads has a room value and a paper one; on paper a ring or nothing, but her mark', () => {
    const read = new Set(
      pieces().flatMap((d) => [...d.value.matchAll(/var\((--glow-[\w-]+)\)/g)].map((m) => m[1] ?? '')),
    )
    assert.ok(read.size > 0, 'the pieces read glow tokens')
    for (const name of read) {
      assert.ok(room.has(name), `${name} in the room`)
      assert.ok(tokensOf(PAPER).has(name), `${name} on paper`)
      const value = resolve(`var(${name})`, paper)
      if (HERS.has(name)) {
        assert.match(value, /^drop-shadow\(/, `${name}: her light`)
        continue
      }
      const layers = layersOf({ property: '--', value })
      assert.deepEqual(layers.filter(glows), [], `${name}: no glow on paper (${value})`)
      const rings = layers.map(partsOf).filter((p) => parseFloat(p.spread) > 0)
      for (const ring of rings) assert.ok(opaque(ring.colour.join(' ')), `${name}: a solid ring (${value})`)
    }
  })

  it('a large live piece is ringed on paper: two solid pixels of its accent', () => {
    for (const name of RINGED) {
      const [ring, ...more] = split(resolve(`var(${name})`, paper), ',').map(partsOf)
      assert.equal(more.length, 0, `${name}: one layer`)
      assert.deepEqual([ring?.x, ring?.y, ring?.blur, ring?.spread], ['0', '0', '0', '2px'], name)
      assert.ok(opaque(ring?.colour.join(' ') ?? ''), `${name}: solid`)
    }
  })

  it('the room keeps every glow it cast, to the value', () => {
    const now: Record<string, string> = {}
    for (const d of pieces().filter((p) => !p.where.includes(PAPER))) {
      if (!SHADOWS.has(d.property) && !FILTERS.has(d.property)) continue
      const value = resolve(d.value, room)
      if (layersOf({ property: d.property, value }).some(glows)) now[`${d.where} { ${d.property} }`] = value
    }
    assert.deepEqual(now, ROOM)
  })

  it('no rule outside the token blocks writes a colour into a shadow, a filter or a gradient, but those named', () => {
    const written = pieces()
      .filter((d) => drawsEffect(d) && LITERAL.test(d.value.replace(/url\([^)]*\)/g, '')))
      .map((d) => `${d.where} { ${d.property} }`)
    // Each one named still writes its colour: one that moves to a token leaves the list with it.
    assert.deepEqual([...new Set(written)].toSorted(), WRITTEN.toSorted())
  })
})
