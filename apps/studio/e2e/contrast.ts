import type { Page } from '@playwright/test'

interface Colour {
  r: number
  g: number
  b: number
  a: number
}

/** A colour as the browser computes it (`rgb()`, `rgba()` or `color(srgb …)`). */
function colourOf(css: string): Colour {
  const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(css)
  if (srgb)
    return { r: +(srgb[1] ?? 0) * 255, g: +(srgb[2] ?? 0) * 255, b: +(srgb[3] ?? 0) * 255, a: srgb[4] ? +srgb[4] : 1 }
  const [r = 0, g = 0, b = 0, a = 1] = (/rgba?\(([^)]+)\)/.exec(css)?.[1] ?? '0,0,0,0')
    .split(',')
    .map((x) => parseFloat(x))
  return { r, g, b, a }
}

/** `top` laid over the opaque `under`. */
function over(top: Colour, under: Colour): Colour {
  const mix = (t: number, u: number) => t * top.a + u * (1 - top.a)
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 }
}

/** A channel's share of the light, as WCAG counts it. */
const channel = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
const lightOf = (c: Colour) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)

/** What a text's page measurement holds: its ink, its opacity through the tree, and the grounds up the tree. */
interface Seen {
  words: string
  ink: string
  opacity: number
  grounds: string[]
  size: number
}

/** The contrast of a text, its ink (at its opacity) over its grounds composited up to the first opaque one. */
export function contrastOf({ ink, opacity, grounds }: Seen): number {
  const layers = grounds.map(colourOf).filter((c) => c.a > 0)
  const opaque = layers.findIndex((c) => c.a >= 1)
  const ground = layers
    .slice(0, opaque === -1 ? layers.length : opaque + 1)
    .reduceRight((under, top) => over(top, under), { r: 5, g: 4, b: 8, a: 1 })
  const text = colourOf(ink)
  const [hi = 0, lo = 0] = [lightOf(over({ ...text, a: text.a * opacity }, ground)), lightOf(ground)].toSorted(
    (a, b) => b - a,
  )
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Every readable text under `selector` below its floor (4.5:1; 3:1 from 24 px), as "words (ratio)". Left out: text
 * not drawn (screen-reader only, zero size, invisible, its ink or its tree all but transparent), inert parts, `skip`'s matches, and lone glyphs a person sees
 * as marks (an arrow, aria-hidden). Aria-hidden words are still measured: they are read by the eye.
 */
export async function lowContrast(page: Page, selector: string, skip = ''): Promise<string[]> {
  const away = `.sr-only, [inert]${skip ? `, ${skip}` : ''}`
  const seen = await page.evaluate(
    async ([sel, hidden]) => {
      // Measured at rest: what is still arriving (a fade in) is waited for; what loops for ever is not.
      const arriving = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity)
      await Promise.all(arriving.map((a) => a.finished.catch(() => null)))
      const out: (Seen & { drawn: boolean; mark: boolean })[] = []
      const walk = document.createTreeWalker(document.querySelector(sel) ?? document.body, 4)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const el = n.parentElement
        if (!el) continue
        let opacity = 1
        const grounds: string[] = []
        for (let up: Element | null = el; up; up = up.parentElement) {
          opacity *= parseFloat(getComputedStyle(up).opacity)
          grounds.push(getComputedStyle(up).backgroundColor)
        }
        const s = getComputedStyle(el)
        out.push({
          words: (n.textContent ?? '').trim(),
          ink: s.color,
          opacity,
          grounds,
          size: parseFloat(s.fontSize),
          drawn: !el.closest(hidden) && el.getBoundingClientRect().width > 0 && s.visibility !== 'hidden',
          mark: !!el.closest('[aria-hidden="true"]'),
        })
      }
      return out
    },
    [selector, away] as const,
  )
  return seen
    .filter((t) => t.drawn && t.words && !(t.mark && t.words.length <= 1) && t.opacity * colourOf(t.ink).a >= 0.05)
    .map((t) => ({ t, ratio: contrastOf(t) }))
    .filter(({ t, ratio }) => ratio < (t.size >= 24 ? 3 : 4.5))
    .map(({ t, ratio }) => `${t.words.slice(0, 30)} (${ratio.toFixed(2)})`)
}
