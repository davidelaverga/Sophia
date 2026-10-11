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
