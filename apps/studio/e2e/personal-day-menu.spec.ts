// Personal's day menu on a phone (docs/plans/personal-day-menu.md): each day's date on one line, its topics cut beside it.
import { expect, test } from '@playwright/test'

test('@phone · personal · the day menu keeps each date on one line', async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 760 })
  await page.goto('/personal.html')
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
