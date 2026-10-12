// Home's right half (docs/plans/home-needs-you.md): what needs you, under her light, behind the vision flag on the
// fixture's data (fixtures/home.tsx, `needs=`).
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/home.html'
const list = (page: Page) => page.getByRole('list', { name: 'Needs you' })
const pressed = (page: Page) => page.evaluate(() => window.homeFixture?.pressed ?? [])

test('home · needs you: the expiring first, soonest first, each saying where and when; one press opens it', async ({
  page,
}) => {
  await page.goto(`${PAGE}?needs=some`)
  const rows = list(page).getByRole('button')
  await expect(rows).toHaveText([
    /Ship the retry with the hotfix\?Product launch · expires in 20 min/,
    /Claude Code asks to run the export testsLaunch plan · expires in 2 h/,
    /Q3 retention report, v3Research notes · Davide asks/,
    /Marco Pereira is in the lobbyDesign review · Waiting 2 min/,
    /Sophia replied about the launch dateYesterday/,
  ])
  await expect(rows.nth(0)).toHaveAttribute('data-tone', 'soon')
  await expect(rows.nth(1)).toHaveAttribute('data-tone', 'quiet')
  await expect(rows.nth(0)).toHaveAccessibleName(/Decide$/) // the row's one action, for screen readers and touch
  await expect(rows.nth(3)).toHaveAccessibleName(/Let in$/)
  await rows.nth(0).click()
  expect(await pressed(page)).toEqual(['need d1'])
})

test('home · needs you: ↑ and ↓ move between them, Enter opens; the first and last hold', async ({ page }) => {
  await page.goto(`${PAGE}?needs=some`)
  const rows = list(page).getByRole('button')
  await rows.nth(0).focus()
  await page.keyboard.press('ArrowUp')
  await expect(rows.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(2)).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await pressed(page)).toEqual(['need r1'])
})

test('home · needs you: her light smaller at the column’s head; none, one quiet line; not given, her light alone at its size', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${PAGE}?needs=some`)
  const light = page.locator('.hw-side .hw-light')
  await expect.poll(async () => (await light.boundingBox())?.width).toBe(220)
  // The emblem at the column's head keeps its 96 px: the box is small, the mark is not.
  await expect.poll(async () => (await light.locator('svg[data-mark="umbral"]').boundingBox())?.width).toBe(96)
  const lightBox = await light.boundingBox()
  const listBox = await list(page).boundingBox()
  expect(listBox?.y ?? 0).toBeGreaterThan((lightBox?.y ?? 0) + (lightBox?.height ?? 0) - 1)
  await page.goto(`${PAGE}?needs=none`)
  await expect(page.locator('.hw-needs .hw-quiet')).toHaveText('Nothing needs you right now')
  await expect(list(page)).toHaveCount(0)
  await page.goto(PAGE)
  await expect(page.locator('.hw-side')).toHaveCount(0)
  await expect.poll(async () => (await page.locator('.hw-light').boundingBox())?.width).toBe(480)
})

test('home @phone · needs you: her mark keeps the phone’s 48 px, clear of the greeting', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${PAGE}?needs=some`)
  const mark = page.locator('.hw-side .hw-light svg[data-mark="umbral"]')
  await expect.poll(async () => (await mark.boundingBox())?.width).toBe(48)
  // The greeting's words stop before the mark: its padding-right keeps the mark's room (personal.css, ≤ 860).
  const hello = await page.locator('.hw-hello').boundingBox()
  const markBox = await mark.boundingBox()
  const words = await page.locator('.hw-hello').evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getBoundingClientRect().right
  })
  expect(hello).not.toBeNull()
  expect(words).toBeLessThanOrEqual((markBox?.x ?? 0) + 0.5)
})

test('home · needs you: by the side’s width a row takes two lines; under 1100 the page is one column, nothing wider than the screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto(`${PAGE}?needs=some`)
  const row = list(page).getByRole('button').first()
  await expect.poll(async () => (await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(58)
  await page.setViewportSize({ width: 1000, height: 900 })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const side = document.querySelector('.hw-side')?.getBoundingClientRect()
        const col = document.querySelector('.hw-col')?.getBoundingClientRect()
        return side && col ? side.top >= col.bottom - 1 && document.documentElement.scrollWidth <= innerWidth : null
      }),
    )
    .toBe(true)
})

test('home · needs you from the read (A15): the Studio’s client, the rows in urgency order, each opening where it lives', async ({
  page,
}) => {
  await page.goto(`${PAGE}?needs=api`)
  const rows = list(page).getByRole('button')
  await expect(rows).toHaveText([
    /Ship the retry with the hotfix\?Fixture project · expires in 20 min/,
    /Claude Code asks to run the export testsFixture project · Asked 10 min ago/, // a wait has no expiry
    /Marco Pereira is in the lobbyFixture project · Waiting 2 min/,
    /Sophia replied about the launch dateYesterday/,
  ])
  await rows.nth(0).click() // a decision at its own choice on the board
  await rows.nth(1).click() // a permission at its request in Resources, where its owner answers it in the tool
  await rows.nth(2).click() // a guest at the room
  await rows.nth(3).click() // a reply in the personal space
  expect(await pressed(page)).toEqual([
    'open work 00000000-0000-4000-8000-0000000000aa #decision-d1', // the decision's own choice on the board, not the task's sheet
    'open resources 00000000-0000-4000-8000-0000000000aa #request-action-1', // the request, not only the task that waits on it
    'open studio 00000000-0000-4000-8000-0000000000aa',
    'personal',
    'seen reply:t9', // a reply has no answer of its own: opening it is its seen mark, and it leaves the list
  ])
  await expect(rows).toHaveCount(3)
  await expect(rows.filter({ hasText: 'Sophia replied' })).toHaveCount(0)
})

test('home · needs you: a reply is marked seen once its turn is in sight; a turn below the fold is brought into it', async ({
  page,
}) => {
  await page.goto(`${PAGE}?needs=api&turns=log`)
  const rows = list(page).getByRole('button')
  await expect(rows).toHaveCount(4)
  await rows.nth(3).click()
  await expect.poll(() => pressed(page)).toContain('seen reply:t9')
  const read = await page.evaluate(() => {
    const log = document.querySelector('.fixture-log')
    const turn = log?.querySelector('.msg[data-turn="t9"]')
    if (!log || !turn) return null
    const t = turn.getBoundingClientRect()
    const l = log.getBoundingClientRect()
    return { inSight: t.bottom > l.top && t.top < l.bottom, scrolled: log.scrollTop > 0 }
  })
  expect(read).toEqual({ inSight: true, scrolled: true })
})

test('home · needs you: a reply whose turn never shows (the space hidden) is not marked seen, and stays', async ({
  page,
}) => {
  await page.goto(`${PAGE}?needs=api&turns=hidden`)
  const rows = list(page).getByRole('button')
  await expect(rows).toHaveCount(4)
  await rows.nth(3).click()
  await page.waitForTimeout(900) // the fixture's hidden log gives up after 400 ms
  expect(await pressed(page)).toEqual(['personal'])
  await expect(rows).toHaveCount(4)
})

test('home · needs you when the read fails: Home says so, Try again reads it', async ({ page }) => {
  await page.goto(`${PAGE}?needs=api&needsFail=1`)
  const note = page.getByRole('alert').filter({ hasText: 'Couldn’t read what needs you.' })
  await expect(note).toBeVisible()
  await expect(list(page)).toHaveCount(0)
  const failed = await page.evaluate(() => window.homeFixture?.needsReads() ?? -1)
  expect(failed).toBeGreaterThanOrEqual(1)
  await page.evaluate(() => window.homeFixture?.recover()) // the service is back
  await note.getByRole('button', { name: 'Try again' }).click()
  await expect(list(page).getByRole('button')).toHaveCount(4)
  await expect(note).toHaveCount(0)
  expect(await page.evaluate(() => window.homeFixture?.needsReads() ?? -1)).toBe(failed + 1)
})

test('home · needs you when a later read fails: the rows read last stay, and the note says so beside them', async ({
  page,
}) => {
  await page.goto(`${PAGE}?needs=api`)
  const rows = list(page).getByRole('button')
  await expect(rows).toHaveCount(4)
  await page.evaluate(() => window.homeFixture?.breakNeeds())
  // The window coming back reads again (the query is stale at once; the query library hears `visibilitychange`):
  // this read fails.
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  const note = page.getByRole('alert').filter({ hasText: 'Couldn’t read what needs you.' })
  await expect(note).toBeVisible()
  await expect(rows).toHaveCount(4)
  await page.evaluate(() => window.homeFixture?.recover())
  await note.getByRole('button', { name: 'Try again' }).click()
  await expect(note).toHaveCount(0)
  await expect(rows).toHaveCount(4)
})

test('home · needs you behind a shut padlock: nothing is read, nothing is shown', async ({ page }) => {
  await page.goto(`${PAGE}?needs=api&locked=1`)
  await expect(page.getByText('Product launch').first()).toBeVisible()
  await expect(list(page)).toHaveCount(0)
  expect(await page.evaluate(() => window.homeFixture?.needsReads() ?? -1)).toBe(0)
})

test('home · needs you refused after a good read: the rows read before are not shown (Codex on #245)', async ({
  page,
}) => {
  await page.goto(`${PAGE}?needs=api`)
  const rows = list(page).getByRole('button')
  await expect(rows).toHaveCount(4)
  await page.evaluate(() => window.homeFixture?.refuseNeeds())
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t read what needs you.' })).toBeVisible()
  await expect(rows).toHaveCount(0)
})
