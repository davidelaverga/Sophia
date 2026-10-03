import { expect, test, type Page } from '@playwright/test'

// The lead's plan in Tasks (LFE-07.1), on its fixture page (fixtures/work.html): the real ProjectShell over a labelled
// goal and plan. No request leaves the page.
const PAGE = '/work.html'

const plan = (page: Page) => page.getByRole('region', { name: /^Plan/ })
const rows = (page: Page) => plan(page).getByRole('list', { name: 'Its work' }).getByRole('listitem')
/** The item whose purpose this is, not one that only mentions it ("After “Implement the PDF retry”"). */
const row = (page: Page, purpose: string) =>
  rows(page).filter({ has: page.locator('.plan-purpose').filter({ hasText: new RegExp(`^${purpose}`) }) })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.workFixture?.unexpected ?? [])).toEqual([])
})

test('the plan sits under its goal: its revision, accepted, its next checkpoint, its work in plan order', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(page.getByRole('heading', { name: 'Reports export to PDF reliably' })).toBeVisible()
  await expect(plan(page).getByRole('heading', { level: 3 })).toHaveText('Planr2Accepted')
  await expect(plan(page).getByText('Next checkpoint')).toBeVisible()
  await expect(plan(page)).toContainText('A retry candidate passes its review')
  await expect(rows(page).locator('.plan-purpose')).toHaveText([
    /^Implement the PDF retry/,
    /^Review the retry’s candidate/,
    /^Review the report pane/,
    /^Write the export’s release note/,
    /^Measure render time on large reports/,
  ])
  // The review is grouped under the build it reviews; nothing else is.
  await expect(row(page, 'Review the retry’s candidate')).toHaveAttribute('data-depth', '1')
  await expect(plan(page).locator('.plan-item[data-depth="1"]')).toHaveCount(1)
  // The goal comes first, then the plan: it serves the goal.
  const goal = await page.locator('.goal').first().boundingBox()
  const below = await plan(page).boundingBox()
  expect(below?.y ?? 0).toBeGreaterThan((goal?.y ?? 0) + (goal?.height ?? 0) - 1)
})

test('each item says who does it and when it starts, in words; a running one says what its session reports', async ({
  page,
}) => {
  await page.goto(PAGE)
  const build = row(page, 'Implement the PDF retry')
  await expect(build).toContainText('Davide’s Claude Code')
  await expect(build).toContainText('worker')
  await expect(build.getByText('Waiting', { exact: true })).toBeVisible() // its session waits on Davide
  await expect(build).not.toContainText('Starts now') // it has started: its state says the rest
  await expect(build.locator('.tool-logo')).toHaveAttribute('data-tool', 'claude-code')
  await expect(row(page, 'Review the report pane').getByText('Working', { exact: true })).toBeVisible()
  const review = row(page, 'Review the retry’s candidate')
  await expect(review).toContainText('Assigned, not running yet')
  await expect(review).toContainText('When “Implement the PDF retry” has a candidate')
  const note = row(page, 'Write the export’s release note')
  await expect(note).toContainText('Luis')
  await expect(note.locator('.avatar')).toHaveText('L') // a person, shown as the Studio shows one
  await expect(note).toContainText('After “Implement the PDF retry”')
  const measure = row(page, 'Measure render time on large reports')
  await expect(measure).toContainText('Unassigned')
  await expect(measure).toContainText('Ready for someone to take')
})

test('what it assumes stands apart from what was decided, and each decision names who decides', async ({ page }) => {
  await page.goto(PAGE)
  const assumed = plan(page).getByRole('region', { name: 'Assumed' })
  await expect(assumed.getByRole('listitem')).toHaveText([
    'Reports stay under 20 MB.',
    'The PDF renderer keeps running on its current host.',
  ])
  const open = plan(page).getByRole('region', { name: 'To decide' })
  await expect(open).toContainText('Ship the retry before the report pane’s review is done?')
  await expect(open).toContainText('Davide decides')
  await expect(open).toContainText('Ship it now · Wait for the review')
  await expect(open).not.toContainText('failed render') // what was decided isn't asked again
  const decided = plan(page).getByRole('region', { name: 'Decided' })
  await expect(decided).toContainText('Luis chose')
  await expect(decided).toContainText('Three times')
  await expect(decided).not.toContainText('Twice')
})

test('the plan reads; nothing in it looks like it acts', async ({ page }) => {
  await page.goto(PAGE)
  await expect(rows(page)).toHaveCount(5)
  await expect(plan(page).getByRole('button')).toHaveCount(0)
  await expect(plan(page).getByRole('link')).toHaveCount(0)
  const pointers = await plan(page)
    .locator('*')
    .evaluateAll((all) => all.filter((el) => getComputedStyle(el).cursor === 'pointer').length)
  expect(pointers).toBe(0)
})

test('a proposed plan says it isn’t accepted yet; a superseded one isn’t shown at all', async ({ page }) => {
  await page.goto(`${PAGE}?proposed=1`)
  await expect(plan(page).getByText('Proposed · not accepted yet')).toBeVisible()
  await expect(plan(page).getByText('Accepted', { exact: true })).toHaveCount(0)
  await page.goto(`${PAGE}?superseded=1`)
  await expect(page.getByRole('heading', { name: 'Reports export to PDF reliably' })).toBeVisible()
  await expect(page.locator('.plan')).toHaveCount(0)
})

test('@phone · the plan holds at phone width: nothing runs past the screen', async ({ page }) => {
  await page.goto(PAGE)
  await expect(rows(page)).toHaveCount(5)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  for (const right of await rows(page).evaluateAll((all) => all.map((el) => el.getBoundingClientRect().right))) {
    expect(right).toBeLessThanOrEqual(390)
  }
})
