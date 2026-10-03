import type { Page } from '@playwright/test'

/** The font sizes a person sees in a part of the page: visible text only, not an avatar's initial (a glyph). */
export const typeSizes = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel)
    const seen = new Set<string>()
    if (!root) return []
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement
      if (!el || !n.textContent?.trim() || el.closest('.sr-only, .tip, .avatar')) continue
      if (el.getBoundingClientRect().width === 0) continue
      seen.add(getComputedStyle(el).fontSize)
    }
    return [...seen].toSorted()
  }, selector)
