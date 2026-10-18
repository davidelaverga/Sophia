// Goals as a briefing (docs/plans/goals-overview.md): first what waits on the viewer, then the goals by health in one
// list, each opened in a sheet; done folded; past six goals, a search.
import { expect, test, type Page } from '@playwright/test'

const ROLLOUT = 'Roll the new onboarding out to every region'
const row = (page: Page, title: string) => page.locator('li.goal', { hasText: title })

test('goals · the demo as Luis: nothing waits on him, the rollout needs attention, done folded', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  const brief = page.locator('.goals-brief')
  await expect(brief).toContainText('Nothing waits on you.')
  await expect(brief).toContainText('1 needs attention')
  await expect(page.locator('.goal-asks')).toHaveCount(0)
  const rollout = row(page, ROLLOUT)
  await expect(rollout.locator('.goal-health')).toHaveText('Needs attention')
  // Its row says the difficulty Sophia wrote on it (goal-notes.md); what stands in its way is said in its sheet.
  await expect(rollout.locator('.goal-row-line')).toContainText('Sophia “From the call')
  await expect(rollout).toContainText('1 of 7')
  await expect(row(page, 'Keep teams through an admin change')).toContainText('Not started · No plan yet')
  // What needs attention comes first.
  await expect(page.locator('li.goal').first()).toContainText(ROLLOUT)
  const done = page.getByRole('button', { name: /1 done/ })
  await expect(done).toHaveAttribute('aria-expanded', 'false')
  await done.click()
  await expect(row(page, 'Run the pilot with fourteen teams')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search goals' })).toHaveCount(0)
})

test('goals · a row opens its goal in a sheet; Escape gives the focus back; the arrows move along the rows', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=goals')
  const press = page.getByRole('button', { name: ROLLOUT, exact: true })
  await press.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Keep teams through an admin change', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(press).toBeFocused()
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog', { name: ROLLOUT })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Every new team reaches a first shared report')
  await expect(sheet).toContainText('waiting on a permission')
  await expect(sheet).toContainText('1 of 7 tasks done')
  await expect(sheet.locator('.criteria li').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(press).toBeFocused()
})

test('goals · «Open in Tasks» in the sheet opens that goal’s plan', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  await page.getByRole('button', { name: ROLLOUT, exact: true }).click()
  await page.getByRole('dialog', { name: ROLLOUT }).getByRole('button', { name: 'Open in Tasks' }).click()
  await expect(page.getByRole('heading', { name: 'Tasks', level: 2 })).toBeVisible()
  await expect(page.locator('.goal.compact', { hasText: ROLLOUT })).toBeVisible()
  expect(await page.evaluate(() => window.location.hash)).toMatch(/^#goal-/)
})

test('goals · Davide: two things wait on him; «Review» opens the request in Tasks', async ({ page }) => {
  await page.goto('/work.html?viewer=davide&view=goals')
  await expect(page.locator('.goals-brief')).toContainText('Two things wait on you.')
  const asks = page.locator('.goal-asks li')
  await expect(asks).toHaveCount(2)
  await expect(asks.first()).toContainText('pnpm --filter @sophia/report test')
  await expect(asks.nth(1)).toContainText('Ship the retry before the report pane’s review is done?')
  await asks.first().getByRole('button', { name: 'Review' }).click()
  await expect(page.getByRole('heading', { name: 'Tasks', level: 2 })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Implement the PDF retry' })).toBeVisible()
})

test('goals · nine goals: a search, and a search with no answer says so', async ({ page }) => {
  await page.goto('/work.html?goals=9&view=goals')
  const search = page.getByRole('searchbox', { name: 'Search goals' })
  await search.fill('prices')
  await expect(page.locator('li.goal')).toHaveCount(1)
  await expect(page.locator('li.goal').first()).toContainText('Localise the pricing page')
  await search.fill('nothing answers this')
  await expect(page.getByText('No goal answers “nothing answers this”.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear the search' }).click()
  await expect(search).toHaveValue('')
})

test('@phone · goals · the list fits the width, and a row opens its sheet', async ({ page }) => {
  await page.goto('/work.html?goals=6&view=goals')
  await expect(page.locator('li.goal').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Reports export to PDF reliably', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Reports export to PDF reliably' })).toBeVisible()
})

// A goal's link (docs/plans/work-copy-links.md): «Copy link» in its sheet copies the address that opens that goal, though
// a goal opened from the list doesn't write its anchor to the address bar.
test('goals · «Copy link» in the sheet copies the address that opens that goal', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/room.html?demo=1&place=goals')
  await page.getByRole('button', { name: ROLLOUT, exact: true }).click()
  const sheet = page.getByRole('dialog', { name: ROLLOUT })
  await sheet.getByRole('button', { name: 'Copy link' }).click()
  await expect(sheet.getByRole('button', { name: 'Link copied' })).toBeVisible()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(new URL(link).hash).toMatch(/^#goal-/)
  const other = await context.newPage()
  await other.goto(link)
  await expect(other.getByRole('dialog', { name: ROLLOUT })).toBeVisible()
})

test('goals · a refused «Copy link» shows the goal’s own address in the sheet; Escape closes only it (Codex P2 on #382)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) },
    })
  })
  await page.setViewportSize({ width: 360, height: 760 })
  await page.goto('/room.html?demo=1&place=goals')
  await page.getByRole('button', { name: ROLLOUT, exact: true }).click()
  const sheet = page.getByRole('dialog', { name: ROLLOUT })
  await sheet.getByRole('button', { name: 'Copy link' }).click()
  const field = sheet.getByRole('textbox', { name: 'Link', exact: true })
  await expect(field).toBeFocused()
  expect(new URL(await field.inputValue()).hash).toMatch(/^#goal-/)
  await expect(sheet.getByRole('button', { name: /address bar/ })).toHaveCount(0)
  // Whole inside the sheet, on a phone too: nothing of it cut off at the sheet's side.
  const [box, frame] = await Promise.all([field.boundingBox(), sheet.boundingBox()])
  expect(box && frame ? box.x >= frame.x && box.x + box.width <= frame.x + frame.width : false).toBe(true)
  await page.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
  await expect(sheet).toBeVisible()
})

// A goal lists the reports its work made (docs/plans/goal-reports.md): the demo's research task, the rollout's, made its
// report; the title opens it in the viewer. Without them in the snapshot, no «Reports».
for (const how of ['Escape', 'Close'] as const) {
  test(`goals · a report opened from the sheet gives the focus back to the goal’s row when it closes (${how}; Codex P2 on #414)`, async ({
    page,
  }) => {
    await page.goto('/room.html?demo=1&place=goals&reports=1')
    const press = page.getByRole('button', { name: ROLLOUT, exact: true })
    await press.focus()
    await page.keyboard.press('Enter')
    const sheet = page.getByRole('dialog', { name: ROLLOUT })
    await sheet.getByRole('region', { name: 'Reports' }).getByRole('button').focus()
    await page.keyboard.press('Enter')
    await expect(sheet).toHaveCount(0)
    await expect(page.locator('#report-pane-title')).toBeFocused()
    if (how === 'Escape') await page.keyboard.press('Escape')
    else await page.locator('.report-pane').getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.locator('.report-pane')).toHaveCount(0)
    await expect(press).toBeFocused()
  })
}

test('goals · a report opens on the version its row names; a newer one is offered (Codex P2 on #414)', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=goals&reports=1&versions=1')
  await page.getByRole('button', { name: ROLLOUT, exact: true }).click()
  const reports = page.getByRole('dialog', { name: ROLLOUT }).getByRole('region', { name: 'Reports' })
  await expect(reports.locator('.goal-report-version')).toHaveText('v1')
  // A newer version published with no event yet: the snapshot, and the row, still say v1.
  await page.evaluate(() => window.fixture?.publishReport())
  await reports.getByRole('button').click()
  await expect(page).toHaveURL(/[?&]version=00000000-0000-4000-8000-0000000000d1/)
  await expect(page.locator('.report-pane').getByText(/^v2 is here/)).toBeVisible()
})

test('goals · a goal lists the reports its work made, and a title opens it in the viewer', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals&reports=1')
  await page.getByRole('button', { name: ROLLOUT, exact: true }).click()
  const reports = page.getByRole('dialog', { name: ROLLOUT }).getByRole('region', { name: 'Reports' })
  await expect(reports.getByRole('button')).toHaveCount(1)
  await reports.getByRole('button').click()
  await expect(page).toHaveURL(/[?&]report=00000000-0000-4000-8000-0000000000b1/)
  // The sheet hands over to the report, one at a time: nothing is left over it (Codex P1 on #414).
  await expect(page.getByRole('dialog', { name: ROLLOUT })).toHaveCount(0)
  const pane = page.locator('.report-pane')
  await expect(pane).toBeVisible()
  const box = await pane.boundingBox()
  if (!box) throw new Error('the report has no box')
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  expect(await pane.evaluate((el, p) => el.contains(document.elementFromPoint(p.x, p.y)), middle)).toBe(true)
  await page.goto('/room.html?demo=1&place=goals')
  await page.getByRole('button', { name: ROLLOUT, exact: true }).click()
  await expect(page.getByRole('dialog', { name: ROLLOUT }).getByRole('region', { name: 'Reports' })).toHaveCount(0)
})
