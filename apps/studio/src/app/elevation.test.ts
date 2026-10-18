import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Elevation (docs/plans/light-shadows.md): every shadow a piece casts reads a role from the theme's two token blocks,
// the room's value and paper's level side by side; no rule writes a shadow's colour or strength of its own.

const STUDIO = new URL('../../', import.meta.url)

/** Every sheet the Studio paints with: the app's and its features' (src/), and the opening's (public/). */
function sheets(): { name: string; css: string }[] {
  const under = (dir: string) =>
    readdirSync(new URL(dir, STUDIO), { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.css'))
      .map((path) => `${dir}${path.replaceAll('\\', '/')}`)
  return [...under('src/'), ...under('public/')].map((name) => ({
    name,
    css: readFileSync(new URL(name, STUDIO), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
  }))
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

/** Each innermost rule of a sheet, its selector and its declarations (`@media` and the like unwrapped). */
const rules = (css: string) =>
  [...css.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim().replace(/\s+/g, ' '),
    declarations: split(m[2] ?? '', ';').map((d) => {
      const colon = d.indexOf(':')
      return { property: d.slice(0, colon).trim(), value: d.slice(colon + 1).trim() }
    }),
  }))

/** The theme's two token blocks: the room's (`:root`) and paper's. Every other rule is a piece's. */
const TOKENS = [':root', ":root[data-theme='light']"]
const theme = sheets().find((s) => s.name === 'src/app/theme.css')?.css ?? ''
const tokensOf = (selector: string) =>
  new Map(
    (rules(theme).find((r) => r.selector === selector)?.declarations ?? []).map((d) => [d.property, d.value] as const),
  )
const room = tokensOf(':root')
const paper = tokensOf(":root[data-theme='light']")

/** A value with every token the block holds put in, read as the page reads it (`calc(a * 1)` is `a`). */
function resolve(value: string, tokens: Map<string, string>): string {
  const once = value.replace(/var\((--[\w-]+)\)/g, (whole, name: string) => tokens.get(name) ?? whole)
  if (once !== value) return resolve(once, tokens)
  return once.replace(/calc\(([\d.]+) \* 1\)/g, '$1')
}

const LENGTH = /^-?(\d*\.)?\d+(px|r?em)?$|^calc\(/
/** A layer that casts a shadow: not inset, off its box and blurred (an edge line has no blur, a glow no offset). */
function casts(layer: string): boolean {
  const words = split(layer, ' ')
  if (words[0] === 'inset') return false
  const [x = '0', y = '0', blur = '0'] = words.filter((w) => LENGTH.test(w))
  const off = parseFloat(x) !== 0 || parseFloat(y) !== 0
  return off && (blur.startsWith('calc(') || parseFloat(blur) > 0) && words.some((w) => !LENGTH.test(w))
}

/** Every declaration of a piece (the token blocks left out) that could hold a shadow: its own, or a local token. */
function pieces() {
  return sheets().flatMap(({ name, css }) =>
    rules(css)
      .filter((r) => !TOKENS.includes(r.selector))
      .flatMap((r) =>
        r.declarations
          .filter((d) => d.property === 'box-shadow' || d.property.startsWith('--'))
          .map((d) => ({ where: `${name} ${r.selector}`, ...d })),
      ),
  )
}

/** What each piece cast in the room before the tokens (main at f37006560: `--shadow-k` 1, the room's ink black). */
const ROOM: Record<string, string[]> = {
  'src/app/theme.css .tip': ['0 8px 24px rgb(0 0 0 / 0.5)'],
  'src/app/theme.css .menu': ['0 18px 50px rgb(0 0 0 / 0.55)'],
  'src/app/theme.css .stage-made': ['0 16px 48px rgb(0 0 0 / 0.5)'],
  'src/app/theme.css .dock': ['0 16px 48px rgb(0 0 0 / 0.5)'],
  'src/app/theme.css .mini-dock': ['0 12px 40px rgb(0 0 0 / 0.45)'],
  'src/app/theme.css .welcome-band': ['0 12px 32px rgb(0 0 0 / 0.32)'],
  'src/app/theme.css .new-version': ['0 12px 40px rgb(0 0 0 / 0.5)'],
  'src/app/theme.css .toast': ['0 12px 40px rgb(0 0 0 / 0.5)'],
  'src/app/theme.css .lobby': ['0 16px 48px rgb(0 0 0 / 0.45)'],
  'src/app/theme.css .palette': ['0 18px 50px rgb(0 0 0 / 0.55)'],
  'src/app/theme.css .sheet': ['-24px 0 64px rgb(0 0 0 / 0.5)'],
  'src/app/theme.css .panel-toggles': ['0 16px 48px rgb(0 0 0 / 0.5)'],
  'src/features/artifacts/artifacts.css .report-pane': ['-24px 0 48px rgb(0 0 0 / 0.35)'],
  'src/features/artifacts/artifacts.css .report-cover-page': ['0 -1px 12px rgb(0 0 0 / 0.35)'],
  'src/features/artifacts/artifacts.css .passage-bar': ['0 12px 32px rgb(0 0 0 / 0.45)'],
  'src/features/artifacts/artifacts.css .md .cite button[data-tip]::before': ['0 8px 24px rgb(0 0 0 / 0.5)'],
  'src/features/conversations/conversations.css .conv-output-page': ['0 4px 12px rgb(0 0 0 / 0.5)'],
  'src/features/conversations/conversations.css .conv-field-box': ['0 18px 50px rgb(0 0 0 / 0.55)'],
  'src/features/conversations/conversations.css .conv-field-box:focus-within': ['0 18px 50px rgb(0 0 0 / 0.55)'],
  'src/features/conversations/conversations.css .conv-context': ['-30px 0 80px rgb(0 0 0 / 0.6)'],
  'src/features/personal/personal.css .places .popover': ['0 18px 50px rgb(0 0 0 / 0.55)'],
  'src/features/personal/personal.css .places .c3-daypill': ['0 8px 24px rgb(0 0 0 / 0.4)'],
  'src/features/personal/personal.css .places .c3-notes': ['-24px 0 60px rgb(0 0 0 / 0.45)'],
  'src/features/resources/resources.css .effort-knob': ['0 1px 4px rgb(0 0 0 / 0.45)'],
  // Main's copy-link hand (#441), a popover, cast a menu's shadow: `0 18px 50px` at 0.55 × 1.
  'src/features/resources/resources.css .copy-link-hand': ['0 18px 50px rgb(0 0 0 / 0.55)'],
  'src/features/work/planning/board.css .rail-turn': ['0 6px 18px rgb(0 0 0 / 0.45)'],
  'src/features/work/planning/board.css .task-tile': ['0 1px 2px rgb(0 0 0 / 0.3)'],
  'src/features/work/planning/board.css .task-tile:hover': ['0 14px 34px rgb(0 0 0 / 0.4)'],
}

describe('elevation (light-shadows.md)', () => {
  it('no piece casts a shadow of its own: each reads an elevation token', () => {
    const own = pieces().flatMap((d) =>
      split(d.value, ',')
        .filter(casts)
        .map((layer) => `${d.where} { ${d.property}: ${layer} }`),
    )
    assert.deepEqual(own, [])
  })

  it('--shadow-k is gone, and only the token blocks read the shadow’s ink', () => {
    assert.deepEqual(
      sheets()
        .filter((s) => s.css.includes('--shadow-k'))
        .map((s) => s.name),
      [],
    )
    assert.deepEqual(
      pieces()
        .filter((d) => d.value.includes('--shadow-rgb'))
        .map((d) => d.where),
      [],
    )
  })

  it('every elevation a piece reads has a room value and a paper one; on paper, a contact and an ambient', () => {
    const read = new Set(
      pieces().flatMap((d) => [...d.value.matchAll(/var\((--elev-[\w-]+)\)/g)].map((m) => m[1] ?? '')),
    )
    assert.ok(read.size > 0, 'the pieces read elevation tokens')
    const blur = (layer: string) => Math.abs(parseFloat(split(layer, ' ')[2] ?? '0'))
    for (const name of read) {
      assert.ok(room.has(name), `${name} in the room`)
      assert.ok(paper.has(name), `${name} on paper`)
      const [contact = '', ambient = '', ...more] = split(resolve(`var(${name})`, paper), ',')
      assert.equal(more.length, 0, `${name}: two layers on paper`)
      assert.ok(casts(contact) && blur(contact) <= 3, `${name}: a crisp contact first (${contact})`)
      assert.ok(casts(ambient) && blur(ambient) > blur(contact), `${name}: a wider ambient (${ambient})`)
    }
  })

  it('a card rests on paper alone: the room’s rules give a card nothing and a resource tile its rim', () => {
    const cast = (selector: string) =>
      sheets().flatMap(({ css }) =>
        rules(css)
          .filter((r) => r.selector === selector)
          .flatMap((r) => r.declarations.filter((d) => d.property === 'box-shadow').map((d) => d.value)),
      )
    assert.deepEqual(cast(':where(.card)'), [])
    assert.deepEqual(cast(":where(:root[data-theme='light'] .card)"), ['var(--elev-card)'])
    assert.deepEqual(cast('.resource-tile'), ['var(--rim)'])
    assert.deepEqual(cast(":where(:root[data-theme='light']) .resource-tile"), ['var(--rim), var(--elev-card)'])
  })

  it('the room keeps every shadow it cast, to the value', () => {
    const now: Record<string, string[]> = {}
    for (const d of pieces().filter((p) => p.property === 'box-shadow')) {
      const cast = split(resolve(d.value, room), ',').filter(casts)
      if (cast.length) now[d.where] = [...(now[d.where] ?? []), ...cast]
    }
    assert.deepEqual(now, ROOM)
  })
})
