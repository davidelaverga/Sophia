import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// What shows before the Studio's own page (docs/plans/light-tab-and-launch.md): the tab's mark, the appearances the
// page declares, and the ground an installed app opens on. A tab is the browser's colour, not the page's: the mark set
// for the appearance shown still has to read on the other kind of tab.

const text = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

type Rgb = readonly [number, number, number]
type Scheme = 'light' | 'dark'

/** The grounds of Chrome's and Firefox's tab strips and tabs: two light, two dark. */
const TABS = ['#ffffff', '#dee1e6', '#202124', '#42414d']
/** The room's page (theme.css `--void`): what an installed app shows once it has painted, with no choice made. */
const VOID = '#050408'

/** `#rrggbb` as its three channels. */
function rgb(hex: string): Rgb {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  assert.ok(m, `a colour: ${hex}`)
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)]
}

/** A channel's share of the light, as WCAG counts it. */
const channel = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
const lightOf = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
function contrast(a: Rgb, b: Rgb): number {
  const [hi = 0, lo = 0] = [lightOf(a), lightOf(b)].toSorted((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** `top` at `alpha` over the opaque `under`. */
const over = (top: Rgb, alpha: number, under: Rgb): Rgb => [
  top[0] * alpha + under[0] * (1 - alpha),
  top[1] * alpha + under[1] * (1 - alpha),
  top[2] * alpha + under[2] * (1 - alpha),
]

/** An element's attributes. */
const attributes = (tag: string) =>
  new Map([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k = '', v = '']) => [k, v]))

/** The fills an SVG's <style> gives its classes: its plain rules, and under a light scheme its light block over them. */
function classFills(svg: string, scheme: Scheme): Map<string, string> {
  const style = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? ''
  const [plain = '', light = ''] = style.split('@media (prefers-color-scheme: light)')
  const fills = new Map<string, string>()
  for (const block of scheme === 'light' ? [plain, light] : [plain]) {
    for (const [, name = '', fill = ''] of block.matchAll(/\.([\w-]+)\{fill:([^;}]+)\}/g)) fills.set(name, fill)
  }
  return fills
}

/** A gradient stop's opacity. */
const alphaOf = (stop: Map<string, string>) => Number(stop.get('stop-opacity') ?? 1)

/** A gradient's strongest stop, colour and opacity: a halo's worst case under light inks. */
function strongestStop(svg: string, id: string): { hex: string; alpha: number } {
  const body = new RegExp(`<(radial|linear)Gradient id="${id}"[^>]*>([\\s\\S]*?)</\\1Gradient>`).exec(svg)?.[2] ?? ''
  const stops = [...body.matchAll(/<stop\b[^>]*>/g)].map(([tag]) => attributes(tag))
  const strongest = stops.toSorted((a, b) => alphaOf(b) - alphaOf(a))[0]
  assert.ok(strongest, `the gradient ${id}`)
  return { hex: strongest.get('stop-color') ?? '', alpha: alphaOf(strongest) }
}

/** A rect's fill laid over what is under it: a solid colour, a gradient at its strongest stop, or nothing. */
function laid(svg: string, fill: string, under: Rgb): Rgb {
  if (fill === 'none') return under
  const id = /^url\(#([\w-]+)\)$/.exec(fill)?.[1]
  if (!id) return rgb(fill)
  const stop = strongestStop(svg, id)
  return over(rgb(stop.hex), stop.alpha, under)
}

/**
 * What a favicon draws on a tab under one scheme: the ground under its mark (the tab, through the tiles laid before
 * it) and the inks of its two halves, found by their cuts (x = 30 you, x = 33 Sophia).
 */
function drawn(svg: string, scheme: Scheme, tab: Rgb): { ground: Rgb; you: Rgb; her: Rgb } {
  const fills = classFills(svg, scheme)
  const halves = new Map<string, Rgb>()
  let ground = tab
  for (const [tag, name] of svg.matchAll(/<(rect|path)\b[^>]*>/g)) {
    const a = attributes(tag)
    const fill = fills.get(a.get('class') ?? '') ?? a.get('fill') ?? 'none'
    if (name === 'path') {
      halves.set((a.get('d') ?? '').slice(0, 3), rgb(fill))
      continue
    }
    // A tile lies under the whole mark: the full icon, before its halves.
    assert.equal(halves.size, 0, 'a tile is drawn before the mark')
    assert.ok(a.get('width') === '48' && a.get('height') === '48' && !a.has('x') && !a.has('y'), 'a full tile')
    ground = laid(svg, fill, ground)
  }
  return { ground, you: halves.get('M30')!, her: halves.get('M33')! }
}

/** The `color-scheme` a stylesheet's plain rules give each of their selectors. */
function schemesOf(css: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const [, selectors = '', body = ''] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const scheme = /color-scheme:\s*([^;]+)/.exec(body)?.[1]?.trim()
    if (scheme) for (const selector of selectors.split(',')) out.set(selector.trim(), scheme)
  }
  return out
}

describe('before the Studio paints: the tab, the page’s appearances, the installed app (D18)', () => {
  it('each tab mark reads at 3:1 or more on light tabs and on dark ones', () => {
    // The room's and paper's marks (entry.js and theme.ts set one), and index.html's own in either scheme.
    const favicons = [
      ['public/favicon-dark.svg', 'dark'],
      ['public/favicon-light.svg', 'light'],
      ['public/favicon.svg', 'dark'],
      ['public/favicon.svg', 'light'],
    ] as const
    const low = favicons.flatMap(([file, scheme]) =>
      TABS.flatMap((tab) => {
        const { ground, you, her } = drawn(text(file), scheme, rgb(tab))
        return [
          { half: 'you', ratio: contrast(you, ground) },
          { half: 'Sophia', ratio: contrast(her, ground) },
        ]
          .filter(({ ratio }) => ratio < 3)
          .map(({ half, ratio }) => `${file} (${scheme}) on ${tab}: ${half} ${ratio.toFixed(2)}`)
      }),
    )
    assert.deepEqual(low, [])
  })

  it('the room’s tab mark is its app icon, the one favicon.ico and the installed app draw', () => {
    assert.equal(text('public/favicon-dark.svg').trim(), text('public/brand/umbral-app.svg').trim())
  })

  it('the page declares both appearances, and its first paint keeps the one shown', () => {
    const declared = /<meta name="color-scheme" content="([^"]*)"/.exec(text('index.html'))?.[1] ?? ''
    assert.deepEqual(declared.split(/\s+/).toSorted(), ['dark', 'light'])
    // Until theme.css arrives with the app, the opening's stylesheet says which one the browser draws its own parts in.
    const first = schemesOf(text('public/entry.css'))
    assert.equal(first.get('html'), 'dark')
    assert.equal(first.get("html[data-theme='light']"), 'light')
  })

  // A manifest has one ground for everyone (no colours per scheme yet). No choice is the room, so the installed app
  // opens on the room's ground and most people step into it without a flash (Luis, 2026-10-17: «déjalo en negro»).
  it('an installed app opens on the room’s ground, the appearance shown when nothing is chosen', () => {
    const manifest: unknown = JSON.parse(text('public/manifest.webmanifest'))
    assert.ok(manifest && typeof manifest === 'object' && 'background_color' in manifest && 'theme_color' in manifest)
    for (const ground of [manifest.background_color, manifest.theme_color]) {
      assert.ok(typeof ground === 'string')
      const step = contrast(rgb(ground), rgb(VOID))
      assert.ok(step <= 1.1, `${ground}: ${step.toFixed(2)}:1 from the room`)
    }
  })
})
