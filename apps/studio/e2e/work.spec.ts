import { expect, test, type Locator, type Page } from '@playwright/test'

// The lead's plan in Tasks (LFE-07.1), on its fixture page (fixtures/work.html): the real ProjectShell, each goal's
// plan as a board, over labelled simulated data. The page's clock runs from the fixture's NOW. No request leaves it.
const PAGE = '/work.html'

const board = (page: Page) => page.locator('.board').first()
const tile = (page: Page, id: string) => page.locator(`[data-task="${id}"]`)
const lane = (page: Page, name: string) => board(page).getByRole('region', { name, exact: true })
const titles = (l: Locator) => l.locator('.task-tile-title').allInnerTexts()
/** Waits for every arriving animation on the board to end, so what is measured is at rest. */
const settled = (page: Page) =>
  board(page).evaluate((b) =>
    Promise.all(
      b
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  )

/** Where an element is laid out; a check that measures one that isn't fails at once. */
async function rect(l: Locator) {
  const box = await l.boundingBox()
  if (!box) throw new Error('not laid out')
  return box
}

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.workFixture?.unexpected ?? [])).toEqual([])
})

test('the goal reads in two lines: its title and actions, then where its plan goes next', async ({ page }) => {
  await page.goto(PAGE)
  const goal = page.locator('.goal').first()
  await expect(goal.locator('.goal-title')).toHaveText('RunningReports export to PDF reliably')
  await expect(goal.locator('.plan-next')).toHaveText('NextA retry candidate passes its reviewPlanr2Accepted')
  await expect(goal.locator('.goal-outcome')).toHaveCount(0) // behind the fold
  await goal.getByRole('button', { name: 'Outcome · 2 criteria' }).click()
  await expect(goal.locator('.goal-outcome')).toHaveText(/first try/)
  await expect(goal.locator('.criteria li')).toHaveCount(2)
  await expect(page.locator('.view-head .count')).toHaveCount(0) // it counted goals; a plan counts its tasks
})

test('four lanes, each task in the one its state says; the words only where the lane doesn’t say them', async ({
  page,
}) => {
  await page.goto(PAGE)
  expect(await titles(lane(page, 'In motion'))).toEqual(['Implement the PDF retry', 'Review the report pane'])
  expect(await titles(lane(page, 'Up next'))).toEqual([
    'Review the retry’s candidate',
    'Write the export’s release note',
  ])
  expect(await titles(lane(page, 'Open'))).toEqual(['Measure render time on large reports'])
  expect(await titles(lane(page, 'Done'))).toEqual(['Write the retry’s failing test', 'Reproduce the failed render'])
  await expect(tile(page, 'work-1').locator('.task-chip')).toHaveText('Waiting on Davide')
  await expect(tile(page, 'work-2').locator('.task-chip')).toHaveText('Working')
  await expect(lane(page, 'Up next').locator('.task-chip')).toHaveCount(0)
  await expect(tile(page, 'work-0b').locator('.task-chip')).toHaveText('Not checked yet') // finished isn't accepted
  await expect(tile(page, 'work-0a').locator('.task-chip')).toHaveText('Checked')
  await expect(tile(page, 'work-1-review')).toContainText('Reviews Implement the PDF retry')
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(tile(page, 'work-1').locator('.task-chip')).toHaveText('Waiting on you')
})

test('a session at work says what it last reported and how long ago, its ring emptying as that ages', async ({
  page,
}) => {
  await page.goto(PAGE)
  const worker = tile(page, 'work-1')
  await expect(worker.locator('.task-tile-said')).toHaveText('Asked to run pnpm --filter @sophia/report test')
  const fresh = () =>
    worker.locator('.task-who').evaluate((w) => Number(getComputedStyle(w).getPropertyValue('--fresh')))
  const ago = await worker.locator('.task-tile-ago').innerText()
  const before = await fresh()
  await expect(worker.locator('.task-tile-ago')).not.toHaveText(ago, { timeout: 3000 }) // the clock runs
  expect(await fresh()).toBeLessThan(before)
  await expect(tile(page, 'work-3').locator('.task-who')).not.toHaveAttribute('data-live') // a person, not a session
})

test('back after a while: one line of what changed, then Mark seen, remembered for the next visit', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&since=1`)
  const away = board(page).locator('.board-return')
  await expect(away).toContainText('While you were away')
  await expect(away).toContainText('Implement the PDF retry now waits on you')
  await expect(board(page).locator('.task-tile[data-changed]')).toHaveCount(4)
  await away.getByRole('button', { name: 'Mark seen' }).click()
  await expect(away).toHaveCount(0)
  await expect(board(page).locator('.task-tile[data-changed]')).toHaveCount(0)
  await page.goto(`${PAGE}?viewer=davide`) // the next visit, without the fixture's older look
  await expect(board(page).locator('.board-return')).toHaveCount(0)
})

test('lenses dim what they don’t show and move nothing; each says how many it shows', async ({ page }) => {
  await page.goto(PAGE) // Luis looks
  const lens = (name: string) => board(page).getByRole('radio', { name: new RegExp(`^${name}`) })
  await expect(lens('For you')).toHaveText('For you3')
  await settled(page)
  const place = () => tile(page, 'work-1').boundingBox()
  const before = await place()
  await lens('For you').click()
  await expect(lens('For you')).toHaveAttribute('aria-checked', 'true')
  await expect(board(page).locator('.task-tile:not([data-dim])')).toHaveCount(3) // Luis's three
  await expect(tile(page, 'work-1')).toHaveAttribute('data-dim', 'true')
  expect(await place()).toEqual(before)
  await lens('Open').click()
  await expect(board(page).locator('.task-tile:not([data-dim])')).toHaveCount(1)
  await page.keyboard.press('ArrowLeft') // the arrows move between lenses
  await expect(lens('Waiting')).toHaveAttribute('aria-checked', 'true')
})

test('a search (/ reaches it) narrows the goals and dims the tasks that don’t answer it; Escape clears it', async ({
  page,
}) => {
  await page.goto(`${PAGE}?goals=6`)
  await expect(page.getByRole('tab')).toHaveCount(6)
  await page.keyboard.press('/')
  await expect(page.getByRole('searchbox', { name: 'Search goals and tasks' })).toBeFocused()
  await page.keyboard.type('release note')
  await expect(page.getByRole('tab')).toHaveCount(0) // one goal answers: no rail to choose from
  await expect(board(page).locator('.task-tile:not([data-dim])')).toHaveCount(1)
  await expect(tile(page, 'work-3')).not.toHaveAttribute('data-dim')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tab')).toHaveCount(6)
  await page.keyboard.type('zzz')
  await expect(page.getByText('No goal or task answers “zzz”. Escape clears the search.')).toBeVisible()
})

test('the goals’ rail moves: an arrow where more waits, a drag that chooses nothing, and the keys', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&goals=6`)
  const rail = page.locator('.goal-rail')
  const left = () => rail.evaluate((r) => r.scrollLeft)
  await expect(page.getByRole('button', { name: 'Earlier goals' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: /Reports export to PDF/ })).toContainText('for you')
  await page.getByRole('button', { name: 'More goals' }).click()
  await expect.poll(left).toBeGreaterThan(100)
  await expect(page.getByRole('button', { name: 'Earlier goals' })).toBeVisible()
  // A short drag that starts and ends over one goal doesn't choose it: the release is the drag's.
  const third = await rect(page.getByRole('tab').nth(3))
  await page.mouse.move(third.x + 40, third.y + 20)
  await page.mouse.down()
  await page.mouse.move(third.x + 100, third.y + 20, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByRole('tab', { selected: true })).toContainText('Reports export to PDF reliably')
  const box = await rect(rail)
  await page.mouse.move(box.x + 300, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + 800, box.y + 30, { steps: 8 })
  await page.mouse.up()
  await expect.poll(left).toBeLessThan(10)
  await expect(page.getByRole('tab', { selected: true })).toContainText('Reports export to PDF reliably') // unchanged
  await page.getByRole('tab', { selected: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { selected: true })).toContainText('The report pane')
  await expect(board(page).locator('.task-tile-title')).toHaveText([
    'Draw the export’s states in the pane',
    'Word each state',
  ])
})

test('hovering a task draws a thread from the task it waits on, edge to edge, and the rest steps back', async ({
  page,
}) => {
  await page.goto(PAGE)
  await settled(page)
  await tile(page, 'work-3').hover()
  await expect(board(page).locator('.thread')).toHaveCount(1)
  await expect(tile(page, 'work-1')).toHaveAttribute('data-lit', 'true')
  await expect(tile(page, 'work-3')).toHaveAttribute('data-hover', 'true')
  await expect(board(page).locator('.board-lanes')).toHaveAttribute('data-threading', 'true')
  // It leaves the waited-on tile by its right edge and enters the waiting one by its left: never over their words.
  const d = (await board(page).locator('.thread').getAttribute('d')) ?? ''
  const numbers = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  const origin = (await rect(board(page).locator('.board-lanes'))).x
  const from = await rect(tile(page, 'work-1'))
  const to = await rect(tile(page, 'work-3'))
  expect(Math.abs((numbers[0] ?? -1) - (from.x + from.width - origin))).toBeLessThan(1.5)
  expect(Math.abs((numbers.at(-2) ?? -1) - (to.x - origin))).toBeLessThan(1.5)
  await tile(page, 'work-2').hover() // it waits on nothing
  await expect(board(page).locator('.thread')).toHaveCount(0)
})

test('a decision sits in a pill, its decider’s own open; anyone else reads it, folded', async ({ page }) => {
  await page.goto(PAGE) // Luis
  const pill = board(page).getByRole('button', { name: '1 decision for Davide' })
  await expect(pill).toHaveAttribute('aria-expanded', 'false')
  await expect(board(page).locator('.plan-ask')).toHaveCount(0)
  await pill.click()
  const ask = board(page).getByRole('region', { name: 'Davide decides' })
  await expect(ask).toContainText('Ship it now or Wait for the review')
  await expect(ask.getByRole('button')).toHaveCount(0)
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(board(page).getByRole('button', { name: '1 decision for you' })).toHaveAttribute('aria-expanded', 'true')
})

test('its decider answers in one press: sent, both held, then decided once the lead records it', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const ask = board(page).getByRole('region', { name: 'Davide decides' })
  await expect(ask).toContainText('expires in 2 h')
  const choices = ask.getByRole('group', { name: 'Your choice' }).getByRole('button')
  await choices.first().click()
  await expect(ask.getByRole('status')).toHaveText('Sent: Ship it now. It shows as decided once the lead records it.')
  await expect(choices.last()).toBeDisabled()
  expect(await page.evaluate(() => window.workFixture?.answered)).toEqual([
    { decision: 'd1', revision: 2, choice: 'ship' },
  ])
  await page.evaluate(() => window.workFixture?.settle?.('d1'))
  await expect(board(page).locator('.decision-pill')).toHaveCount(0)
  await expect(page.locator('.plan-next')).toContainText('r3')
  await board(page).getByRole('button', { name: '2 assumed · 2 decided' }).click()
  await expect(board(page).getByRole('list', { name: 'Decided' })).toContainText('Davide chose Ship it now')
})

test('an answer to a decision that changed is refused, said so, and can be given again', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&conflict=1`)
  const ask = board(page).getByRole('region', { name: 'Davide decides' })
  await ask.getByRole('button', { name: 'Wait for the review' }).click()
  await expect(ask.getByRole('status')).toHaveText(
    'This decision changed since you read it. Nothing was chosen: read it again.',
  )
  await expect(ask.getByRole('button', { name: 'Ship it now' })).toBeEnabled()
})

test('pressing a task opens it: who and what it last did, what it waits on and what waits on it, J and K', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  await tile(page, 'work-1').click()
  const sheet = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await expect(sheet.locator('.task-sheet-name')).toHaveText('Davide’s Claude Codeworker')
  await expect(sheet.locator('.task-chip')).toHaveText('Waiting on you')
  await expect(sheet.locator('.task-sheet-activity')).toContainText('Asked to run pnpm --filter @sophia/report test')
  await expect(sheet.locator('.task-links').last().locator('.task-link-name')).toHaveText([
    'Review the retry’s candidate',
    'Write the export’s release note',
  ])
  await sheet.getByRole('button', { name: /Write the export’s release note/ }).click()
  await expect(page.getByRole('dialog', { name: 'Write the export’s release note' })).toBeVisible()
  await page.keyboard.press('k')
  await expect(page.getByRole('dialog', { name: 'Review the retry’s candidate' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(tile(page, 'work-1')).toBeFocused() // back to the tile it was opened from
})

test('its owner acts from the sheet, each step said as it is observed; anyone else is told whose it is', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  await tile(page, 'work-1').click()
  const sheet = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging report fixtures')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  const steps = sheet.locator('.act-steps')
  await expect(steps.locator('li[data-reached]')).toHaveCount(1) // recorded
  await expect(steps.locator('li[data-reached]')).toHaveCount(3) // queued, then delivered
  await expect(steps).toContainText('Delivered to its session. Not seen acting on it yet.')
  await sheet.getByRole('button', { name: 'Stop' }).click()
  await expect(sheet.getByRole('group', { name: 'Stop' })).toContainText('Ends its session’s work at once.')
  await page.goto(PAGE) // Luis
  await tile(page, 'work-1').click()
  await expect(page.getByRole('dialog')).toContainText('Davide steers, holds or stops their own sessions.')
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Guidance for its session' })).toHaveCount(0)
})

test('Sophia is asked about a task from its sheet; her answer writes itself in, and is heard once, whole', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  await tile(page, 'work-1').click()
  const sheet = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await sheet.getByRole('button', { name: 'Why is it waiting?' }).click()
  await expect(sheet.locator('.ask-q')).toHaveText('Why is it waiting?')
  await expect(sheet.locator('.sr-only[aria-live]')).toContainText('waiting for a permission')
  await expect(sheet.locator('.ask-a')).toContainText('answers it in Claude Code', { timeout: 8000 })
})

test('the board by keys: the arrows across lanes, Enter opens', async ({ page }) => {
  await page.goto(PAGE)
  await settled(page)
  await tile(page, 'work-1').focus()
  await page.keyboard.press('ArrowDown')
  await expect(tile(page, 'work-2')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(tile(page, 'work-3')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(tile(page, 'work-4')).toBeFocused() // the nearest place in the next lane
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Measure render time on large reports' })).toBeVisible()
})

test('a full lane shows five and keeps the rest one press away', async ({ page }) => {
  await page.goto(`${PAGE}?many=1`)
  const next = lane(page, 'Up next')
  await expect(next.locator('.task-tile')).toHaveCount(5)
  await next.getByRole('button', { name: 'Show 3 more' }).click()
  await expect(next.locator('.task-tile')).toHaveCount(8)
  await next.getByRole('button', { name: 'Show fewer' }).click()
  await expect(next.locator('.task-tile')).toHaveCount(5)
})

test('a proposed plan says so; a superseded one leaves the goal as it is without one', async ({ page }) => {
  await page.goto(`${PAGE}?proposed=1`)
  await expect(page.locator('.plan-next')).toContainText('Proposed')
  await page.goto(`${PAGE}?superseded=1`)
  await expect(page.locator('.board')).toHaveCount(0)
  await expect(page.locator('.goal .criteria li')).toHaveCount(2)
})

test('with less motion asked for, nothing on the board moves', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${PAGE}?viewer=davide`)
  expect(await tile(page, 'work-1').evaluate((t) => getComputedStyle(t).animationName)).toBe('none')
  expect(
    await tile(page, 'work-1')
      .locator('.activity-dot')
      .evaluate((d) => getComputedStyle(d, '::after').animationName),
  ).toBe('none')
  await tile(page, 'work-3').hover()
  await expect(board(page).locator('.thread-spark')).toBeHidden()
})

test('@phone · one lane under another, the goal’s actions under its words, nothing past the screen', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(board(page).locator('.task-tile')).toHaveCount(7)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  const a = await lane(page, 'In motion').boundingBox()
  const b = await lane(page, 'Up next').boundingBox()
  expect(b?.y ?? 0).toBeGreaterThan((a?.y ?? 0) + (a?.height ?? 0) - 1)
})
