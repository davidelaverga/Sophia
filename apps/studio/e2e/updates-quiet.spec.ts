import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// Updates, quiet (docs/plans/updates-quiet.md): two panes on a wide screen, labels not headings, each digest line marked
// by its kind, each meeting with a bar for how long it lasted. On the fixture page; only the API is faked, and each
// check ends by asking the page whether anything reached for it unanswered.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const since = (page: Page) => page.getByRole('region', { name: 'Since you last looked' })
const meetings = (page: Page) => page.getByRole('region', { name: 'Meetings' })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('updates · on a wide screen, what changed and the meetings side by side, tops aligned', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/room.html?place=updates')
  await expect(meetings(page).getByRole('button').first()).toBeVisible()
  const [s, m] = await Promise.all([since(page).boundingBox(), meetings(page).boundingBox()])
  if (!s || !m) throw new Error('a part is missing')
  expect(s.x + s.width).toBeLessThanOrEqual(m.x)
  expect(Math.abs(s.y - m.y)).toBeLessThanOrEqual(1)
  // The meetings' words start on their label's edge.
  const edges = await meetings(page).evaluate((part) => {
    const label = part.querySelector('h3')?.getBoundingClientRect().left ?? 0
    const row = part.querySelector('.meeting-row')
    const pad = row ? parseFloat(getComputedStyle(row).paddingLeft) : 0
    return { label, words: (row?.getBoundingClientRect().left ?? 0) + pad }
  })
  expect(Math.abs(edges.words - edges.label)).toBeLessThanOrEqual(1)
})

test('updates @phone · one column, the meetings below, nothing sideways', async ({ page }) => {
  await page.goto('/room.html?place=updates')
  await expect(meetings(page).getByRole('button').first()).toBeVisible()
  const [s, m] = await Promise.all([since(page).boundingBox(), meetings(page).boundingBox()])
  if (!s || !m) throw new Error('a part is missing')
  expect(m.y).toBeGreaterThanOrEqual(s.y + s.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})

test('updates · each section says its kind, and each line wears its mark', async ({ page }) => {
  await page.goto('/room.html?place=updates')
  const decided = since(page).locator('[data-kind="decided"]')
  await expect(decided).toContainText('Keep the room checks on fixtures')
  // The decided mark is a tick (a bordered corner), the open one a dot: not the same plain mark.
  const mark = (kind: string) =>
    since(page)
      .locator(`[data-kind="${kind}"] li`)
      .first()
      .evaluate((li) => {
        const s = getComputedStyle(li, '::before')
        return { width: s.width, border: s.borderLeftWidth, background: s.backgroundColor }
      })
  const tick = await mark('decided')
  expect(parseFloat(tick.border)).toBeGreaterThan(0)
  // Still open: an amber dot, no border.
  const dot = await mark('still-open')
  expect(dot.background).toBe('rgb(239, 191, 134)')
  expect(parseFloat(dot.border)).toBe(0)
  const kinds = await since(page)
    .locator('[data-kind]')
    .evaluateAll((all) => all.map((el) => el.getAttribute('data-kind')))
  expect(kinds.length).toBeGreaterThan(1)
  for (const k of kinds) expect(['decided', 'made', 'kept', 'still-open', 'work']).toContain(k)
})

test('updates · a longer meeting has a wider bar; the running one a live dot, no bar', async ({ page }) => {
  await page.goto('/room.html?place=updates&call=on')
  const rows = meetings(page).getByRole('button')
  await expect(rows.first()).toContainText('Now')
  await expect(rows.first()).toHaveAttribute('data-running', 'true')
  await expect(rows.first().locator('.meeting-bar')).toBeHidden()
  // The closed ones: 38 min over 25 min.
  const widths = await meetings(page)
    .locator('.meeting-row:not([data-running]) .meeting-bar')
    .evaluateAll((all) => all.map((b) => parseFloat(getComputedStyle(b, '::after').width)))
  expect(widths).toHaveLength(2)
  expect(widths[0] ?? 0).toBeGreaterThan(widths[1] ?? 0)
  // The row's words stay what they were.
  await expect(rows.nth(1)).toHaveText('Oct 4, 15:00 · 38 min')
})

test('updates · a meeting’s recap opened from here keeps its own look: no marks, its rule kept', async ({ page }) => {
  await page.goto('/room.html?place=updates')
  await meetings(page).getByRole('button').first().click()
  const sheet = page.getByRole('dialog', { name: 'This meeting' })
  await expect(sheet.locator('.recap-section li').first()).toBeVisible()
  const marks = await sheet
    .locator('.recap-section li')
    .evaluateAll((all) => all.map((li) => getComputedStyle(li, '::before').content))
  for (const m of marks) expect(m).toBe('none')
})

test('updates · every label and line reads at 4.5:1, on the app’s type sizes', async ({ page }) => {
  await page.goto('/room.html?place=updates')
  await expect(meetings(page).getByRole('button').first()).toBeVisible()
  expect(await lowContrast(page, '.updates')).toEqual([])
  const sizes = await typeSizes(page, '.updates')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px', '28px'], sizes.join(' ')).toContain(s)
})
