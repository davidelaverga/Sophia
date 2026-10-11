import { expect, test } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// The screen is used (docs/plans/widths.md, informe-30 §2.4): on a wide screen a page's column reaches 1280 px, the
// board's four lanes and Knowledge's four cards stand in it, Conversations' thread keeps 760 px centred while its
// context grows to 360; on a 1024 screen the project's views scroll under a fade, never cut at a hard edge.

const WIDE = { width: 1920, height: 1000 }

test.describe('wide', () => {
  test.use({ viewport: WIDE })

  test('widths · at 1920 the page is 1280 and the board’s four lanes stand in it', async ({ page }) => {
    await page.goto('/room.html?demo=1&place=work')
    await drawn(page, DRAWN.tasks)
    const read = await page.evaluate(() => ({
      page: Math.round(document.querySelector('.page')?.getBoundingClientRect().width ?? 0),
      lanes: [...document.querySelectorAll('.lane')].map((l) => Math.round(l.getBoundingClientRect().width)),
    }))
    expect(read.page).toBe(1280)
    expect(read.lanes).toHaveLength(4)
    for (const w of read.lanes) expect(w).toBeGreaterThanOrEqual(270)
  })

  test('widths · at 1920 Knowledge shows four cards a row', async ({ page }) => {
    await page.goto('/room.html?demo=1&place=knowledge')
    await drawn(page, DRAWN.knowledge)
    const row = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.report-card')].map((c) => c.getBoundingClientRect())
      const top = Math.min(...cards.map((r) => Math.round(r.top)))
      return cards.filter((r) => Math.round(r.top) === top).map((r) => Math.round(r.width))
    })
    expect(row).toHaveLength(4)
    for (const w of row) expect(w).toBeGreaterThanOrEqual(260)
  })

  test('widths · at 1920 Conversations keeps its thread at 760 and gives the context 360', async ({ page }) => {
    await page.goto('/room.html?demo=1&conversations=1&place=conversations')
    await drawn(page, DRAWN.conversations)
    const read = await page.evaluate(() => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
      const w = (sel: string) => Math.round(document.querySelector(sel)?.getBoundingClientRect().width ?? 0)
      return { list: w('.conv-list'), field: w('.conv-field-box'), context: w('.conv-context') }
    })
    expect(read).toEqual({ list: 300, field: 760, context: 360 })
  })
})

test.describe('between', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('widths · at 1440 the context takes half of what is spare (312) and the thread keeps its 760', async ({
    page,
  }) => {
    await page.goto('/room.html?demo=1&conversations=1&place=conversations')
    await drawn(page, DRAWN.conversations)
    const read = await page.evaluate(() => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
      const w = (sel: string) => Math.round(document.querySelector(sel)?.getBoundingClientRect().width ?? 0)
      return { field: w('.conv-field-box'), context: w('.conv-context') }
    })
    expect(read).toEqual({ field: 760, context: 312 })
  })
})

test.describe('narrow', () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test('widths · at 1024 the project’s views scroll under a fade, the current one in sight, none cut at a hard edge', async ({
    page,
  }) => {
    await page.goto('/room.html?demo=1&place=resources')
    await drawn(page, DRAWN.room.slice(0, 1))
    // The row marks its ends and scrolls the current view into sight once the font has drawn: polled.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const nav = document.querySelector<HTMLElement>('.view-nav')
          const current = nav?.querySelector('[aria-current="page"]')
          const end = document.querySelector('.topbar-end')
          if (!nav || !current || !end) return null
          const box = nav.getBoundingClientRect()
          const cur = current.getBoundingClientRect()
          return {
            scrolls: nav.scrollWidth > nav.clientWidth,
            fades: getComputedStyle(nav).maskImage !== 'none',
            currentInSight: cur.left >= box.left - 1 && cur.right <= box.right + 1,
            clearOfTheEnd: box.right <= end.getBoundingClientRect().left,
          }
        }),
      )
      .toEqual({ scrolls: true, fades: true, currentInSight: true, clearOfTheEnd: true })
  })
})
