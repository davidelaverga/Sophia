// Personal's day pill (docs/plans/personal-day-pill.md): it steps aside while the next day's divider is right under it,
// and comes back naming that day once the divider has gone above.
import { expect, test, type Page } from '@playwright/test'

/**
 * The fixture's clock stands at noon. Today's turns are minutes old: in the quarter hour after midnight some fell on
 * yesterday, the «Today» divider moved, and the pill had nothing to step aside for (CI at 00:06 UTC).
 */
const PAGE = '/personal.html?at=12:00'

/** Scroll the list so the «Today» divider's top sits `offset` px under the list's top (negative: above it). */
const placeToday = (page: Page, offset: number) =>
  page.locator('.msgs').evaluate((list, by) => {
    list.style.scrollBehavior = 'auto'
    const today = [...list.querySelectorAll<HTMLElement>('.c3-day')].find((d) => /Today/.test(d.textContent))
    if (!today) throw new Error('no Today divider')
    const gap = today.getBoundingClientRect().top - list.getBoundingClientRect().top
    list.scrollTop += gap - by
    list.dispatchEvent(new Event('scroll'))
  }, offset)

test('personal · the day pill steps aside for the divider under it, and comes back once it has gone above', async ({
  page,
}) => {
  // Short enough that the fixture's two days scroll past the pill.
  await page.setViewportSize({ width: 1440, height: 440 })
  await page.goto(PAGE)
  const pill = page.locator('.c3-daypill')
  await placeToday(page, 20)
  await expect(pill).toHaveAttribute('data-crowded', 'true')
  await expect.poll(() => pill.evaluate((p) => getComputedStyle(p).opacity)).toBe('0')
  await placeToday(page, -40)
  await expect(pill).not.toHaveAttribute('data-crowded', 'true')
  await expect(pill).toContainText('Today')
  await expect.poll(() => pill.evaluate((p) => getComputedStyle(p).opacity)).toBe('1')
})

test('personal · the pill stepped aside leaves the accessibility tree, and comes back to it (Codex P2 on #292)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 440 })
  await page.goto(PAGE)
  const pill = page.locator('.c3-daypill')
  await placeToday(page, 20)
  await expect(pill).toHaveAttribute('data-crowded', 'true')
  await expect(pill).toHaveAttribute('aria-hidden', 'true')
  await expect(pill).toHaveAttribute('inert', '')
  await placeToday(page, -40)
  await expect(pill).not.toHaveAttribute('aria-hidden', 'true')
  await expect(pill).not.toHaveAttribute('inert', '')
})

test('personal · a resize that moves the divider away reads the crowding again, with no scroll (Codex P1 on #316)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 440 })
  await page.goto(PAGE)
  const pill = page.locator('.c3-daypill')
  // Room below, so the reader is not at the end: the list's own stick-to-the-end would otherwise scroll, and that
  // scroll alone would read the crowding again.
  await page.locator('.msgs').evaluate((list) => {
    list.style.overflowAnchor = 'none'
    const room = document.createElement('div')
    room.style.height = '2000px'
    list.append(room)
  })
  await placeToday(page, 20)
  await expect(pill).toHaveAttribute('data-crowded', 'true')
  // The box changes size and the divider goes 80 px further down; scrollTop does not move, so no scroll event fires.
  const scrolls = await page.locator('.msgs').evaluate(async (list) => {
    // placeToday's own scrollTop queues a scroll the browser delivers at the next frame: let it go before listening,
    // or it is counted as the resize's (it raced the check about one run in three).
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    let seen = 0
    list.addEventListener('scroll', () => seen++)
    list.style.paddingTop = `${parseFloat(getComputedStyle(list).paddingTop) + 80}px`
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    return seen
  })
  expect(scrolls).toBe(0)
  await expect(pill).not.toHaveAttribute('data-crowded', 'true')
})

test('personal · the days’ menu closed with Escape once the pill is crowded: the focus goes to the divider under it (Codex P2 on #316)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 440 })
  await page.goto(PAGE)
  const pill = page.locator('.c3-daypill')
  await placeToday(page, -40)
  await pill.click()
  await expect(page.getByRole('menu', { name: 'Earlier days' })).toBeVisible()
  // Open, the pill stays in reach; the divider comes right under it meanwhile.
  await placeToday(page, 20)
  await page.keyboard.press('Escape')
  await expect(pill).toHaveAttribute('data-crowded', 'true')
  const focused = page.locator(':focus')
  await expect(focused).toHaveClass(/c3-day\b/)
  await expect(focused).toContainText('Today')
})
