import type { Page } from '@playwright/test'

/** A colour as the browser computes it (`rgb()`, `rgba()` or `color(srgb …)`), as 0–255 channels and an alpha. */
function parse(css: string): [number, number, number, number] {
  const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(css)
  if (srgb) return [+(srgb[1] ?? 0) * 255, +(srgb[2] ?? 0) * 255, +(srgb[3] ?? 0) * 255, srgb[4] ? +srgb[4] : 1]
  const parts = (/rgba?\(([^)]+)\)/.exec(css)?.[1] ?? '0,0,0,0').split(',').map((x) => parseFloat(x))
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
}

/** One sRGB channel (0–255) made linear. */
const linear = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)

/** WCAG's relative luminance of an opaque colour. */
function luminance([r, g, b]: readonly number[]): number {
  return 0.2126 * linear(r ?? 0) + 0.7152 * linear(g ?? 0) + 0.0722 * linear(b ?? 0)
}

/** The contrast of a text colour (with its element's opacity) over the ground behind it. */
export function contrast(color: string, opacity: number, ground: string): number {
  const fg = parse(color)
  const bg = parse(ground)
  const a = fg[3] * opacity
  const seen = [0, 1, 2].map((i) => (fg[i] ?? 0) * a + (bg[i] ?? 0) * (1 - a))
  const [hi, lo] = [luminance(seen), luminance(bg)].toSorted((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

/**
 * Every visible text under `selector` below its floor (4.5:1; 3:1 from 24 px), as "words (ratio)". Drawn marks
 * (aria-hidden), screen-reader text, inert parts and those `skip` matches are left out. The page reads each text's
 * colours and the first opaque ground behind it; the ratio is worked out here.
 */
export async function lowContrast(page: Page, selector: string, skip = ''): Promise<string[]> {
  const texts = await page.evaluate(
    ([sel, without]) => {
      const hidden = `[aria-hidden="true"], .sr-only, [inert]${without ? `, ${without}` : ''}`
      const out: { words: string; color: string; opacity: number; ground: string; size: number; shown: boolean }[] = []
      const walk = document.createTreeWalker(document.querySelector(sel ?? '') ?? document.createElement('i'), 4)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const el = n.parentElement ?? document.body
        const s = getComputedStyle(el)
        // The first ground behind it that is mostly opaque (alpha 0.5 or more).
        let up: Element | null = el
        while (up && /rgba\([^)]*, 0(\.[0-4]\d*)?\)|transparent/.test(getComputedStyle(up).backgroundColor)) {
          up = up.parentElement
        }
        out.push({
          words: n.textContent?.trim() ?? '',
          color: s.color,
          opacity: parseFloat(s.opacity),
          ground: up ? getComputedStyle(up).backgroundColor : 'rgb(5, 4, 8)',
          size: parseFloat(s.fontSize),
          shown: !el.closest(hidden) && el.getBoundingClientRect().width > 0,
        })
      }
      return out
    },
    [selector, skip],
  )
  return texts
    .filter((t) => t.shown && t.words && t.opacity >= 0.05)
    .map((t) => ({ ...t, ratio: contrast(t.color, t.opacity, t.ground) }))
    .filter((t) => t.ratio < (t.size >= 24 ? 3 : 4.5))
    .map((t) => `${t.words.slice(0, 30)} (${t.ratio.toFixed(2)})`)
}
