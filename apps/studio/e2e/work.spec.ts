import { expect, test, type Locator, type Page } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

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
  // The page's clock moves as the check moves it: a busy machine can't stall it into a false failure.
  await page.clock.install()
  await page.goto(PAGE)
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000))
  const worker = tile(page, 'work-1')
  await expect(worker.locator('.task-tile-said')).toHaveText('Asked to run pnpm --filter @sophia/report test')
  const fresh = () =>
    worker.locator('.task-who').evaluate((w) => Number(getComputedStyle(w).getPropertyValue('--fresh')))
  const ago = await worker.locator('.task-tile-ago').innerText()
  const before = await fresh()
  await page.clock.runFor(3000)
  await expect(worker.locator('.task-tile-ago')).not.toHaveText(ago) // the clock runs
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
  // The page's first paint may be slow on a busy machine: wait for it as a press would, then check what it says.
  await expect(ask).toBeVisible({ timeout: 15_000 })
  await expect(ask).toContainText('expires in 2 h')
  const choices = ask.getByRole('group', { name: 'Your choice' }).getByRole('button')
  await choices.first().click()
  await expect(ask.getByRole('status')).toHaveText('Sent: Ship it now. It shows as decided once the lead records it.')
  await expect(choices.last()).toBeDisabled()
  expect(await page.evaluate(() => window.workFixture?.answered)).toEqual([
    { decision: 'd1', revision: 4, choice: 'ship' }, // the decision's own revision, not the plan's
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
  await expect(sheet.getByRole('button', { name: 'Davide’s Claude Code' })).toBeVisible() // a way to it in Resources
  await expect(sheet.locator('.task-sheet-name .muted')).toHaveText('worker')
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

test('an address names a task: it opens with its goal, and its sheet keeps the address while open', async ({
  page,
}) => {
  await page.goto(`${PAGE}?two=1#task-pane-copy`)
  // The task is on the second goal's board: the rail chose that goal, and the task's sheet opened with the page.
  await expect(page.getByRole('tab', { selected: true })).toContainText('pane')
  await expect(page.getByRole('dialog', { name: 'Word each state' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(new URL(page.url()).hash).toBe('') // closing takes it away
  await tile(page, 'pane-states').click()
  expect(new URL(page.url()).hash).toBe('#task-pane-states')
  // A link followed within the page opens its task, on its goal, over a goal chosen before.
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: /Reports export to PDF/ }).click()
  await page.evaluate(() => (window.location.hash = '#task-pane-copy'))
  await expect(page.getByRole('dialog', { name: 'Word each state' })).toBeVisible()
  await expect(page.getByRole('tab', { selected: true })).toContainText('pane')
  await page.keyboard.press('Escape')
  // A task on no board opens nothing, and the first goal stays.
  await page.goto(`${PAGE}?two=1#task-nowhere`)
  await page.reload() // only the fragment changed: the page opens again from it
  await expect(page.getByRole('tab', { selected: true })).toContainText('Reports export to PDF reliably')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('whoever does a task opens in Resources; nobody, or no way there, is only a name', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide#task-work-1`)
  const sheet = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await sheet.getByRole('button', { name: 'Davide’s Claude Code' }).click()
  await expect(page).toHaveURL(/\/resources\.html\?viewer=davide#resource-davide-claude$/)
  await expect(page.getByRole('dialog', { name: 'Davide · Claude Code' })).toBeVisible()
  await page.goto(`${PAGE}#task-work-4`) // nobody has it
  const nobody = page.getByRole('dialog', { name: 'Measure render time on large reports' })
  await expect(nobody).toBeVisible()
  await expect(nobody.locator('.task-who-link')).toHaveCount(0)
  await page.goto(`${PAGE}#task-work-3`)
  await page.reload() // only the fragment changed: the page opens again from it
  const person = page.getByRole('dialog', { name: 'Write the export’s release note' })
  await expect(person).toBeVisible() // a person, not a session: no resource to open
  await expect(person.locator('.task-who-link')).toHaveCount(0)
})

test('a task whose account runs short says so, and its sheet names where there is room', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&tight=1`)
  await expect(tile(page, 'work-1').locator('.task-tile-short')).toHaveText(/^Account out in ~3\d min$/)
  await expect(page.locator('[data-short]')).toHaveCount(1) // only the task its session is at
  await tile(page, 'work-1').click()
  const sheet = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await expect(sheet.locator('.task-sheet-short')).toHaveText(/^Its account runs out in ~3\d min\.$/)
  await expect(sheet.locator('.capacity-room')).toContainText('Your Codex has room: 5-hour at 42%')
  await sheet.getByRole('button', { name: 'Show' }).click()
  await expect(page).toHaveURL(/\/resources\.html\?viewer=davide&tight=1#resource-davide-codex$/)
  await expect(page.getByRole('dialog', { name: 'Davide · Codex' })).toBeVisible()
  // At its usual pace, nothing is said.
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(tile(page, 'work-1')).toBeVisible()
  await expect(page.locator('[data-short]')).toHaveCount(0)
})

test('a decision past its expiry is read, not answered, and calls no one', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&expired=1`)
  const pill = board(page).locator('.decision-pill')
  await expect(pill).toBeVisible({ timeout: 15_000 })
  // Not "for you": no amber call, and it doesn't open by itself onto choices that can't be pressed.
  await expect(pill).not.toHaveAttribute('data-mine')
  await pill.click()
  const ask = board(page).getByRole('region', { name: 'Davide decides' })
  await expect(ask).toContainText('expired')
  await expect(ask.getByRole('button')).toHaveCount(0)
  await expect(ask).toContainText('Ship it now  or  Wait for the review')
})

test('an answer not confirmed holds the other choice: only the same can be tried again', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&unknown=1`)
  const ask = board(page)
    .getByRole('region', { name: 'You decide' })
    .or(board(page).getByRole('region', { name: 'Davide decides' }))
  const choices = ask.getByRole('group', { name: 'Your choice' })
  await choices.getByRole('button', { name: 'Ship it now' }).click()
  await expect(ask.getByRole('status')).toHaveText('Not confirmed. Nothing is assumed: check before choosing again.')
  await expect(choices.getByRole('button', { name: 'Wait for the review' })).toBeDisabled()
  await expect(choices.getByRole('button', { name: 'Ship it now' })).toBeEnabled()
})

test('an answer not confirmed holds when the decisions close and open, and when another goal is chosen', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&unknown=1&two=1`)
  const ask = board(page).getByRole('region', { name: 'Davide decides' })
  const choices = ask.getByRole('group', { name: 'Your choice' })
  await choices.getByRole('button', { name: 'Ship it now' }).click()
  await expect(ask.getByRole('status')).toHaveText('Not confirmed. Nothing is assumed: check before choosing again.')
  const pill = board(page).locator('.decision-pill')
  await pill.click()
  await expect(ask).toHaveCount(0)
  await pill.click()
  await expect(ask.getByRole('status')).toHaveText('Not confirmed. Nothing is assumed: check before choosing again.')
  await expect(choices.getByRole('button', { name: 'Wait for the review' })).toBeDisabled()
  await page.getByRole('tab', { name: /The report pane says/ }).click()
  await page.getByRole('tab', { name: /Reports export to PDF/ }).click()
  // A new board: the decider's own decisions open by themselves, and the answer is still there.
  await expect(ask.getByRole('status')).toHaveText('Not confirmed. Nothing is assumed: check before choosing again.')
  await expect(choices.getByRole('button', { name: 'Wait for the review' })).toBeDisabled()
  await expect(choices.getByRole('button', { name: 'Ship it now' })).toBeEnabled()
})

test('a goal without a plan keeps its row beside the planned one', async ({ page }) => {
  await page.goto(`${PAGE}?unplanned=1`)
  await expect(page.locator('.board')).toBeVisible()
  await expect(page.locator('.goal').filter({ hasText: 'Exports keep their fonts' })).toBeVisible()
})

test('a guidance draft belongs to its task: the next task’s sheet starts empty', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide`)
  await page.evaluate(() => window.workFixture?.begin?.('work-1-review'))
  await tile(page, 'work-1').click()
  const sheet = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('For the retry only')
  await sheet.getByRole('button', { name: /Review the retry’s candidate/ }).click()
  const next = page.getByRole('dialog', { name: 'Review the retry’s candidate' })
  await expect(next.getByRole('textbox', { name: 'Guidance for its session' })).toHaveValue('')
})

test('Sophia’s answer is the latest question’s, even when an earlier one answers late', async ({ page }) => {
  await page.clock.install()
  await page.goto(`${PAGE}?viewer=davide&staggered=1`)
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000)) // time moves only as checked
  await tile(page, 'work-1').click()
  const sheet = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await sheet.getByRole('button', { name: 'Why is it waiting?' }).click()
  await sheet.getByRole('button', { name: 'What happens if I say yes?' }).click()
  // The second's answer at 0.9 s, the first's at 1.8 s, then every word written in: only the second's is said.
  await page.clock.runFor(3000)
  await expect(sheet.locator('.ask-a')).toContainText('It runs the report tests')
  await expect(sheet.locator('.ask-a')).not.toContainText('waiting for a permission')
})

test('a new plan for the goal reads its own last look, never the old plan’s', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&since=1`)
  await expect(board(page).locator('.board-return')).toBeVisible()
  await page.evaluate(() => window.workFixture?.replan?.())
  await expect(board(page).locator('.board-return')).toHaveCount(0)
  await expect(board(page).locator('.task-tile[data-changed]')).toHaveCount(0)
})

test('a followed address opens its task even when the search hides its goal', async ({ page }) => {
  await page.goto(`${PAGE}?two=1`)
  await page.getByRole('searchbox').fill('PDF retry')
  await expect(page.getByRole('tab')).toHaveCount(0) // one goal answers
  await page.evaluate(() => (window.location.hash = '#task-pane-copy'))
  await expect(page.getByRole('dialog', { name: 'Word each state' })).toBeVisible()
})

test('a followed address whose plan arrives later still opens its task, the search giving way', async ({ page }) => {
  await page.goto(`${PAGE}?two=1&later=1`)
  await page.getByRole('searchbox').fill('PDF retry')
  await page.evaluate(() => (window.location.hash = '#task-pane-copy'))
  // The address is followed and drawn before its plan arrives, not in the same render.
  await page.evaluate(() => new Promise(requestAnimationFrame))
  await page.evaluate(() => new Promise(requestAnimationFrame))
  await page.evaluate(() => window.workFixture?.arrive?.())
  await expect(page.getByRole('dialog', { name: 'Word each state' })).toBeVisible()
  await expect(page.getByRole('searchbox')).toHaveValue('')
})

test('an address the page opens with waits for its plan too, the search giving way', async ({ page }) => {
  await page.goto(`${PAGE}?two=1&later=1#task-pane-copy`)
  await page.getByRole('searchbox').fill('PDF retry')
  await page.evaluate(() => new Promise(requestAnimationFrame))
  await page.evaluate(() => window.workFixture?.arrive?.())
  await expect(page.getByRole('dialog', { name: 'Word each state' })).toBeVisible()
  await expect(page.getByRole('searchbox')).toHaveValue('')
})

test('“What happens if I say yes?” is asked only by the one the request waits on', async ({ page }) => {
  await page.goto(PAGE) // Luis: the request waits on Davide
  await tile(page, 'work-1').click()
  const sheet = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await expect(sheet.getByRole('button', { name: 'Why is it waiting?' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'What happens if I say yes?' })).toHaveCount(0)
})

test('a search that a goal without a plan answers says nothing is missing', async ({ page }) => {
  await page.goto(`${PAGE}?unplanned=1`)
  await page.getByRole('searchbox').fill('fonts')
  await expect(page.locator('.goal').filter({ hasText: 'Exports keep their fonts' })).toBeVisible()
  await expect(page.getByText(/No goal or task answers/)).toHaveCount(0)
})

test('type · the board, a goal without a plan, and a task’s sheet keep to the scale', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&tight=1&unplanned=1`)
  await expect(tile(page, 'work-1')).toBeVisible()
  await expect(page.locator('.goal').filter({ hasText: 'Exports keep their fonts' })).toBeVisible()
  const onBoard = await typeSizes(page, '.goals')
  expect(onBoard, onBoard.join(' ')).toEqual(['10.5px', '12px', '13px', '14px', '20px'])
  await tile(page, 'work-1').click()
  const sheet = await typeSizes(page, '.task-sheet')
  expect(
    sheet.filter((s) => !['10.5px', '12px', '13px', '14px'].includes(s)),
    sheet.join(' '),
  ).toEqual([])
})

// ---- Its progress review (LFE-07.2): asked with the goal's Request review, said on the goal's quiet line. ----

const requestReview = (page: Page) => page.getByRole('button', { name: /^Request review/ })
const reviewLine = (page: Page) => page.locator('.plan-next-review')
const commandsOf = (page: Page) => page.evaluate(() => window.workFixture?.commands ?? [])

/** The page with its clock held: time moves only as a check moves it. */
async function heldAt(page: Page, query: string) {
  await page.clock.install()
  await page.goto(`${PAGE}${query}`)
  await expect(requestReview(page)).toBeVisible({ timeout: 15_000 })
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000))
}

test('review · asked, the goal’s line says the lead is reviewing; a routine end is said only on that line', async ({
  page,
}) => {
  await heldAt(page, '?')
  await expect(reviewLine(page)).toHaveCount(0) // nothing before the first review
  await requestReview(page).click()
  // Its own receipt is Request review's: sent, never done.
  await expect(page.locator('.controls .outcome')).toContainText('Sent')
  await expect(reviewLine(page)).toHaveText(/^The lead is reviewing · asked by you \d+ s ago$/)
  await expect(reviewLine(page).locator('.activity-dot')).toBeVisible()
  await page.clock.runFor(2100)
  await expect(reviewLine(page)).toHaveText(/^Reviewed \d+ s ago · no change$/)
  // PLAN-04: nothing announced, beyond the request's own receipt.
  await expect(page.getByRole('status').filter({ hasText: /Reviewed|no change|reviewing/ })).toHaveCount(0)
  expect(await commandsOf(page)).toEqual([{ kind: 'request_review', key: expect.any(String) }])
})

test('review · not enough to tell is said on the same quiet line, with what the lead waits for', async ({ page }) => {
  await heldAt(page, '?review=insufficient')
  await requestReview(page).click()
  await page.clock.runFor(2100)
  await expect(reviewLine(page)).toHaveText(/· not enough to tell until the retry passes the export tests$/)
})

test('review · one that didn’t finish is said so', async ({ page }) => {
  await heldAt(page, '?review=failed')
  await requestReview(page).click()
  await page.clock.runFor(2100)
  await expect(reviewLine(page)).toHaveText('The last review didn’t finish')
})

test('review · PLAN-01: asked while one runs, it joins it: still the one review, its asker named', async ({ page }) => {
  await heldAt(page, '?review=running')
  await expect(reviewLine(page)).toHaveText('The lead is reviewing · asked by Davide 3 min ago')
  await requestReview(page).click()
  await expect.poll(() => commandsOf(page)).toHaveLength(1)
  await page.clock.runFor(2100)
  await expect(reviewLine(page)).toHaveText(/^The lead is reviewing · asked by Davide \d+ min ago$/)
})

test('review · a scheduled review says so', async ({ page }) => {
  await heldAt(page, '?review=scheduled')
  await expect(reviewLine(page)).toHaveText('The lead is reviewing · scheduled')
})

test('review · one of the plan’s previous revision says which', async ({ page }) => {
  await heldAt(page, '?review=old')
  await expect(reviewLine(page)).toHaveText('The lead is reviewing · asked by Davide 3 min ago · of r1')
})

test('review · unfunded, it waits and names who can extend the allowance', async ({ page }) => {
  await heldAt(page, '?review=awaiting')
  await expect(reviewLine(page)).toHaveText('Awaiting review: the project’s allowance is spent. Davide can extend it.')
  await expect(reviewLine(page)).toHaveAttribute('data-kind', 'awaiting')
})

test('review · the lead reviewing pings, and is still under reduced motion', async ({ page }) => {
  const ping = () =>
    reviewLine(page)
      .locator('.activity-dot')
      .evaluate((d) => getComputedStyle(d, '::after').animationName)
  await heldAt(page, '?review=running')
  expect(await ping()).not.toBe('none')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await ping()).toBe('none')
})

test('@phone · review: the goal’s line wraps whole, nothing past the screen', async ({ page }) => {
  await heldAt(page, '?review=awaiting')
  await expect(reviewLine(page)).toBeVisible()
  const box = await reviewLine(page).boundingBox()
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0)
})

// ---- The lead's review that proposes a change (LFE-07.2, slice 2): its pill, and its card in the decisions' slot. ----

const reviewPill = (page: Page) => board(page).getByRole('button', { name: /^Review · a change proposed/ })
const reviewCard = (page: Page) => board(page).getByRole('region', { name: 'The lead’s review' })

test('review card · a change proposed waits as a pill; its card reads in four parts, each seen with its evidence', async ({
  page,
}) => {
  await page.goto(`${PAGE}?review=material`)
  await expect(reviewPill(page)).toBeVisible({ timeout: 15_000 })
  await expect(reviewCard(page)).toHaveCount(0) // a pill, not an interruption
  await reviewPill(page).click()
  await expect(reviewPill(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(reviewCard(page)).toBeFocused()
  for (const part of ['Observed', 'Reading', 'Unsure', 'Proposed']) {
    await expect(reviewCard(page).locator('.review-part .field-label', { hasText: part })).toBeVisible()
  }
  const seen = reviewCard(page).locator('.review-seen')
  await expect(seen).toHaveCount(2)
  await expect(seen.first().locator('.review-evidence')).toHaveText('Check · 6 min ago')
  await expect(seen.first().locator('.review-evidence-ref')).toHaveText('pnpm --filter @sophia/report test')
  await expect(seen.nth(1).locator('.review-evidence')).toHaveText('Log · 9 min ago')
  await expect(page.locator('.plan-next-review')).toHaveText(/^Reviewed 4 min ago · a change proposed$/)
})

test('review card · a routine end has no pill and no card (PLAN-04)', async ({ page }) => {
  await page.goto(PAGE)
  await expect(board(page)).toBeVisible({ timeout: 15_000 })
  await expect(reviewPill(page)).toHaveCount(0)
  await expect(reviewCard(page)).toHaveCount(0)
})

test('review card · a task it names opens that task’s sheet', async ({ page }) => {
  await page.goto(`${PAGE}?review=material`)
  await reviewPill(page).click()
  await reviewCard(page).getByRole('button', { name: 'Implement the PDF retry' }).click()
  await expect(page.getByRole('dialog', { name: 'Implement the PDF retry' })).toBeVisible()
})

test('review card · Escape or Close puts it away, the focus back on its pill', async ({ page }) => {
  await page.goto(`${PAGE}?review=material`)
  await reviewPill(page).click()
  await expect(reviewCard(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(reviewCard(page)).toHaveCount(0)
  await expect(reviewPill(page)).toBeFocused()
  await expect(reviewPill(page)).toHaveAttribute('aria-expanded', 'false')
  await reviewPill(page).click()
  await reviewCard(page).getByRole('button', { name: 'Close' }).click()
  await expect(reviewCard(page)).toHaveCount(0)
  await expect(reviewPill(page)).toBeFocused()
})

test('review card · a later review comes closed: the card opened was the last one’s', async ({ page }) => {
  await page.goto(`${PAGE}?review=material`)
  await reviewPill(page).click()
  await expect(reviewCard(page)).toBeVisible()
  await page.evaluate(() => window.workFixture?.reviewAgain?.())
  await expect(reviewCard(page)).toHaveCount(0)
  await expect(reviewPill(page)).toHaveAttribute('aria-expanded', 'false')
})

test('review card · a decision whose id holds quotes and brackets still opens with the focus on it', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&review=material&odd-id=1`)
  await reviewPill(page).click()
  await reviewCard(page).getByRole('button', { name: 'Waits on your decision: answer it' }).click()
  const ask = board(page).getByRole('region', { name: 'Davide decides' })
  await expect(ask.getByRole('button', { name: 'Ship it now' })).toBeFocused()
})

test('review card · replaced by a later review, it closes and the focus goes back to the pill', async ({ page }) => {
  await page.goto(`${PAGE}?review=material`)
  await reviewPill(page).click()
  await expect(reviewCard(page)).toBeFocused()
  await page.evaluate(() => window.workFixture?.reviewAgain?.())
  await expect(reviewCard(page)).toHaveCount(0)
  await expect(reviewPill(page)).toBeFocused()
})

test('review card · a decision past its expiry is said expired, to its decider and to anyone', async ({ page }) => {
  // By its date while still proposed, and as the server marks it (state: expired).
  for (const [viewer, expired] of [
    ['davide', '1'],
    ['luis', '1'],
    ['davide', 'state'],
  ]) {
    await page.goto(`${PAGE}?viewer=${viewer}&review=material&expired=${expired}`)
    await reviewPill(page).click()
    await expect(reviewCard(page)).toContainText('Its decision expired before it was answered.')
    await expect(reviewCard(page)).not.toContainText('Waits on')
  }
})

test('review card · a proposal the lead already sent says so, and asks nothing', async ({ page }) => {
  await page.goto(`${PAGE}?review=material-sent`)
  await reviewPill(page).click()
  await expect(reviewCard(page)).toContainText('The lead sent it, within its own authority.')
  await expect(reviewCard(page).getByRole('button', { name: /answer it/ })).toHaveCount(0)
})

test('review card · a proposal waiting on someone else’s decision names them, with nothing to press', async ({
  page,
}) => {
  await page.goto(`${PAGE}?review=material`) // Luis; the decision is Davide's
  await reviewPill(page).click()
  await expect(reviewCard(page)).toContainText('Waits on Davide’s decision.')
  await expect(reviewCard(page).getByRole('button', { name: /answer it/ })).toHaveCount(0)
})

test('review card · one slot: the card and the decisions take turns; its proposal points to the decision', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&review=material`)
  const ask = board(page).getByRole('region', { name: 'Davide decides' })
  await expect(ask).toBeVisible({ timeout: 15_000 }) // the decider's own opens by itself
  await reviewPill(page).click()
  await expect(reviewCard(page)).toBeVisible()
  await expect(ask).toHaveCount(0)
  await reviewCard(page).getByRole('button', { name: 'Waits on your decision: answer it' }).click()
  await expect(ask).toBeVisible()
  await expect(reviewCard(page)).toHaveCount(0)
  await expect(ask.getByRole('button', { name: 'Ship it now' })).toBeFocused()
})

test('review card · of an earlier revision it says so, and its proposal is read, not acted on', async ({ page }) => {
  await page.goto(`${PAGE}?review=material-old`)
  await expect(page.locator('.plan-next-review')).toHaveText(/· a change proposed · of r1$/)
  await reviewPill(page).click()
  await expect(reviewCard(page).locator('.review-result-stale')).toHaveText('Reviewed r1 · the plan is now r2')
  await expect(reviewCard(page).getByRole('button', { name: /answer it/ })).toHaveCount(0)
})

test('review card · its parts start on one column, the links where their words start', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&review=material`) // Davide decides: the link to his decision shows
  await reviewPill(page).click()
  // Where the words start, not the boxes: a stretched button keeps its box aligned and centres its words.
  const lefts = await reviewCard(page).evaluate((card) => {
    const part = (label: string) =>
      [...card.querySelectorAll('.review-part')].find((p) => p.querySelector('.field-label')?.textContent === label)
    // Reading's words, Proposed's, its link's, and each Observed line's evidence.
    const starts = [
      part('Reading')?.querySelector('p'),
      part('Proposed')?.querySelector('p'),
      part('Proposed')?.querySelector('button'),
      ...card.querySelectorAll('.review-evidence'),
    ]
    return starts.map((el) => {
      const range = document.createRange()
      if (el) range.selectNodeContents(el)
      return Math.round(range.getClientRects()[0]?.left ?? -1)
    })
  })
  expect(lefts).toHaveLength(5)
  expect(new Set(lefts).size, lefts.join(' ')).toBe(1)
})

test('review card · keeps to the type scale', async ({ page }) => {
  await page.goto(`${PAGE}?review=material`)
  await reviewPill(page).click()
  const sizes = await typeSizes(page, '.review-result')
  expect(
    sizes.filter((s) => !['10.5px', '12px', '13px', '14px'].includes(s)),
    sizes.join(' '),
  ).toEqual([])
})

test('@phone · review card: its parts stack, nothing past the screen', async ({ page }) => {
  await page.goto(`${PAGE}?review=material`)
  await reviewPill(page).click()
  await expect(reviewCard(page)).toBeVisible()
  const wide = await reviewCard(page).evaluate((c) => c.scrollWidth <= c.clientWidth + 1)
  expect(wide).toBe(true)
  // Each part's label sits above its words, not beside them.
  const stacked = await reviewCard(page).evaluate((c) =>
    [...c.querySelectorAll('.review-part')].every(
      (p) =>
        (p.querySelector('.field-label')?.getBoundingClientRect().bottom ?? 0) <=
        (p.querySelector('.review-part-body')?.getBoundingClientRect().top ?? 0) + 1,
    ),
  )
  expect(stacked).toBe(true)
  const box = await reviewCard(page).boundingBox()
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0)
})

// ---- Challenge (LFE-07.2, slice 3): why a proposal doesn't hold, sent to the lead for its next review. ----

const challengeField = (page: Page) => reviewCard(page).getByRole('textbox', { name: 'Why the proposal doesn’t hold' })
const challengesOf = (page: Page) => page.evaluate(() => window.workFixture?.challenges ?? [])

test('challenge · its reason goes to the lead; the receipt is said, the reason quoted', async ({ page }) => {
  await page.goto(`${PAGE}?review=material`)
  await reviewPill(page).click()
  await reviewCard(page).getByRole('button', { name: 'Challenge' }).click()
  await expect(challengeField(page)).toBeFocused()
  await expect(reviewCard(page).getByRole('button', { name: 'Send' })).toBeDisabled() // nothing to send yet
  await challengeField(page).fill('The renderer’s host is shared with the exports.')
  await reviewCard(page).getByRole('button', { name: 'Send' }).click()
  await expect(reviewCard(page).getByRole('status')).toHaveText('Sending your challenge…')
  await expect(challengeField(page)).toBeFocused() // Send is disabled while it goes: the focus stays in the line
  await expect(reviewCard(page).getByRole('status')).toHaveText('Sent to the lead, for its next review.')
  await expect(reviewCard(page).locator('.review-challenge-quote')).toHaveText(
    'The renderer’s host is shared with the exports.',
  )
  // Settled, the focus is on its receipt, not lost to the page.
  await expect(reviewCard(page).locator('.review-challenge')).toBeFocused()
  expect(await challengesOf(page)).toEqual([
    { review: 'review-material', text: 'The renderer’s host is shared with the exports.', key: expect.any(String) },
  ])
})

test('challenge · not confirmed, it is sent again with the same key and the same words, the card closed meanwhile', async ({
  page,
}) => {
  await page.goto(`${PAGE}?review=material&challenge=unknown`)
  await reviewPill(page).click()
  await reviewCard(page).getByRole('button', { name: 'Challenge' }).click()
  await challengeField(page).fill('The large reports are rare.')
  await reviewCard(page).getByRole('button', { name: 'Send' }).click()
  await expect(reviewCard(page).getByRole('status')).toHaveText(
    'Not confirmed. Sending again repeats the same request.',
  )
  await expect(challengeField(page)).toHaveAttribute('readonly', '')
  await reviewCard(page).getByRole('button', { name: 'Close' }).click()
  await reviewPill(page).click()
  await expect(challengeField(page)).toHaveValue('The large reports are rare.') // kept, open by itself
  await reviewCard(page).getByRole('button', { name: 'Send again' }).click()
  await expect(reviewCard(page).getByRole('status')).toHaveText('Sent to the lead, for its next review.')
  const sent = await challengesOf(page)
  expect(sent).toHaveLength(2)
  expect(sent[1]?.key).toBe(sent[0]?.key)
  expect(sent[1]?.text).toBe(sent[0]?.text)
})

test('challenge · refused, it says who can', async ({ page }) => {
  await page.goto(`${PAGE}?review=material&challenge=denied`)
  await reviewPill(page).click()
  await reviewCard(page).getByRole('button', { name: 'Challenge' }).click()
  await challengeField(page).fill('Measure first, then decide.')
  await reviewCard(page).getByRole('button', { name: 'Send' }).click()
  await expect(reviewCard(page).getByRole('status')).toHaveText('Only editors and admins can challenge a review.')
  // Settled: its receipt and its words, no line left to press in vain.
  await expect(challengeField(page)).toHaveCount(0)
  await expect(reviewCard(page).getByRole('button', { name: /^Send/ })).toHaveCount(0)
  await expect(reviewCard(page).getByRole('button', { name: 'Challenge' })).toHaveCount(0)
})

test('challenge · Escape in its line closes the line, not the card; a draft is kept', async ({ page }) => {
  await page.goto(`${PAGE}?review=material`)
  await reviewPill(page).click()
  await reviewCard(page).getByRole('button', { name: 'Challenge' }).click()
  await challengeField(page).fill('Half a thought')
  await page.keyboard.press('Escape')
  await expect(reviewCard(page)).toBeVisible()
  await expect(challengeField(page)).toHaveCount(0)
  // The focus goes back to Challenge, so a second Escape closes the card.
  await expect(reviewCard(page).getByRole('button', { name: 'Challenge' })).toBeFocused()
  await reviewCard(page).getByRole('button', { name: 'Close' }).click()
  await reviewPill(page).click()
  await expect(challengeField(page)).toHaveValue('Half a thought')
})

test('challenge · none for a viewer who can’t act, nor on a review of an earlier revision', async ({ page }) => {
  await page.goto(`${PAGE}?review=material&editor=0`)
  await reviewPill(page).click()
  await expect(reviewCard(page)).toBeVisible()
  await expect(reviewCard(page).getByRole('button', { name: 'Challenge' })).toHaveCount(0)
  await page.goto(`${PAGE}?review=material-old`)
  await reviewPill(page).click()
  await expect(reviewCard(page)).toBeVisible()
  await expect(reviewCard(page).getByRole('button', { name: 'Challenge' })).toHaveCount(0)
})

// ---- One live region per receipt (Codex P2 on #79): the same node says each step, so a screen reader hears the end. ----

/** Marks a node in the page, to tell later whether it is still the same one. */
const mark = (locator: Locator) => locator.evaluate((el) => el.setAttribute('data-checked-node', 'same'))

test('receipts · a decision’s steps are said by one status that stays, empty before', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const ask = board(page).getByRole('region', { name: 'Davide decides' })
  await expect(ask).toBeVisible({ timeout: 15_000 })
  const said = ask.locator('[role="status"]')
  await expect(said).toHaveText('')
  await mark(said)
  await ask.getByRole('button', { name: 'Ship it now' }).click()
  await expect(said).toHaveText(/^Sent: Ship it now/)
  await expect(said).toHaveAttribute('data-checked-node', 'same')
})

test('receipts · a challenge’s steps, sending to recorded, are said by one status that stays', async ({ page }) => {
  await page.goto(`${PAGE}?review=material`)
  await reviewPill(page).click()
  // Marked before the line opens: opening it must not replace the status either.
  const said = reviewCard(page).locator('.review-challenge [role="status"]')
  await expect(said).toHaveText('')
  await mark(said)
  await reviewCard(page).getByRole('button', { name: 'Challenge' }).click()
  await challengeField(page).fill('The large reports are rare.')
  await reviewCard(page).getByRole('button', { name: 'Send' }).click()
  await expect(said).toHaveText('Sending your challenge…')
  await expect(said).toHaveText('Sent to the lead, for its next review.')
  await expect(said).toHaveAttribute('data-checked-node', 'same')
})
