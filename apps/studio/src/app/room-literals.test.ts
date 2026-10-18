import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The room's colours written by hand (docs/plans/light-room-literals.md): a colour written in a rule is the room's on
// paper too. Each lives in a token with a value for each theme: the room's as it was, and one that reads on paper.
const SRC = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, SRC), 'utf8')

/** Every style sheet under src/, by its path from there. */
const sheets = () =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => path.endsWith('.css'))

/** `css`'s first block opened by `head` (a token block holds no nested braces), and where it stands. */
function block(css: string, head: string): { text: string; start: number; end: number } {
  const start = css.indexOf(`\n${head} {`) + 1
  assert.ok(start > 0, `${head} is declared`)
  const end = css.indexOf('}', start) + 1
  return { text: css.slice(start, end), start, end }
}
const ROOM = ':root'
const PAPER = ":root[data-theme='light']"

/** A token's value in a block, as written. */
const valueIn = (text: string, name: string) => new RegExp(`\\s${name}:\\s*([^;]+);`).exec(text)?.[1]?.trim() ?? ''

/** Every token a block declares, by name. */
const tokensIn = (text: string) =>
  new Map([...text.matchAll(/\s(--[\w-]+):\s*([^;]+);/g)].map(([, n = '', v = '']) => [n, v]))

const blank = (text: string) => text.replace(/[^\n]/g, ' ')
/** `css` with its comments and the given spans blanked, its lines kept, so a match still says where it is. */
function blanked(css: string, spans: readonly { start: number; end: number }[] = []): string {
  const kept = spans.reduce((t, { start, end }) => t.slice(0, start) + blank(t.slice(start, end)) + t.slice(end), css)
  return kept.replace(/\/\*[\s\S]*?\*\//g, blank)
}

/** Each literal, and the properties it is looked for in (any, if none are named). */
const LITERALS: readonly { what: string; pattern: RegExp; in?: RegExp }[] = [
  // A shadow only: a chip kept dark over video on purpose is another branch's (D22).
  { what: 'a fixed black shadow', pattern: /rgba?\(\s*0[\s,]+0[\s,]+0\s*[/,]/, in: /shadow|filter/ },
  { what: 'Claude’s lavender', pattern: /#b3a3f5|rgba?\(\s*179[\s,]+163[\s,]+245/i },
  { what: 'Ultracode’s sparkle', pattern: /#e4dcff/i },
  { what: 'a flying light’s white core', pattern: /rgba?\(\s*250[\s,]+248[\s,]+255/ },
  { what: 'a glowfly’s lavender rim', pattern: /rgba?\(\s*214[\s,]+204[\s,]+255/ },
]

/** Each declaration of `css` that writes one of the room's literals, as "path:line what" (the property's line). */
const literalsIn = (path: string, css: string) =>
  [...css.matchAll(/([\w-]+)\s*:\s*([^;{}]+)[;}]/g)].flatMap(({ 1: prop = '', 2: value = '', index }) =>
    LITERALS.filter((l) => l.pattern.test(value) && (l.in?.test(prop) ?? true)).map(
      ({ what }) => `${path}:${String(css.slice(0, index).split('\n').length)} ${what}`,
    ),
  )

/** sRGB channels of `#rrggbb` or `rgb(r g b / a)`, and the alpha. */
function channels(css: string): readonly [number, number, number, number] {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(css)
  if (hex) return [parseInt(hex[1] ?? '', 16), parseInt(hex[2] ?? '', 16), parseInt(hex[3] ?? '', 16), 1]
  const [r = 0, g = 0, b = 0, a = 1] = (/^rgba?\(([^)]+)\)$/.exec(css)?.[1] ?? '').split(/[\s,/]+/).map(Number)
  return [r, g, b, a]
}
/** `top` at `alpha` (its own if not given) laid over the opaque `under`, as a browser lays it: in sRGB. */
function over(top: string, under: readonly number[], alpha?: number): number[] {
  const [r, g, b, own] = channels(top)
  const a = alpha ?? own
  return [r, g, b].map((v, i) => v * a + (under[i] ?? 0) * (1 - a))
}
const linear = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
const lightOf = ([r = 0, g = 0, b = 0]: readonly number[]) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
/** WCAG's contrast of two opaque colours. */
function contrast(a: readonly number[], b: readonly number[]): number {
  const [x, y] = [lightOf(a), lightOf(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** On paper: the page, the sheet's plane, a white tile, and the effort's track (the ink at 0.04 over the plane). */
const PAGE = over('#fbf8f3', [])
const PLANE = over('#f4f0ea', [])
const WHITE = [255, 255, 255]
const TRACK = over('rgb(29 27 34 / 0.04)', PLANE)
/** The least contrast an ink meets on paper: a dot on its chip (the ink at 7 % over each ground), a bar on its track. */
const leastOnPaper = (ink: string) =>
  Math.min(
    ...[PAGE, PLANE, WHITE].map((ground) => contrast(over(ink, ground), over(ink, ground, 0.07))),
    contrast(over(ink, TRACK), TRACK),
  )

describe('the room’s colours written by hand (docs/plans/light-room-literals.md)', () => {
  it('none is written in a rule: each lives in theme.css’s token blocks', () => {
    const found = sheets().flatMap((path) => {
      const css = read(path)
      const tokens = path === 'app/theme.css' ? [block(css, ROOM), block(css, PAPER)] : []
      return literalsIn(path, blanked(css, tokens))
    })
    assert.deepEqual(found, [])
  })

  it('the tokens they moved to keep the room’s values, and have a paper value of their own', () => {
    const css = read('app/theme.css')
    const [room, paper] = [block(css, ROOM).text, block(css, PAPER).text]
    const kept = {
      '--claude-ink': '#b3a3f5',
      '--claude-ink-rgb': '179 163 245',
      '--claude-glint': 'var(--core)',
      '--claude-spark': '#e4dcff',
      '--flight-core': 'rgba(250, 248, 255, 0.95)',
      '--flight-rim': 'rgba(214, 204, 255, 0.55)',
      '--shadow-rgb': '0 0 0',
    }
    for (const [name, value] of Object.entries(kept)) {
      assert.equal(valueIn(room, name), value, `${name} in the room`)
      assert.notEqual(valueIn(paper, name), '', `${name} on paper`)
      assert.notEqual(valueIn(paper, name), value, `${name} on paper is its own`)
    }
    // Ultracode's dots, its glint and sparks, and a flying light's core are marks: 3:1 on the page at least.
    for (const name of ['--claude-ink', '--claude-glint', '--claude-spark', '--flight-core']) {
      assert.ok(contrast(over(valueIn(paper, name), PAGE), PAGE) >= 3, `${name} on paper`)
    }
  })
})

/** resources.css's token blocks: the room's and the paper's, and the inks they name. */
function resourceTokens() {
  const css = read('features/resources/resources.css')
  const room = tokensIn(block(css, ROOM).text)
  const paper = tokensIn(block(css, PAPER).text)
  return { room, paper, inks: [...room.keys()].filter((name) => name.endsWith('-ink')) }
}

describe('the tools’ and models’ own inks (resources.css)', () => {
  it('every family’s dot and every tool’s accent takes a token, never a colour written in its rule', () => {
    const css = blanked(read('features/resources/resources.css'))
    assert.deepEqual(
      [...css.matchAll(/--(?:chip-ink|tool-accent):\s*#[\da-f]+/gi)].map(([m]) => m),
      [],
    )
  })

  it('the room keeps its inks', () => {
    const { room } = resourceTokens()
    assert.deepEqual(Object.fromEntries(room), {
      '--opus-ink': '#d97757',
      '--sonnet-ink': '#e6a273',
      '--haiku-ink': '#efc893',
      '--gpt-ink': '#6f8cff',
      '--gemini-ink': '#8e75b2',
      '--gemini-pro-ink': '#a68bd6',
      '--gemini-flash-ink': '#4f9cf9',
      '--silver-ink': '#c3c7d4',
      '--effort-k': '55%',
      '--claude-bar': 'rgb(var(--ink-rgb) / 0.32)',
    })
  })

  it('on paper each holds 3:1 as a dot on its chip and as a bar on its track, which it fills whole', () => {
    const { room, paper, inks } = resourceTokens()
    assert.deepEqual([...paper.keys()], [...room.keys()], 'each ink has its paper value')
    const low = inks
      .map((name) => [name, leastOnPaper(paper.get(name) ?? '')] as const)
      .filter(([, ratio]) => ratio < 3)
    assert.deepEqual(low, [])
    assert.equal(paper.get('--effort-k'), '100%')
  })

  it('Claude’s bar below its top reads its token, and on paper holds 3:1 on its track', () => {
    const css = read('features/resources/resources.css')
    assert.match(css, /\.effort\[data-look='claude'\] \.effort-fill \{\s*background: var\(--claude-bar\);/)
    const ink = valueIn(block(read('app/theme.css'), PAPER).text, '--ink-rgb')
    const bar = (resourceTokens().paper.get('--claude-bar') ?? '').replace('var(--ink-rgb)', ink)
    for (const track of [TRACK, over('rgb(29 27 34 / 0.04)', WHITE)]) {
      assert.ok(contrast(over(bar, track), track) >= 3, `${bar} on its track`)
    }
  })

  it('on paper Opus stays the deepest of its family, and no tool takes the app’s lavender', () => {
    const { paper, inks } = resourceTokens()
    const [opus, sonnet, haiku] = ['--opus-ink', '--sonnet-ink', '--haiku-ink'].map((n) =>
      lightOf(over(paper.get(n) ?? '', [])),
    )
    assert.ok((opus ?? 0) < (sonnet ?? 0) && (sonnet ?? 0) < (haiku ?? 0), 'Opus, Sonnet, Haiku: deepest first')
    const halo = valueIn(block(read('app/theme.css'), PAPER).text, '--halo')
    assert.equal(new Set(inks.map((name) => paper.get(name))).size, inks.length, 'each its own')
    assert.ok(!inks.some((name) => paper.get(name) === halo))
  })
})
