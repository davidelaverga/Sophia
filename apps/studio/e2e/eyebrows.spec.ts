import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// The small capitals of the project views (docs/plans/eyebrows.md): one tracking, the kit's token's (0.06em: 0.72 px at
// 12 px, 0.63 px at the label size's 10.5), on Knowledge, Updates and Conversations alike; Updates and the day label had
// a third more. The day is data at 10.5 (Codex on #241), so the labels are read at either size (Codex on #260).

/** Every uppercase label drawn in the view, at 12 px or the label size: its words, its classes, its size, its tracking. */
const labels = (page: Page, root: string) =>
  page.evaluate((sel) => {
    const view = document.querySelector(sel)
    if (!view) return null
    return [...view.querySelectorAll<HTMLElement>('*')]
      .filter((el) => el.getClientRects().length > 0 && el.children.length === 0)
      .map((el) => ({ el, cs: getComputedStyle(el) }))
      .filter(
        ({ el, cs }) =>
          cs.textTransform === 'uppercase' && ['12px', '10.5px'].includes(cs.fontSize) && el.textContent.trim() !== '',
      )
      .map(({ el, cs }) => ({
        words: el.textContent.trim().slice(0, 32),
        className: el.className,
        size: parseFloat(cs.fontSize),
        tracking: parseFloat(cs.letterSpacing),
      }))
  }, root)

/** The token: 0.06em of the label's own size. */
const TOKEN = 0.06

for (const [name, url, parts, root] of [
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge, '.page'],
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates, '.page'],
  ['Conversations', '/room.html?demo=1&conversations=1&place=conversations', DRAWN.conversations, '.conversations'],
] as const) {
  test(`eyebrows · on ${name} every small capital label takes the token's tracking`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    const seen = await labels(page, root)
    expect(seen, root).not.toBeNull()
    expect(seen?.length ?? 0, name).toBeGreaterThan(0)
    const off = (seen ?? []).filter((l) => Math.abs(l.tracking - TOKEN * l.size) > 0.01)
    expect(off, JSON.stringify(off)).toEqual([])
    // The day label, the case the rule was written for, is among those read (Codex on #260).
    if (name === 'Conversations') expect((seen ?? []).some((l) => l.className.includes('conv-day'))).toBe(true)
  })
}
