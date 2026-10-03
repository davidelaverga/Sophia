import { expect, test, type Locator, type Page } from '@playwright/test'

// The lead's plan in Tasks (LFE-07.1), on its fixture page (fixtures/work.html): the real ProjectShell over a labelled
// goal and plan. No request leaves the page.
const PAGE = '/work.html'

const plan = (page: Page) => page.getByRole('region', { name: /^Plan/ })
const rows = (page: Page) => plan(page).getByRole('list', { name: 'Its tasks', exact: true }).getByRole('listitem')
/** The task whose own words these are, not one that only mentions it ("After Implement the PDF retry"). */
const row = (page: Page, task: string) =>
  rows(page).filter({ has: page.locator('.plan-task').filter({ hasText: new RegExp(`^${task}$`) }) })
/** Where an element sits up and down: its middle. */
const middle = (l: Locator) =>
  l.evaluate((el) => {
    const b = el.getBoundingClientRect()
    return b.top + b.height / 2
  })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.workFixture?.unexpected ?? [])).toEqual([])
})

test('one thing to read first: the goal in two lines, then the plan’s head, its tally and its next checkpoint', async ({
  page,
}) => {
  await page.goto(PAGE)
  const goal = page.locator('.goal').first()
  await expect(goal.locator('.goal-title')).toHaveText('RunningReports export to PDF reliably')
  await expect(goal.locator('.criteria')).toHaveCount(0) // folded under the plan
  await goal.getByRole('button', { name: '2 criteria' }).click()
  await expect(goal.locator('.criteria li')).toHaveCount(2)
  await expect(page.locator('.view-head .count')).toHaveCount(0) // it counted goals; the plan counts its tasks
  await expect(plan(page).getByRole('heading', { level: 3 })).toHaveText('Planr2Accepted')
  await expect(plan(page).getByRole('list', { name: 'Where its tasks stand' }).getByRole('listitem')).toHaveText([
    '1 waiting',
    '1 working',
    '2 not started',
    '1 free',
  ])
  await expect(plan(page).locator('.plan-checkpoint')).toHaveText('NextA retry candidate passes its review')
})

test('what waits on a decision is raised above the tasks, with who decides; what was decided is not', async ({
  page,
}) => {
  await page.goto(PAGE)
  const ask = plan(page).getByRole('region', { name: 'Davide decides' })
  await expect(ask).toContainText('Ship the retry before the report pane’s review is done?')
  await expect(ask).toContainText('Ship it now or Wait for the review')
  await expect(ask.locator('.avatar')).toBeVisible()
  await expect(plan(page).locator('.plan-ask')).toHaveCount(1) // Luis's, decided, isn't asked again
  const asked = await ask.boundingBox()
  const first = await rows(page).first().boundingBox()
  expect(asked?.y ?? 0).toBeLessThan(first?.y ?? 0)
})

test('one line per task, by what moves: a mark, the task, where it stands, who does it', async ({ page }) => {
  await page.goto(PAGE)
  await expect(rows(page).locator('.plan-task')).toHaveText([
    'Implement the PDF retry',
    'Review the retry’s candidate',
    'Review the report pane',
    'Write the export’s release note',
    'Measure render time on large reports',
  ])
  await expect(rows(page).locator('.plan-status')).toHaveText([
    'Waiting on Davide',
    'Once there is a candidate to review',
    'Working',
    'After Implement the PDF retry',
    'Free to take',
  ])
  expect(await rows(page).evaluateAll((all) => all.map((r) => r.getAttribute('data-mark')))).toEqual([
    'waiting',
    'later',
    'working',
    'later',
    'free',
  ])
  await expect(row(page, 'Review the retry’s candidate')).toHaveAttribute('data-depth', '1') // under its build
  // Who: a picture with the tool's logo on it, named on hover; a quiet ring for a session not running, dashed for no one.
  const build = row(page, 'Implement the PDF retry').locator('.plan-who')
  await expect(build).toHaveAttribute('aria-label', 'Davide’s Claude Code · worker')
  await expect(build.locator('.tool-logo')).toHaveAttribute('data-tool', 'claude-code')
  await expect(row(page, 'Write the export’s release note').locator('.avatar')).toHaveText('L')
  await expect(row(page, 'Review the retry’s candidate').locator('.plan-nobody')).not.toHaveAttribute('data-free')
  // Each is a whole ring, the size of a picture.
  for (const ring of await plan(page).locator('.plan-nobody').all()) {
    const box = await ring.boundingBox()
    expect(box?.width).toBeCloseTo(24, 1) // to a tenth: a row still arriving sits on a subpixel
    expect(box?.height).toBeCloseTo(24, 1)
  }
  await expect(row(page, 'Measure render time on large reports').locator('.plan-nobody')).toHaveAttribute(
    'data-free',
    'true',
  )
  // The marks make one column to read down; the words where each stands, another.
  const lefts = async (selector: string) =>
    new Set(
      await rows(page)
        .locator(selector)
        .evaluateAll((all) => all.map((e) => e.getBoundingClientRect().left)),
    )
  expect((await lefts('.plan-mark')).size).toBe(1)
  expect((await lefts('.plan-status')).size).toBe(1)
})

test('hovering a task lights the tasks it waits on, and only those; leaving lets them rest', async ({ page }) => {
  await page.goto(PAGE)
  await row(page, 'Write the export’s release note').hover()
  await expect(plan(page).locator('.plan-row[data-lit]')).toHaveCount(1)
  await expect(row(page, 'Implement the PDF retry')).toHaveAttribute('data-lit', 'true')
  await row(page, 'Review the retry’s candidate').hover() // a review lights the build it reviews
  await expect(row(page, 'Implement the PDF retry')).toHaveAttribute('data-lit', 'true')
  await row(page, 'Review the report pane').hover() // it waits on nothing
  await expect(plan(page).locator('.plan-row[data-lit]')).toHaveCount(0)
  await row(page, 'Write the export’s release note').hover()
  await page.mouse.move(5, 790)
  await expect(plan(page).locator('.plan-row[data-lit]')).toHaveCount(0)
})

test('what it assumes and what was decided rest in one quiet line, opened on request', async ({ page }) => {
  await page.goto(PAGE)
  const fold = plan(page).getByRole('button', { name: '2 assumed · 1 decided' })
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await expect(plan(page).getByRole('list', { name: 'Assumed' })).toHaveCount(0)
  await fold.click()
  await expect(plan(page).getByRole('list', { name: 'Assumed' }).getByRole('listitem')).toHaveText([
    'Reports stay under 20 MB.',
    'The PDF renderer keeps running on its current host.',
  ])
  await expect(plan(page).getByRole('list', { name: 'Decided' })).toContainText('Luis chose Three times')
  await fold.click()
  await expect(plan(page).getByRole('list', { name: 'Decided' })).toHaveCount(0)
})

test('for anyone but the decider the plan reads: its two folds are its only controls', async ({ page }) => {
  await page.goto(PAGE) // Luis looks; Davide decides
  await expect(rows(page)).toHaveCount(5)
  await expect(plan(page).getByRole('button')).toHaveCount(2) // the plan's own fold, and Assumed · Decided
  await expect(plan(page).getByRole('link')).toHaveCount(0)
  const pointers = await plan(page)
    .locator('*:not(button, button *)')
    .evaluateAll((all) => all.filter((el) => getComputedStyle(el).cursor === 'pointer').length)
  expect(pointers).toBe(0)
})

test('its decider answers it in one press: sent, both choices held, then decided once the lead records it', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const ask = plan(page).getByRole('region', { name: 'Davide decides' })
  await expect(ask.locator('.field-label')).toHaveText('You decide')
  await expect(ask).toContainText('expires in 2 h')
  const choices = ask.getByRole('group', { name: 'Your choice' }).getByRole('button')
  await expect(choices).toHaveText(['Ship it now', 'Wait for the review'])
  await choices.first().click()
  await expect(ask.getByRole('status')).toHaveText('Sent: Ship it now. It shows as decided once the lead records it.')
  await expect(choices.first()).toHaveAttribute('data-chosen', 'true')
  await expect(choices.first()).toHaveCSS('opacity', '1') // the one chosen stays itself, ringed; the other dims
  await expect(choices.last()).not.toHaveCSS('opacity', '1')
  await expect(choices.first()).toBeDisabled() // one answer: the other can't follow it
  await expect(choices.last()).toBeDisabled()
  expect(await page.evaluate(() => window.workFixture?.answered)).toEqual([
    { decision: 'd1', revision: 2, choice: 'ship' },
  ])
  await page.evaluate(() => window.workFixture?.settle?.('d1')) // the lead records it in its next revision
  await expect(plan(page).locator('.plan-ask')).toHaveCount(0)
  await expect(plan(page).getByRole('heading', { level: 3 })).toHaveText('Planr3Accepted')
  await plan(page).getByRole('button', { name: '2 assumed · 2 decided' }).click()
  await expect(plan(page).getByRole('list', { name: 'Decided' })).toContainText('Davide chose Ship it now')
})

test('an answer to a decision that changed is refused, said so, and the choices can be pressed again', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&conflict=1`)
  const ask = plan(page).getByRole('region', { name: 'Davide decides' })
  await ask.getByRole('button', { name: 'Wait for the review' }).click()
  await expect(ask.getByRole('status')).toHaveText(
    'This decision changed since you read it. Nothing was chosen: read it again.',
  )
  await expect(ask.getByRole('button', { name: 'Ship it now' })).toBeEnabled()
  await expect(plan(page).locator('.plan-ask')).toHaveCount(1) // still waiting: nothing was decided
})

test('several goals each carry their own plan inside their row; a plan folds to its tally', async ({ page }) => {
  await page.goto(`${PAGE}?two=1`)
  const goals = page.locator('.goal')
  await expect(goals).toHaveCount(2)
  await expect(goals.nth(0).locator('.plan')).toHaveCount(1)
  await expect(goals.nth(1).locator('.plan')).toHaveCount(1)
  const second = goals.nth(1).locator('.plan')
  await expect(second.getByText('Proposed · not accepted yet')).toBeVisible()
  await expect(second.locator('.plan-task')).toHaveText(['Draw the export’s states in the pane', 'Word each state'])
  const fold = goals.nth(0).getByRole('button', { name: 'Plan r2' })
  await expect(fold).toHaveAttribute('aria-expanded', 'true')
  await fold.click()
  await expect(goals.nth(0).locator('.plan-row')).toHaveCount(0)
  await expect(goals.nth(0).locator('.plan-tally li')).toHaveCount(4) // folded, it still says where its tasks stand
  await fold.click()
  await expect(goals.nth(0).locator('.plan-row')).toHaveCount(5)
})

test('each picture sits centred on its task’s line, a photo or an initial alike', async ({ page }) => {
  await page.goto(PAGE)
  // Measured at rest, once the rows have arrived.
  await plan(page).evaluate((p) =>
    Promise.all(
      p
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  )
  for (const task of ['Implement the PDF retry', 'Review the report pane', 'Write the export’s release note']) {
    const line = row(page, task)
    const off = Math.abs((await middle(line.locator('.avatar'))) - (await middle(line.locator('.plan-task'))))
    expect(off, task).toBeLessThan(0.6)
  }
})

test('a proposed plan says it isn’t accepted yet; a superseded one isn’t shown at all', async ({ page }) => {
  await page.goto(`${PAGE}?proposed=1`)
  await expect(plan(page).getByText('Proposed · not accepted yet')).toBeVisible()
  await expect(plan(page).getByText('Accepted', { exact: true })).toHaveCount(0)
  await page.goto(`${PAGE}?superseded=1`)
  await expect(page.getByRole('heading', { name: /Reports export to PDF reliably/ })).toBeVisible()
  await expect(page.locator('.plan')).toHaveCount(0)
  await expect(page.locator('.goal .criteria li')).toHaveCount(2) // no plan under it: its criteria open, as before
})

test('the mark of what waits pings slowly; with reduced motion asked for, it rests', async ({ page }) => {
  await page.goto(PAGE)
  const ping = () =>
    row(page, 'Implement the PDF retry')
      .locator('.plan-mark')
      .evaluate((m) => getComputedStyle(m, '::after').animationName)
  expect(await ping()).toBe('waiting-ping')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await ping()).toBe('none')
})

test('@phone · the plan holds at phone width: the task over where it stands, nothing past the screen', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(rows(page)).toHaveCount(5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  const build = row(page, 'Implement the PDF retry')
  const task = await build.locator('.plan-task').boundingBox()
  const where = await build.locator('.plan-status').boundingBox()
  expect(where?.y ?? 0).toBeGreaterThan((task?.y ?? 0) + (task?.height ?? 0) - 1)
})
