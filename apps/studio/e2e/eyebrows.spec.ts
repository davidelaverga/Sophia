import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// The small capitals of the project views (docs/plans/eyebrows.md): one tracking, the kit's token's (0.06em at 12 px
// = 0.72 px), on Knowledge, Updates and Conversations alike; Updates and the day label had a third more.

/** Every uppercase 12 px label drawn in the view: its words and its tracking. */
const labels = (page: Page, root: string) =>
  page.evaluate((sel) => {
    const view = document.querySelector(sel)
    if (!view) return null
    return [...view.querySelectorAll<HTMLElement>('*')]
      .filter((el) => el.getClientRects().length > 0 && el.children.length === 0)
      .map((el) => ({ el, cs: getComputedStyle(el) }))
      .filter(
        ({ el, cs }) => cs.textTransform === 'uppercase' && cs.fontSize === '12px' && el.textContent.trim() !== '',
      )
      .map(({ el, cs }) => ({ words: el.textContent.trim().slice(0, 32), tracking: cs.letterSpacing }))
  }, root)

const TOKEN = '0.72px'

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
    const off = (seen ?? []).filter((l) => l.tracking !== TOKEN)
    expect(off, JSON.stringify(off)).toEqual([])
  })
}
