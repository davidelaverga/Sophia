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
