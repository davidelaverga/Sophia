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
    expect(read?.position).toBe('static')
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
