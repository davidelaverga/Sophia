// What opens, said at the door (docs/plans/sign-in-lede.md): under «Sign in to Sophia», one line says what Sophia is, in
// the body's size and ink, inside the column, on a wide screen and a phone; once the link is sent it is gone; and the
// screen still speaks in three text sizes.
import { expect, test, type Page } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

const PAGE = '/signin.html'
const LEDE = 'A room where your team and Sophia think together.'

/** The line as drawn: its size and ink, where it sits against the heading and the column, and the page's overflow. */
const ledeRead = (page: Page) =>
  page.evaluate(() => {
    const lede = document.querySelector<HTMLElement>('.screen-lede')
    const heading = document.querySelector<HTMLElement>('.screen-title')
    const column = document.querySelector<HTMLElement>('.screen-body')
    if (!lede || !heading || !column) return null
    const cs = getComputedStyle(lede)
    const l = lede.getBoundingClientRect()
    const h = heading.getBoundingClientRect()
    const c = column.getBoundingClientRect()
    const muted = document.querySelector<HTMLElement>('.screen-body p.muted')
    return {
      type: `${cs.fontSize}/${cs.lineHeight}`,
      // The same ink as the body's other line («New here? …»): the second ink, resolved by the browser.
      sameInk: muted !== null && getComputedStyle(muted).color === cs.color,
      underHeading: l.top >= h.bottom && lede.previousElementSibling === heading,
      inColumn: l.left >= c.left - 0.5 && l.right <= c.right + 0.5 && l.bottom <= window.innerHeight,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    }
  })

for (const phone of [false, true]) {
  test(`sign-in${phone ? ' @phone' : ''} · one line under the title says what opens`, async ({ page }) => {
    if (phone) await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(PAGE)
    await expect(page.getByRole('heading', { name: 'Sign in to Sophia' })).toBeVisible()
    await expect(page.getByText(LEDE)).toBeVisible()
    const read = await ledeRead(page)
    expect(read).not.toBeNull()
    expect(read?.type).toBe('14px/20px')
    expect(read?.underHeading).toBe(true)
    expect(read?.inColumn).toBe(true)
    expect(read?.overflowX).toBe(false)
    // The screen keeps its three text sizes: the title, the text, a label.
    const sizes = await typeSizes(page, '.screen-body')
    expect(sizes.length, sizes.join(' ')).toBeLessThanOrEqual(3)
  })
}

test('sign-in · the line is in the second ink, and gone once the link is sent', async ({ page }) => {
  await page.goto(PAGE)
  const read = await ledeRead(page)
  expect(read?.sameInk).toBe(true)
  await page.getByPlaceholder('you@company.com').fill('luis@example.com')
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByText(LEDE)).toHaveCount(0)
})
