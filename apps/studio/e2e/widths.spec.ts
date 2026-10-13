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
    // Four lanes, or five while something is blocked (docs/plans/board-blocked.md): four stand at 270 and up, five at 220.
    expect([4, 5]).toContain(read.lanes.length)
    for (const w of read.lanes) expect(w).toBeGreaterThanOrEqual(read.lanes.length === 5 ? 220 : 270)
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

  test('widths · at 1024 with Updates open, the current view stands clear of the fade before Resources', async ({
    page,
  }) => {
    await page.goto('/room.html?demo=1&place=updates')
    await drawn(page, DRAWN.updates)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const nav = document.querySelector<HTMLElement>('.view-nav')
          const current = nav?.querySelector('[aria-current="page"]')
          if (!nav || !current) return null
          const box = nav.getBoundingClientRect()
          const cur = current.getBoundingClientRect()
          const fade = box.width * 0.18
          return {
            inSight: cur.left >= box.left - 1 && cur.right <= box.right + 1,
            clearOfTheFades:
              (!nav.hasAttribute('data-more-end') || cur.right <= box.right - fade + 1) &&
              (!nav.hasAttribute('data-more-start') || cur.left >= box.left + fade - 1),
          }
        }),
      )
      .toEqual({ inSight: true, clearOfTheFades: true })
  })
})

test('widths · at 1024 a view the keyboard reaches is scrolled clear of the fade, as the current one is', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  const nav = page.locator('.view-nav')
  const updates = nav.getByRole('link', { name: 'Updates' })
  await updates.focus()
  await expect
    .poll(async () => {
      const box = await nav.boundingBox()
      const r = await updates.boundingBox()
      if (!box || !r) return false
      const moreEnd = await nav.evaluate((el) => el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
      return !moreEnd || r.x + r.width <= box.x + box.width - box.width * 0.18 + 1
    })
    .toBe(true)
})

test('widths · at 1024 a view pressed under the fade opens: the row does not move it from under the pointer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  const nav = page.locator('.view-nav')
  const updates = nav.getByRole('link', { name: 'Updates' })
  const box = await nav.boundingBox()
  const r = await updates.boundingBox()
  if (!box || !r) throw new Error('no nav')
  // Its part in sight, under the end's fade (the keyboard test above reads it there at 1024).
  const right = Math.min(r.x + r.width, box.x + box.width) - 2
  const left = Math.max(r.x, box.x + box.width - box.width * 0.18)
  expect(right).toBeGreaterThan(left)
  await page.mouse.click((left + right) / 2, r.y + r.height / 2)
  await expect(updates).toHaveAttribute('aria-current', 'page')
  await drawn(page, DRAWN.updates)
})

test('widths · at 1920 the composer’s hint keeps the column of its field and the quick asks', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 })
  await page.goto('/room.html?demo=1&conversations=1&place=conversations')
  await drawn(page, DRAWN.conversations)
  const left = async (sel: string) => (await page.locator(sel).boundingBox())?.x ?? NaN
  const field = await left('.conv-field-box')
  expect(Math.abs((await left('.conv-quick')) - field)).toBeLessThan(1)
  expect(Math.abs((await left('.conv-compose-hint')) - field)).toBeLessThan(1)
})

for (const [name, url, parts] of [
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates],
  ['Conversations', '/room.html?demo=1&conversations=1&place=conversations', DRAWN.conversations],
  // A viewer's header carries «Copy project link», wider than Invite (Codex on #259).
  ['Updates, as a viewer', '/room.html?demo=1&place=updates&role=viewer', DRAWN.updates.slice(1)],
] as const) {
  test(`widths · at 1280 the seven views stand whole in the nav on ${name}, the room idle`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(url)
    // Measured with the header whole (its actions come with the snapshot and take width from the nav), the app's
    // fonts in (a fallback face is narrower), and the nav's own overflow read.
    await drawn(page, parts)
    if (url.includes('role=viewer')) await expect(page.locator('.copy-link')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const read = () =>
      page.evaluate(() => {
        const nav = document.querySelector('.view-nav')
        if (!nav) return null
        const links = [...nav.querySelectorAll('a')]
        const box = nav.getBoundingClientRect()
        const first = links[0]?.getBoundingClientRect()
        const last = links.at(-1)?.getBoundingClientRect()
        return {
          fits: nav.scrollWidth <= nav.clientWidth,
          moreStart: nav.hasAttribute('data-more-start'),
          moreEnd: nav.hasAttribute('data-more-end'),
          whole: !!first && !!last && first.left >= box.left - 0.5 && last.right <= box.right + 0.5,
        }
      })
    await expect.poll(read).toEqual({ fits: true, moreStart: false, moreEnd: false, whole: true })
  })
}

test('widths @phone · the nav’s first word starts at the page gutter, as the header’s mark does', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  // The first view open: its link is the row's first, so nothing scrolls it out of the gutter (Codex on #259).
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await page.evaluate(() => document.fonts.ready)
  const read = await page.evaluate(() => {
    const topbar = document.querySelector('.topbar')
    const nav = document.querySelector<HTMLElement>('.view-nav')
    const first = nav?.querySelector('a')
    if (!topbar || !nav || !first) return null
    // The row rests on the current view (scrolled to it): measured at its start, where the first word is.
    nav.style.scrollBehavior = 'auto'
    nav.scrollLeft = 0
    const range = document.createRange()
    range.selectNodeContents(first)
    return { gutter: parseFloat(getComputedStyle(topbar).paddingLeft), word: range.getBoundingClientRect().left }
  })
  expect(read?.gutter).toBeGreaterThan(0)
  expect(Math.abs((read?.word ?? NaN) - (read?.gutter ?? 0))).toBeLessThanOrEqual(0.5)
})

test('widths · at 1280 a long project title gives way before the views do (Codex P2 on #259)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/room.html?demo=1&place=updates')
  await drawn(page, DRAWN.updates)
  await page.evaluate(() => document.fonts.ready)
  // A project titled far past «Pilot review» (titles run to 180 characters): set where the header shows it.
  await page.locator('.project-name').evaluate((el) => {
    el.textContent = 'Quarterly onboarding pilot review with the regional partners and the platform team'
  })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nav = document.querySelector('.view-nav')
        return nav ? { fits: nav.scrollWidth <= nav.clientWidth, moreEnd: nav.hasAttribute('data-more-end') } : null
      }),
    )
    .toEqual({ fits: true, moreEnd: false })
})

test('widths · at 1280 a viewer’s «Copy project link», folded to its icon, still shows it copied (Codex P2 on #259)', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/room.html?demo=1&place=updates&role=viewer')
  const copy = page.locator('.copy-link')
  await expect(copy).toBeVisible()
  const look = () => copy.evaluate((el) => `${getComputedStyle(el).color}|${getComputedStyle(el).borderTopColor}`)
  const before = await look()
  await copy.click()
  await expect(copy).toHaveAttribute('aria-label', 'Link copied')
  // Seen, not only said: the folded press changes as the copy lands.
  await expect.poll(look).not.toBe(before)
})
