// Home on a phone (docs/plans/home-phone-needs.md): what needs you comes right after the greeting, in the document as on
// the screen; her light keeps the phone's place; on a wide screen the list stays the right column.
import { expect, test } from '@playwright/test'

const PAGE = '/home.html?needs=some'

test('@phone · home · what needs you sits right after the greeting, inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(PAGE)
  const needs = page.getByRole('heading', { name: 'Needs you' })
  const you = page.getByRole('heading', { name: 'You and Sophia' })
  await expect(needs).toBeVisible()
  const [n, y] = await Promise.all([needs.boundingBox(), you.boundingBox()])
  expect(n && y ? n.y < y.y : false).toBe(true)
  expect((n?.y ?? 9999) + (n?.height ?? 0)).toBeLessThanOrEqual(844)
  // First in the document too: a keyboard and a screen reader meet it where the eye does.
  const first = await page.evaluate(() => {
    const list = document.querySelector('[aria-label="Needs you"]')
    const yours = document.querySelector('[aria-label="You and Sophia"]')
    return list && yours ? (list.compareDocumentPosition(yours) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false
  })
  expect(first).toBe(true)
  await expect(page.getByRole('complementary', { name: 'What needs you' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('@phone · home · with what needs you, her mark keeps the phone’s place, clear of the greeting', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(PAGE)
  const mark = page.locator('.hw-light svg[data-mark="umbral"]')
  await expect.poll(async () => (await mark.boundingBox())?.width).toBe(48)
  const [m, hello] = await Promise.all([mark.boundingBox(), page.locator('.hw-hello').boundingBox()])
  // On the greeting's line, top right: within the greeting's height, to the right of its words.
  expect(m && hello ? m.y < hello.y + hello.height && m.x > 390 / 2 : false).toBe(true)
})

test('home · on a wide screen what needs you stays the right column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(PAGE)
  const side = page.getByRole('complementary', { name: 'What needs you' })
  const [s, col] = await Promise.all([side.boundingBox(), page.locator('.hw-col').boundingBox()])
  expect(s && col ? s.x >= col.x + col.width : false).toBe(true)
})

test('@phone · home · a long note wraps under its title, whole, as in the side column (Codex P2 on #289)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(PAGE)
  const note = page.locator('.hw-needs-here .hw-m').first()
  await expect(note).toBeVisible()
  // A project's title may run to 180 characters: the note says it whole, on as many lines as it needs.
  const read = await note.evaluate((m) => {
    m.textContent = `${'A project with a very long title that runs on '.repeat(3)}· expires in 20 min`
    const line = parseFloat(getComputedStyle(m).lineHeight)
    return { cut: m.scrollWidth > m.clientWidth, lines: Math.round(m.getBoundingClientRect().height / line) }
  })
  expect(read.cut).toBe(false)
  expect(read.lines).toBeGreaterThan(1)
})

// The focus stays on a need when Home changes columns (docs/plans/home-needs-focus.md; Codex P2 on #289).
test('home · crossing 860 px keeps the focus on the need that had it', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 })
  await page.goto(PAGE)
  const presses = (where: string) => page.locator(`${where} button`)
  await expect(presses('.hw-side').nth(1)).toBeVisible()
  const words = (await presses('.hw-side').nth(1).textContent()) ?? ''
  await presses('.hw-side').nth(1).focus()
  await page.setViewportSize({ width: 800, height: 900 })
  await expect(presses('.hw-needs-here').nth(1)).toBeFocused()
  await expect(presses('.hw-needs-here').nth(1)).toHaveText(words)
  await page.setViewportSize({ width: 1000, height: 900 })
  await expect(presses('.hw-side').nth(1)).toBeFocused()
})

// By the need, not its place in the list (Codex P2 on #377): the list is read again every 20 s, and a need may come
// ahead of the one focused, or leave.
test('home · a need that came ahead, then crossing 860 px: the focus stays on the same need', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 })
  await page.goto('/home.html?needs=api')
  const side = page.locator('.hw-side button')
  await expect(side).toHaveCount(4)
  const marco = side.filter({ hasText: 'Marco Pereira is in the lobby' })
  await marco.focus()
  await page.evaluate(() => window.homeFixture?.urgentNeed())
  await expect(side).toHaveCount(5)
  await expect(side.first()).toContainText('Approve the pricing copy?')
  await expect(marco).toBeFocused()
  await page.setViewportSize({ width: 800, height: 900 })
  await expect(page.locator('.hw-needs-here button', { hasText: 'Marco Pereira is in the lobby' })).toBeFocused()
})

test('home · a need that left is not stood in for by its neighbour after crossing 860 px', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 })
  await page.goto('/home.html?needs=api')
  const side = page.locator('.hw-side button')
  await expect(side).toHaveCount(4)
  await side.filter({ hasText: 'Marco Pereira is in the lobby' }).focus()
  await page.evaluate(() => window.homeFixture?.dropNeed('guest:g1'))
  await expect(side).toHaveCount(3)
  await page.setViewportSize({ width: 800, height: 900 })
  await expect(page.locator('.hw-needs-here button')).toHaveCount(3)
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
})

test('home · crossing 860 px leaves a focus outside the list where it was', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 })
  await page.goto(PAGE)
  await page.locator('.hw-side button').nth(1).focus()
  // The control itself (your notes), not «the column's first button»: on one column the list of what needs you is
  // mounted first in that column, and a first-button locator would then name one of its needs instead.
  const outside = page.locator('.hw-col .hw-notes')
  await outside.focus()
  await page.setViewportSize({ width: 800, height: 900 })
  await expect(page.locator('.hw-col .hw-needs-here')).toBeVisible()
  await expect(outside).toBeFocused()
})
