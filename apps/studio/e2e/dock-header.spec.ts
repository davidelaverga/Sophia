// The room's dock in the header (docs/plans/dock-header.md): on the views that are not the Studio, the group «Project
// room» sits first in the topbar's end cluster, static and within the topbar, its pill the ghost's height; in a call its
// switches are there too; on a narrow screen it floats at the bottom right as before.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const dock = (page: Page) => page.getByRole('group', { name: 'Project room' })

/** Where the dock stands: its position, whether it is inside the end cluster and the topbar's box, its pill's height. */
const dockRead = (page: Page) =>
  page.evaluate(() => {
    const group = document.querySelector<HTMLElement>('.mini-dock')
    const topbar = document.querySelector<HTMLElement>('.topbar')
    const end = document.querySelector<HTMLElement>('.topbar-end')
    if (!group || !topbar || !end) return null
    const g = group.getBoundingClientRect()
    const t = topbar.getBoundingClientRect()
    const pill = group.querySelector<HTMLElement>('.pill')
    const invite = document.querySelector<HTMLElement>('.invite-button')
    return {
      position: getComputedStyle(group).position,
      inEnd: end.contains(group),
      first: end.firstElementChild === group,
      withinTopbar: g.top >= t.top && g.bottom <= t.bottom + 0.5 && g.right <= t.right,
      pill: pill ? Math.round(pill.getBoundingClientRect().height) : null,
      invite: invite ? Math.round(invite.getBoundingClientRect().height) : null,
      shadow: getComputedStyle(group).boxShadow,
      bottom: Math.round(window.innerHeight - g.bottom),
    }
  })

const VIEWS: readonly [string, string, (typeof DRAWN)[keyof typeof DRAWN]][] = [
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates],
]

for (const [name, url, parts] of VIEWS) {
  test(`dock · ${name}: the room's group is first in the header's end cluster, static, within the topbar`, async ({
    page,
  }) => {
    await page.goto(url)
    await drawn(page, parts)
    await expect(dock(page).getByRole('button', { name: /^Join the room/ })).toBeVisible()
    const read = await dockRead(page)
    expect(read?.position).toBe('relative') // in the flow of the cluster; its notes' box
    expect(read?.inEnd).toBe(true)
    expect(read?.first).toBe(true)
    expect(read?.withinTopbar).toBe(true)
    expect(read?.shadow).toBe('none')
    expect(read?.pill).toBe(28)
    expect(read?.invite).toBe(28)
  })
}

test('dock · in a call, Tasks: the switches and Leave are in the header too', async ({ page }) => {
  await page.goto('/room.html?demo=1&call=on&people=2&floor=1&sophia=listening&place=work')
  await drawn(page, DRAWN.tasks)
  const group = dock(page)
  await expect(group.getByRole('button', { name: /^In the room/ })).toBeVisible()
  await expect(group.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  const read = await dockRead(page)
  expect(read?.inEnd).toBe(true)
  expect(read?.withinTopbar).toBe(true)
  // The views' nav still stands whole beside the live dock: nothing of it scrolls out of sight.
  const nav = await page.evaluate(() => {
    const el = document.querySelector('.view-nav')
    return el ? { scroll: el.scrollWidth, client: el.clientWidth } : null
  })
  expect(nav?.scroll).toBeLessThanOrEqual(nav?.client ?? 0)
})

test('dock · what the dock says hangs under the header, on the page: Sophia looking, from Tasks in a call', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&call=on&people=2&floor=1&sophia=listening&video=screen&looking=screen&place=work')
  await drawn(page, DRAWN.tasks)
  const looking = dock(page).locator('.sophia-looking')
  await expect(looking).toBeVisible()
  const read = await page.evaluate(() => {
    const el = document.querySelector('.mini-dock .sophia-looking')
    const topbar = document.querySelector('.topbar')
    if (!el || !topbar) return null
    const r = el.getBoundingClientRect()
    const t = topbar.getBoundingClientRect()
    return { top: r.top, underHeader: r.top >= t.bottom - 0.5, within: r.right <= innerWidth } // at the bar's foot
  })
  expect(read?.top).toBeGreaterThanOrEqual(0)
  expect(read?.underHeader).toBe(true)
  expect(read?.within).toBe(true)
})

test('dock · nowhere on the Studio view (the room is the view) and behind a shut door', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await expect(page.locator('.mini-dock')).toHaveCount(0)
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  await expect(page.locator('.mini-dock')).toHaveCount(1)
  await page.evaluate(() => window.fixture?.shutDoor())
  await expect(page.locator('.page.notice h2')).toBeVisible()
  await expect(page.locator('.mini-dock')).toHaveCount(0)
})

test('dock · across the breakpoint the focused control keeps the focus', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  const join = () => dock(page).getByRole('button', { name: /^Join the room/ })
  await join().focus()
  await expect(join()).toBeFocused()
  await page.setViewportSize({ width: 600, height: 844 })
  await expect.poll(() => page.locator('.mini-dock').evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
  await expect(join()).toBeFocused()
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect.poll(() => page.locator('.mini-dock').evaluate((el) => getComputedStyle(el).position)).toBe('relative')
  await expect(join()).toBeFocused()
})

test('dock · under 1180 px with Conversations’ context open, the header dock stays in reach: the panel covers the page, not the header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto('/room.html?demo=1&conversations=1&place=conversations')
  // Under 1180 px the context is a panel, shut: the conversation's «Context» press is the sign the view is drawn.
  const toggle = page.getByRole('region', { name: 'Open conversation' }).getByRole('button', { name: 'Context' })
  await expect(toggle).toBeVisible()
  await expect(dock(page)).toBeVisible()
  await toggle.click()
  await expect(page.getByRole('complementary', { name: 'Project context' })).toBeVisible()
  const read = await page.evaluate(() => ({
    list: document.querySelector<HTMLElement>('.conv-list')?.inert ?? null,
    dock: document.querySelector<HTMLElement>('.topbar .mini-dock')?.inert ?? null,
  }))
  expect(read).toEqual({ list: true, dock: false })
  await expect(dock(page).getByRole('button', { name: /^Join the room/ })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('complementary', { name: 'Project context' })).toHaveCount(0)
})

test('dock · what the dock says stands in one stack: its box, under the header, holds the looking note', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&call=on&people=2&floor=1&sophia=listening&video=screen&looking=screen&place=work')
  await drawn(page, DRAWN.tasks)
  const read = await page.evaluate(() => {
    const stack = document.querySelector('.topbar .mini-dock .dock-notes')
    const looking = stack?.querySelector('.sophia-looking')
    const topbar = document.querySelector('.topbar')
    if (!stack || !looking || !topbar) return null
    const s = stack.getBoundingClientRect()
    const l = looking.getBoundingClientRect()
    return {
      grid: getComputedStyle(stack).display,
      under: s.top >= topbar.getBoundingClientRect().bottom - 0.5,
      inside: l.top >= s.top && l.bottom <= s.bottom + 0.5,
    }
  })
  expect(read).toEqual({ grid: 'grid', under: true, inside: true })
})

test('dock @phone · on a narrow screen the dock floats at the bottom right as before', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  const read = await dockRead(page)
  expect(read?.position).toBe('fixed')
  // Outside the header: a sticky header with a backdrop filter would hold a fixed child inside its own box.
  expect(read?.inEnd).toBe(false)
  expect(read?.bottom).toBeGreaterThan(0)
  expect(read?.bottom).toBeLessThan(80)
})
