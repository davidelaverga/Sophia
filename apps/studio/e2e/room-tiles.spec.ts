import { expect, test, type Page } from '@playwright/test'

// The room past a few people (docs/plans/room-tiles-overflow.md): a fixed number of tiles, the rest as «+N», and who
// keeps a tile. Every name and stream is synthetic, and the page says it is a fixture.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const room = (page: Page) => page.getByRole('list', { name: 'In the room' })
const tiles = (page: Page) => room(page).locator('.tile')
const names = (page: Page) => room(page).locator('.tile:not(.tile-more) .tile-name')
const more = (page: Page) => room(page).getByRole('button', { name: /^\+\d+ more in the call$/ })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'In the call' })
const unexpected = (page: Page) => page.evaluate(() => [...(window.fixture?.unexpected ?? [])])

async function enter(page: Page, query: string) {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(leave(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await unexpected(page)).toEqual([])
})

test('tiles · a shared screen with nine others: Sophia, three people and «+7», none collapsed', async ({ page }) => {
  await enter(page, 'people=9&video=screen')
  await expect(page.locator('.present .screen-main video')).toBeVisible()
  // Sophia's, three people's and «+N»: nine others and you, ten in all, past the four kept.
  await expect(tiles(page)).toHaveCount(5)
  await expect(more(page)).toHaveText('+7')
  // Its name holds what it shows (+7), for whoever says it aloud.
  await expect(more(page)).toHaveAccessibleName('+7 more in the call')
  const heights = await tiles(page).evaluateAll((all) => all.map((el) => el.getBoundingClientRect().height))
  expect(
    heights.filter((h) => h < 60),
    heights.join(' '),
  ).toEqual([])
})

test('tiles · the floor holder and the one showing keep their tiles, wherever they are in the list', async ({
  page,
}) => {
  await enter(page, 'people=9&video=screen&screenBy=8&floor=9')
  await expect(names(page).filter({ hasText: 'Sara' })).toHaveCount(1)
  await expect(names(page).filter({ hasText: 'Iván' })).toContainText('floor')
})

test('tiles · someone who starts speaking gets a tile', async ({ page }) => {
  await enter(page, 'people=9&video=screen')
  await expect(names(page).filter({ hasText: 'Sara' })).toHaveCount(0)
  await page.evaluate(() => window.fixture?.speaking(8))
  await expect(names(page).filter({ hasText: 'Sara' })).toHaveCount(1)
  await expect(tiles(page)).toHaveCount(5)
})

test('tiles · past the cap with nobody speaking, the first to come keep their tiles, not the first by name', async ({
  page,
}) => {
  await enter(page, 'people=11&video=camera')
  // They came as Marco, Lucía, Noor, Tomás, Inés, Ana, Diego…; by name, Ana, Diego and Elena come first.
  for (const name of ['Marco', 'Lucía', 'Noor', 'Tomás', 'Inés', 'Ana']) {
    await expect(names(page).filter({ hasText: name })).toHaveCount(1)
  }
  for (const name of ['Diego', 'Elena']) await expect(names(page).filter({ hasText: name })).toHaveCount(0)
})

test('tiles · of two who spoke together, whoever stopped last keeps the tile', async ({ page }) => {
  await enter(page, 'people=9&video=screen')
  await page.evaluate(() => window.fixture?.speaking([8, 9]))
  await expect(room(page).locator('.tile[data-speaking]')).toHaveCount(2)
  // Sara (who came first) stops first, then Iván: Iván spoke last.
  await page.evaluate(() => window.fixture?.speaking([9]))
  await expect(room(page).locator('.tile[data-speaking]')).toHaveCount(1)
  await page.evaluate(() => window.fixture?.speaking(null))
  await expect(room(page).locator('.tile[data-speaking]')).toHaveCount(0)
  await expect(names(page).filter({ hasText: 'Iván' })).toHaveCount(1)
  await expect(names(page).filter({ hasText: 'Sara' })).toHaveCount(0)
})

test('tiles · «+N» opens everyone in the call, and Close gives the focus back', async ({ page }) => {
  await enter(page, 'people=9&video=screen&floor=2')
  await more(page).click()
  // Over the whole page, not inside the stage, where the dock would draw over it.
  await expect(page.locator('body > .sheet-backdrop')).toHaveCount(1)
  await expect(sheet(page).getByRole('listitem')).toHaveCount(10)
  await expect(sheet(page).getByRole('listitem').filter({ hasText: 'Lucía' })).toContainText('has the floor')
  await expect(sheet(page).getByRole('listitem').filter({ hasText: 'you' })).toHaveCount(1)
  await sheet(page).getByRole('button', { name: 'Close' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(more(page)).toBeFocused()
})

test('tiles · a gallery of eleven others: Sophia, seven people and «+5»', async ({ page }) => {
  await enter(page, 'people=11&video=camera')
  await expect(room(page)).toHaveClass(/gallery/)
  await expect(tiles(page)).toHaveCount(9)
  await expect(more(page)).toHaveText('+5')
})

test('tiles · with three others, every tile and no «+N»', async ({ page }) => {
  await enter(page, 'people=3&video=screen')
  // Sophia's, the three others' and yours.
  await expect(tiles(page)).toHaveCount(5)
  await expect(more(page)).toHaveCount(0)
})

test('tiles · on a phone, beside a shown screen: every tile and «+N» in sight, one row, nothing to scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enter(page, 'people=9&video=screen')
  await expect(tiles(page)).toHaveCount(5)
  await expect(more(page)).toBeInViewport({ ratio: 1 })
  const rects = await tiles(page).evaluateAll((all) =>
    all.map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top }
    }),
  )
  for (const r of rects) {
    expect(r.left).toBeGreaterThanOrEqual(0)
    expect(r.right).toBeLessThanOrEqual(390)
  }
  // One row: every tile on the same line.
  expect(new Set(rects.map((r) => Math.round(r.top))).size).toBe(1)
})

for (const width of [320, 390, 820]) {
  test(`tiles · a tile’s name never lies over its initial (${String(width)} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await enter(page, 'people=9&video=screen')
    const clashes = await room(page)
      .locator('.tile:has(.tile-initial)')
      .evaluateAll((all) =>
        all.flatMap((tile) => {
          const a = tile.querySelector('.tile-initial')?.getBoundingClientRect()
          const b = tile.querySelector('.tile-name')?.getBoundingClientRect()
          if (!a || !b) return []
          const apart = a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left
          // And the initial whole inside its tile.
          const t = tile.getBoundingClientRect()
          const inside = a.top >= t.top && a.bottom <= t.bottom
          return apart && inside ? [] : [tile.textContent]
        }),
      )
    expect(clashes).toEqual([])
  })
}

/** What a screen reader is given for a tile's label (its accessibility tree, not its text nodes). */
const said = (page: Page, name: string) => room(page).locator('.tile-name').filter({ hasText: name }).ariaSnapshot()

/** A tile's label at a phone's width: the width each part takes on screen, and its words. */
const label = (page: Page, name: string) =>
  room(page)
    .locator('.tile-name')
    .filter({ hasText: name })
    .evaluate((el) => {
      const width = (selector: string) => {
        const part = el.querySelector(selector)
        return part ? Math.round(part.getBoundingClientRect().width) : null
      }
      const box = el.getBoundingClientRect()
      const guest = el.querySelector('.tile-mark[data-mark="guest"]')?.getBoundingClientRect()
      return {
        who: width('.tile-who'),
        you: width('.tile-mark[data-mark="you"]'),
        floor: width('.tile-floor'),
        guest: guest ? Math.round(guest.width) : null,
        guestWhole: !!guest && guest.right <= box.right + 0.5,
      }
    })

test('tiles · on a phone, a guest’s tile says «guest» whole, and still some of the name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enter(page, 'people=3&video=screen&guest=1')
  const guest = await label(page, 'Noor')
  expect(guest.guestWhole).toBe(true)
  expect(guest.guest).toBeGreaterThan(20)
  expect(guest.who).toBeGreaterThanOrEqual(10)
  expect(await said(page, 'Noor')).toBe('- text: Noor · guest')
})

test('tiles · on a phone, the floor’s holder has the warm edge; « · floor» is said, not shown', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enter(page, 'people=9&video=screen&floor=9')
  const holder = room(page).locator('.tile[data-floor]')
  await expect(holder).toHaveCount(1)
  // Its edge is the warm colour itself (resolved as the page resolves it).
  const [edge, warm] = await holder.evaluate((el) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--warm)'
    el.append(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()
    return [getComputedStyle(el).borderTopColor, resolved]
  })
  expect(edge).toBe(warm)
  const iv = await label(page, 'Iván')
  expect(await said(page, 'Iván')).toBe('- text: Iván · floor')
  expect(iv.floor).toBeLessThanOrEqual(1)
})

test('tiles · on a phone, your own tile gives the name the label; « · you» is said, not shown', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enter(page, 'people=9&video=screen')
  const you = await label(page, 'Fixture')
  expect(await said(page, 'Fixture')).toBe('- text: Fixture · you')
  expect(you.you).toBeLessThanOrEqual(1)
  expect(you.who).toBeGreaterThanOrEqual(30)
})

test('tiles · on a phone, a strip of a few keeps each tile a fifth of the width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enter(page, 'people=1&video=screen')
  const widths = await tiles(page).evaluateAll((all) => all.map((el) => el.getBoundingClientRect().width))
  expect(widths.length).toBeGreaterThan(1)
  for (const w of widths) expect(w).toBeLessThan(80)
})
