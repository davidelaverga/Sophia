// Personal's day menu on a phone (docs/plans/personal-day-menu.md): each day's date on one line, its topics cut beside it.
import { expect, test } from '@playwright/test'

test('@phone · personal · the day menu keeps each date on one line', async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 760 })
  // At noon, so the fixture's days are «Yesterday» and «Today» whenever it runs (#334's half past midnight).
  await page.goto('/personal.html?at=12:00')
  // Scrolled until today's divider sits 120 px under the top, yesterday's above it: the pill names yesterday (and has
  // no divider right under it to step aside for) and opens the days.
  await page.locator('.msgs').evaluate((m) => {
    m.style.scrollBehavior = 'auto'
    const today = [...m.querySelectorAll<HTMLElement>('.c3-day')].at(-1)
    if (today) m.scrollTop += today.getBoundingClientRect().top - m.getBoundingClientRect().top - 120
  })
  const pill = page.locator('.c3-daypill')
  await expect(pill).toBeVisible()
  await pill.click()
  const rows = page.getByRole('menu', { name: 'Earlier days' }).getByRole('menuitem')
  await expect(rows.first()).toBeVisible()
  // The fixture's days are «Yesterday» and «Today», one word each: a month back they are dates («Sep 12») beside two
  // topics, as on the real stack, so the first row is given those words.
  await rows.first().evaluate((row) => {
    const label = [...row.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)
    if (label) label.textContent = 'Sep 12'
    const detail = row.querySelector('.menu-detail')
    if (detail) detail.textContent = 'retention dipped this… · went climbing after…'
  })
  const heights = await rows.evaluateAll((items) =>
    items.map((i) => {
      const range = document.createRange()
      const label = [...i.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)
      if (!label) return 0
      range.selectNodeContents(label)
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
    }),
  )
  for (const lines of heights) expect(lines).toBe(1)
})

test('@phone · menus · another menu’s rows still wrap: only the day menu keeps its dates on one line (Codex on #291)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 350, height: 760 })
  await page.goto('/room.html?demo=1')
  await page.getByRole('button', { name: 'Account' }).first().click()
  const row = page.getByRole('menu').getByRole('menuitem').first()
  await expect(row).toBeVisible()
  expect(await row.evaluate((r) => getComputedStyle(r).whiteSpace)).toBe('normal')
})

test('@phone · personal · the days’ menu hangs under the pill, never over it (docs/plans/personal-new-day-scale.md)', async ({
  page,
}) => {
  // Just after midnight the list ends on a new day, the pill shows on arrival and nothing under it crowds it.
  await page.goto('/personal.html?demo=1&at=00:04')
  const pill = page.locator('.c3-daypill')
  await expect(pill).toBeVisible()
  await pill.click()
  const menu = page.getByRole('menu', { name: 'Earlier days' })
  await expect(menu).toBeVisible()
  // On a touch screen the pill takes a finger's 40 px: the menu still hangs 6 px under its foot, as on a desktop. Read
  // once its entrance has settled.
  const gap = async () => {
    const [p, m] = [await pill.boundingBox(), await menu.boundingBox()]
    return p && m ? Math.round(m.y - (p.y + p.height)) : null
  }
  await expect.poll(gap).toBe(6)
})
