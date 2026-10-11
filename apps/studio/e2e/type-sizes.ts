import type { Page } from '@playwright/test'

/**
 * The font sizes a person sees in a part of the page: visible text, and the words in a field (its value or its
 * placeholder, which are not text nodes), but not an avatar's initial (a glyph) nor Home's greeting (its one display
 * size, a line that grows with the screen: docs/plans/type-places.md).
 */
export const typeSizes = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) return []
    const said: Element[] = []
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.parentElement && n.textContent?.trim()) said.push(n.parentElement)
    }
    // Fields that show words: a box, a slider or a swatch keeps a value it never shows ("on" for a checkbox).
    const typed = 'input:not([type=checkbox], [type=radio], [type=range], [type=color], [type=hidden]), textarea'
    for (const field of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(typed)) {
      if ((field.value || field.placeholder).trim()) said.push(field)
    }
    const seen = new Set<string>()
    for (const el of said) {
      if (el.getBoundingClientRect().width > 0 && !el.closest('.sr-only, .tip, .avatar, .hw-hello')) {
        seen.add(getComputedStyle(el).fontSize)
      }
    }
    return [...seen].toSorted()
  }, selector)

/**
 * The words off the leading grid or the three weights, in a part of the page (docs/plans/type-leading.md): every visible
 * word's line-height is 16, 20, 24 or 32 px (or its box's own height: a line centred in a bar), its weight 400, 500 or
 * 600. Left out: a report's page (its own ramp), the greeting (display), glyphs in their circles, a PDF's text layer,
 * tips and hidden words.
 */
export const typeOff = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) return []
    const grid = new Set([16, 20, 24, 32])
    const weights = new Set(['400', '500', '600'])
    const left = '.sr-only, .tip, .avatar, .hw-hello, .md, .pdot, .tile-initial, .textLayer, .fixture-label'
    const off = new Set<string>()
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement
      if (!el || !n.textContent?.trim() || el.closest(left) || el.getBoundingClientRect().height <= 0) continue
      const cs = getComputedStyle(el)
      const lh = parseFloat(cs.lineHeight)
      const name = `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
      // A leading that is `normal` parses to nothing and is off the grid like any other.
      const onGrid = grid.has(Math.round(lh * 100) / 100) || Math.abs(lh - el.getBoundingClientRect().height) <= 1
      if (!onGrid) off.add(`${name} ${cs.fontSize}/${cs.lineHeight}`)
      if (!weights.has(cs.fontWeight)) off.add(`${name} weight ${cs.fontWeight}`)
    }
    return [...off].toSorted()
  }, selector)
