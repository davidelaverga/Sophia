import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// One menu (docs/plans/menu-scale.md): the account's, the resources' sort, the dock's «Pass to…» and the personal
// space's days open in the one `.menu` plane, 6 px from the control that opens them and aligned to it, 6 px of
// padding, rows of 32 px in the body type (44 to a finger), their first row (or the one checked) focused on opening;
// the arrows move, Escape closes and gives the focus back to the control, Tab closes it too.

/** The open menu as the page sees it, beside the control that opened it (the one expanded). */
function readMenu() {
  const menu = document.querySelector<HTMLElement>('[role="menu"]')
  const opener = document.querySelector<HTMLElement>('[aria-haspopup="menu"][aria-expanded="true"]')
  if (!menu || !opener) return null
  const cs = getComputedStyle(menu)
  const m = menu.getBoundingClientRect()
  // The control as seen: its field, when it stands in one (the sort's button in its quiet field).
  const o = (opener.closest('.field') ?? opener).getBoundingClientRect()
  const rows = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')]
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const near = (a: number, b: number) => Math.abs(a - b) <= 1
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const mid = (r: DOMRect) => r.left + r.width / 2
  const under = m.top >= o.bottom
  const gap = Math.round(under ? m.top - o.bottom : o.top - m.bottom)
  const aligned = near(m.right, o.right)
    ? 'end'
    : near(m.left, o.left)
      ? 'start'
      : near(mid(m), mid(o))
        ? 'centre'
        : 'off'
  return {
    label: menu.getAttribute('aria-label') ?? '',
    plane: `${cs.padding} · ${cs.borderRadius} · ${cs.borderTopWidth} ${cs.borderTopColor}`,
    at: `${String(gap)} px ${under ? 'under' : 'over'}, ${aligned}`,
    rows: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
    type: [...new Set(rows.map((r) => getComputedStyle(r).fontSize))],
    stops: rows.every((r) => r.tabIndex === -1),
    focused: rows.findIndex((r) => r === document.activeElement),
    checked: rows
      .filter((r) => r.getAttribute('aria-checked') === 'true')
      .map((r) => `${r.textContent.trim()}${r.querySelector('.menu-mark') ? ' ●' : ''}`),
  }
}

/** The open menu, polled: its arrival moves it 3 px, so the measure is the one it rests at. */
function openMenu(page: Page) {
  return expect.poll(() => page.evaluate(readMenu))
}

const PLANE = '6px · 8px · 1px rgba(236, 235, 241, 0.14)'
const ONE = { plane: PLANE, rows: [32], type: ['13px'], stops: true }

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

test('menu · the account’s: the plane 6 px under its control at its end, the arrows move, Escape gives the focus back', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  const account = page.getByRole('button', { name: 'Account' })
  await account.click()
  await openMenu(page).toEqual({ ...ONE, label: 'Account', at: '6 px under, end', focused: 0, checked: [] })
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'How privacy works' })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('menuitem', { name: /^Your data/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(account).toBeFocused()
})

test('menu · the resources’ sort: the same plane, the order in use marked and focused, Tab closes it', async ({
  page,
}) => {
  await page.goto('/resources.html')
  await drawn(page, DRAWN.resources)
  await page.locator('.resource-sort-button').click()
  await openMenu(page).toEqual({
    ...ONE,
    label: 'Sort',
    at: '6 px under, end',
    focused: 0,
    checked: ['Attention ●'],
  })
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: 'Owner' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('menu')).toHaveCount(0)
})

test('menu · the dock’s «Pass to…»: the same plane 6 px over its control, centred; Enter passes', async ({ page }) => {
  await page.goto('/room.html?demo=1&call=on&people=2&floor=me&sophia=listening')
  await drawn(page, DRAWN.room.slice(0, 1))
  await page.getByRole('button', { name: 'Pass to…' }).click()
  await openMenu(page).toEqual({
    ...ONE,
    label: 'Pass the floor to',
    at: '6 px over, centre',
    focused: 0,
    checked: [],
  })
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Lucía' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toHaveCount(0)
  expect(await page.evaluate(() => window.fixture?.floorTo)).toEqual(['Lucía'])
})

test('menu · the personal space’s days: the same plane 6 px under the day pill, centred; the first row waits while reading', async ({
  page,
}) => {
  // Short enough for the conversation to scroll, so the day pill shows.
  await page.setViewportSize({ width: 1280, height: 480 })
  await page.goto('/personal.html?demo=1&earlier=1&readSlow=1')
  await drawn(page, DRAWN.personal)
  await page.locator('.msgs').evaluate((l) => {
    l.style.scrollBehavior = 'auto'
    l.scrollTop = 200
  })
  const pill = page.locator('.c3-daypill')
  await expect(pill).toBeVisible()
  await pill.click()
  await openMenu(page).toEqual({
    ...ONE,
    label: 'Earlier days',
    at: '6 px under, centre',
    focused: 0,
    checked: [],
  })
  await expect(page.getByRole('menuitem', { name: 'Yesterday' }).locator('.menu-detail')).toContainText('the pitch')
  await page.getByRole('menuitem', { name: 'Show earlier days' }).click()
  await expect(page.getByRole('menuitem', { name: 'Reading…' })).toHaveAttribute('aria-disabled', 'true')
})

test('@phone · menu · the account’s rows are 44 to a finger, in the same plane', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Account' }).click()
  await openMenu(page).toMatchObject({ rows: [44], plane: PLANE })
})
