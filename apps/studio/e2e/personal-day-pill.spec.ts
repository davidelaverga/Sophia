// Personal's day pill (docs/plans/personal-day-pill.md): it steps aside while the next day's divider is right under it,
// and comes back naming that day once the divider has gone above.
import { expect, test, type Page } from '@playwright/test'

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
  await page.goto('/personal.html')
  const pill = page.locator('.c3-daypill')
  await placeToday(page, 20)
  await expect(pill).toHaveAttribute('data-crowded', 'true')
  await expect.poll(() => pill.evaluate((p) => getComputedStyle(p).opacity)).toBe('0')
  await placeToday(page, -40)
  await expect(pill).not.toHaveAttribute('data-crowded', 'true')
  await expect(pill).toContainText('Today')
  await expect.poll(() => pill.evaluate((p) => getComputedStyle(p).opacity)).toBe('1')
})
