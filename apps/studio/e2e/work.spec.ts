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
  // WBC-01: Active, Up next, Unassigned, Complete. A finished run waiting for its check is Active, not done.
  expect(await titles(lane(page, 'Active'))).toEqual([
    'Implement the PDF retry',
    'Write the retry’s failing test',
    'Review the report pane',
  ])
  expect(await titles(lane(page, 'Up next'))).toEqual([
    'Review the retry’s candidate',
    'Write the export’s release note',
  ])
  expect(await titles(lane(page, 'Unassigned'))).toEqual(['Measure render time on large reports'])
  expect(await titles(lane(page, 'Complete'))).toEqual(['Reproduce the failed render'])
  await expect(tile(page, 'work-1').locator('.task-chip')).toHaveText('Waiting on Davide')
  await expect(tile(page, 'work-2').locator('.task-chip')).toHaveText('Working')
  await expect(lane(page, 'Up next').locator('.task-chip')).toHaveCount(0)
  await expect(tile(page, 'work-0b').locator('.task-chip')).toHaveText('Ready for review') // finished isn't accepted
  await expect(lane(page, 'Complete').locator('.task-chip')).toHaveCount(0) // the lane says it
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
  await lens('Unassigned').click()
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
  await expect(ask.getByRole('status')).toHaveText('Your choice is recorded. The plan is updating.')
  await expect(choices.last()).toBeDisabled()
  const [answer] = (await page.evaluate(() => window.workFixture?.answered)) ?? []
  // The decision's own revision, not the plan's, bound to the work and plan revision it is about, as one operation.
  expect(answer).toMatchObject({ decision_id: 'd1', revision: 4, choice: 'ship', work_id: 'work-1', plan_id: 'plan-1' })
  expect(answer?.plan_revision).toBe(2)
  expect(answer?.operation_id).toMatch(/^[\w-]{8,}$/)
  // The service records the choice; the plan takes it in later, a separate state (UI-14).
  await page.evaluate(() => window.workFixture?.settle?.('d1'))
  await expect(board(page).locator('.decision-pill')).toHaveCount(0)
  await expect(board(page).locator('.board-decided')).toContainText('Your choice is recorded. The plan is updating.')
  await expect(page.locator('.plan-next')).toContainText('r2')
  await page.evaluate(() => window.workFixture?.react?.('d1'))
  await expect(board(page).locator('.board-decided')).toHaveCount(0)
  await expect(page.locator('.plan-next')).toContainText('r3')
  await board(page).getByRole('button', { name: '2 assumed · 2 decided' }).click()
  await expect(board(page).getByRole('list', { name: 'Decided' })).toContainText('Davide chose Ship it now')
})

test('an answer to a decision that changed is refused, said so, and can be given again', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&conflict=1`)
  const ask = board(page).getByRole('region', { name: 'Davide decides' })
  await ask.getByRole('button', { name: 'Wait for the review' }).click()
  await expect(ask.getByRole('status')).toHaveText(
    'This decision changed. Nothing was chosen; review the current choices.',
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

test('acting from the sheet: each step said as observed; a builder within the mandate, a viewer not at all', async ({
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
  await expect(steps).toContainText('Delivered to the session; not yet verified in the result.')
  await sheet.getByRole('button', { name: 'Stop', exact: true }).click()
  // WBC-01: Stop promises nothing it can't see.
  await expect(sheet.getByRole('group', { name: 'Stop' })).toContainText(
    'Stop this task? Completed work is kept. Running actions may need time to stop.',
  )
  // Luis builds: he may guide Davide's session within Davide's mandate, and is told so (UI-08).
  await page.goto(PAGE)
  await tile(page, 'work-1').click()
  const luis = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await expect(luis.getByRole('textbox', { name: 'Guidance for its session' })).toBeVisible()
  await expect(luis.locator('.act-boundary')).toHaveText('Within Davide’s contribution to this project.')
  // Mara reads: nothing to send, and why.
  await page.goto(`${PAGE}?viewer=mara`)
  await tile(page, 'work-1').click()
  const mara = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await expect(mara.getByRole('textbox', { name: 'Guidance for its session' })).toHaveCount(0)
  await expect(mara.locator('.act-note')).toHaveText(
    'Guidance, Hold and Stop: Viewers ask and read; they don’t retask.',
  )
  await expect(mara.getByRole('button', { name: 'Why is it waiting?' })).toBeVisible() // she can still ask
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
  await expect(tile(page, 'work-0b')).toBeFocused()
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
  const a = await lane(page, 'Active').boundingBox()
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
  await expect(ask.getByRole('status')).toHaveText(
    'Checking whether your choice was recorded. Do not choose again yet.',
  )
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
  await expect(ask.getByRole('status')).toHaveText(
    'Checking whether your choice was recorded. Do not choose again yet.',
  )
  const pill = board(page).locator('.decision-pill')
  await pill.click()
  await expect(ask).toHaveCount(0)
  await pill.click()
  await expect(ask.getByRole('status')).toHaveText(
    'Checking whether your choice was recorded. Do not choose again yet.',
  )
  await expect(choices.getByRole('button', { name: 'Wait for the review' })).toBeDisabled()
  await page.getByRole('tab', { name: /The report pane says/ }).click()
  await page.getByRole('tab', { name: /Reports export to PDF/ }).click()
  // A new board: the decider's own decisions open by themselves, and the answer is still there.
  await expect(ask.getByRole('status')).toHaveText(
    'Checking whether your choice was recorded. Do not choose again yet.',
  )
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

// ---- WBC-01: the board read from a `sophia.work.board.v1` view (fixtures/work-data.ts, work-cases.ts), its UI cases
// on the real board. Fixture evidence only: no service, runtime or conversation is behind any of them. ----

const sheetOf = (page: Page, name: string) => page.getByRole('dialog', { name })
async function openTask(page: Page, id: string, name: string) {
  await tile(page, id).click()
  const sheet = sheetOf(page, name)
  await expect(sheet).toBeVisible()
  return sheet
}
const commanded = (page: Page) => page.evaluate(() => window.workFixture?.commands ?? [])
/** Moves the page's clock on from a pause, so delays elapse only as a check says. */
async function paused(page: Page, url: string) {
  await page.clock.install()
  await page.goto(url)
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000))
}

test('wbc · UI-01 · loops of parents or blockers show each task once and say the plan doesn’t hold', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=cycle`)
  const notice = board(page).locator('.board-notice')
  await expect(notice).toContainText('Some tasks are grouped in a loop')
  await expect(notice).toContainText('Some tasks wait on each other in a loop')
  for (const id of ['loop-a', 'loop-b', 'wait-a', 'wait-b']) await expect(tile(page, id)).toHaveCount(1)
  await page.goto(`${PAGE}?case=deep`) // three levels: the retry, its review, the review's notes
  expect(await titles(lane(page, 'Up next'))).toEqual([
    'Review the retry’s candidate',
    'Note what the review found',
    'Write the export’s release note',
  ])
  await page.goto(`${PAGE}?case=orphan`) // its parent isn't in the plan: it stands alone, once
  await expect(tile(page, 'stray')).toHaveCount(1)
  await expect(board(page).locator('.board-notice')).toHaveCount(0)
})

test('wbc · UI-02 · the same session’s next attempt: the old report isn’t its state; commands go to the new one', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=attempts`)
  await expect(tile(page, 'work-1').locator('.task-tile-said')).toHaveCount(0)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await expect(sheet.locator('.task-sheet-activity')).toHaveText('Its last report is from an earlier attempt.')
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Only the current attempt')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await expect
    .poll(async () => (await commanded(page))[0]?.target)
    .toMatchObject({
      work_id: 'work-1',
      assignment_id: 'assignment-claude-worker',
      assignment_generation: 4,
      attempt_id: 'attempt-claude-worker-4',
    })
})

test('wbc · UI-03 · a proposed replacement sits beside the accepted plan, compared, running nothing', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=replan`)
  await expect(page.locator('.plan-next')).toContainText('r2')
  await expect(page.locator('.plan-next')).toContainText('r3 proposed')
  await expect(tile(page, 'work-4')).toBeVisible() // the accepted plan stays the board
  await expect(tile(page, 'work-6')).toHaveCount(0)
  const band = board(page).getByRole('button', { name: /Plan r3, not accepted yet/ })
  await expect(band).toContainText('1 added · 1 changed · 1 removed')
  await band.click()
  const changes = board(page).getByRole('list', { name: 'What plan r3 changes' })
  await expect(changes).toContainText('Added Retry renders on a second host')
  await expect(changes).toContainText('Changed Write the export’s release note · what it waits on')
  await expect(changes).toContainText('Removed Measure render time on large reports')
  // A plan proposed with none accepted is read, never operated.
  await page.goto(`${PAGE}?two=1#task-pane-states`)
  const sheet = sheetOf(page, 'Draw the export’s states in the pane')
  await expect(sheet).toContainText('proposed, not accepted yet')
  await expect(sheet.getByRole('heading', { name: 'Act on it' })).toHaveCount(0)
  await expect(sheet.getByRole('heading', { name: 'Ask Sophia' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(board(page).locator('.board-notice')).toHaveText('Proposed, not accepted yet: nothing in it runs.')
})

test('wbc · UI-04 · a review that found defects is complete; the work it reviewed needs changes', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&case=defects`)
  expect(await titles(lane(page, 'Complete'))).toContain('Review the retry’s candidate')
  expect(await titles(lane(page, 'Active'))).toContain('Implement the PDF retry')
  await expect(tile(page, 'work-1').locator('.task-chip')).toHaveText('Changes needed')
  const sheet = await openTask(page, 'work-1-review', 'Review the retry’s candidate')
  await sheet.getByRole('button', { name: 'Open result' }).click()
  await expect(sheet.locator('.task-result-text')).toContainText('Changes needed before it ships.')
  await expect(sheet.locator('.task-result-text figcaption')).toContainText('Simulated source')
})

test('wbc · UI-05 · a check that passed for v1 says nothing of v2: the task stays active, ready for review', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=stale-pass`)
  await expect(tile(page, 'work-1').locator('.task-chip')).toHaveText('Ready for review')
  expect(await titles(lane(page, 'Complete'))).not.toContain('Implement the PDF retry')
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await expect(sheet.locator('.task-result-review')).toHaveText('Review passed for retry-v1, not this version')
  await expect(sheet.locator('.task-result-version').first()).toContainText('retry-v2')
  await expect(sheet.getByRole('button', { name: 'Review candidate' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Open earlier result' }).click()
  await expect(sheet.locator('.task-result-text')).toContainText('Retry v1')
})

test('wbc · UI-06 · stopped, cancelled and failed work is closed with why, never done; its repair stays active', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=closed`)
  const closed = board(page).getByRole('region', { name: 'Closed work' })
  const toggle = closed.getByRole('button', { name: /^Closed work/ })
  await expect(toggle).toContainText('3')
  expect(await titles(lane(page, 'Complete'))).toEqual(['Reproduce the failed render'])
  expect(await titles(lane(page, 'Active'))).toContain('Repair the large-report render')
  await toggle.click()
  await expect(closed.locator('.task-link-where')).toHaveText([
    'Stopped · By Davide: the pane’s spec changed.',
    'Cancelled · Measuring waits for the new renderer.',
    'Failed · The renderer crashed on a 40 MB report.',
  ])
  await closed.getByRole('button', { name: /Render the large-report sample/ }).click()
  await expect(sheetOf(page, 'Render the large-report sample').locator('.task-sheet-closed')).toContainText(
    'The renderer crashed on a 40 MB report.',
  )
})

test('wbc · UI-07 · work on Luis’s resource waits on Davide’s decision and on Luis’s own permission', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=luis-resource`)
  await expect(tile(page, 'work-config').locator('.task-chip')).toHaveText('Waiting on you')
  await board(page)
    .getByRole('radio', { name: /^For you/ })
    .click()
  await expect(tile(page, 'work-config')).not.toHaveAttribute('data-dim')
  await expect(tile(page, 'work-2')).toHaveAttribute('data-dim', 'true') // his account runs it; nothing asks him
  const sheet = await openTask(page, 'work-config', 'Write the export’s retry config')
  const waits = sheet.locator('.task-waits li')
  await expect(waits.nth(0)).toContainText('Choose the retry limit before it writes the config.')
  await expect(waits.nth(0).locator('.task-wait-who')).toHaveText('You answer it')
  await expect(waits.nth(1)).toContainText('Allow editing config/export.json')
  await expect(waits.nth(1).locator('.task-wait-who')).toHaveText('Luis answers it')
  await page.goto(`${PAGE}?viewer=luis&case=luis-resource`)
  await expect(tile(page, 'work-config').locator('.task-chip')).toHaveText('Waiting on you') // his own permission
  await page.goto(`${PAGE}?viewer=mara&case=luis-resource`)
  await expect(tile(page, 'work-config').locator('.task-chip')).toHaveText('Waiting on Davide')
})

test('wbc · UI-08 · a builder guides within the owner’s mandate; the native permission stays the owner’s', async ({
  page,
}) => {
  await page.goto(PAGE) // Luis
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await expect(sheet.locator('.task-wait-who')).toHaveText('Davide answers it')
  await expect(sheet.getByRole('button', { name: /allow|approve|permission|reserve/i })).toHaveCount(0)
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging fixtures')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(sheet.locator('.act-steps')).toContainText('Guidance recorded; delivery pending.')
  const sent = await commanded(page)
  expect(sent.map((c) => [c.kind, c.target.work_id, c.target.assignment_generation])).toEqual([
    ['guidance', 'work-1', 3],
  ])
})

test('wbc · UI-09 · a slow admission stays Sending: nothing is said recorded before its receipt', async ({ page }) => {
  await paused(page, `${PAGE}?viewer=davide&admission=slow`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging fixtures')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  const steps = sheet.locator('.act-steps')
  await page.clock.runFor(6500)
  await expect(steps).toContainText('Sending…')
  await expect(steps.locator('li[data-reached]')).toHaveCount(0)
  await page.clock.runFor(1000)
  await expect(steps).toContainText('Guidance recorded; delivery pending.')
})

test('wbc · UI-09 · a lost reply is unknown, tried again with the same operation; a refusal sent nothing', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost`)
  let sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  const field = sheet.getByRole('textbox', { name: 'Guidance for its session' })
  await field.fill('Use the staging fixtures')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  const steps = sheet.locator('.act-steps')
  await expect(steps).toContainText('Not confirmed whether it was recorded. Try again: it reuses the same request.')
  await expect(field).toHaveValue('Use the staging fixtures') // nothing is known to be recorded
  await steps.getByRole('button', { name: 'Try again' }).click()
  await expect(steps).toContainText('Guidance recorded; delivery pending.')
  const ops = (await commanded(page)).map((c) => c.operation_id)
  expect(ops).toHaveLength(2)
  expect(ops[1]).toBe(ops[0])
  await page.goto(`${PAGE}?viewer=davide&admission=refused`)
  sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging fixtures')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(sheet.locator('.act-steps')).toContainText('Not allowed here. Nothing was sent.')
  await expect(sheet.getByRole('textbox', { name: 'Guidance for its session' })).toHaveValue('Use the staging fixtures')
})

/** Stops `work-2` from its sheet, through Stop's question. */
async function stopReview(page: Page) {
  const sheet = await openTask(page, 'work-2', 'Review the report pane')
  await sheet.getByRole('button', { name: 'Stop', exact: true }).click()
  await sheet.getByRole('group', { name: 'Stop' }).getByRole('button', { name: 'Stop' }).click()
  return sheet
}

test('wbc · UI-10 · a Stop delivered is requested, not stopped; unknown says so; only a settled one is stopped', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  let sheet = await stopReview(page)
  await expect(sheet.locator('.act-steps li[data-reached]')).toHaveCount(2) // recorded, delivered: no effect seen
  await expect(sheet.locator('.act-steps')).toContainText('Stop requested; waiting for the runtime to confirm.')
  await expect(tile(page, 'work-2').locator('.task-chip')).toHaveText('Working')
  await page.goto(`${PAGE}?viewer=davide&settle=unknown`)
  sheet = await stopReview(page)
  await expect(sheet.locator('.act-steps')).toContainText('Stop requested. The runtime’s state is not confirmed yet.')
  await page.goto(`${PAGE}?viewer=davide&settle=confirmed`)
  sheet = await stopReview(page)
  await expect(sheet.locator('.act-steps')).toContainText('Stopped. Completed work is kept.')
  await expect(sheet.locator('.task-sheet-closed')).toContainText('From its sheet. Completed work is kept.')
  await page.keyboard.press('Escape')
  await expect(tile(page, 'work-2')).toHaveCount(0) // out of the lanes, into Closed work
  await expect(board(page).getByRole('button', { name: /^Closed work/ })).toContainText('1')
})

test('wbc · Resume is offered only for a hold the runtime confirmed, and never by itself', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&settle=confirmed`)
  const sheet = await openTask(page, 'work-2', 'Review the report pane')
  await expect(sheet.getByRole('button', { name: /^Resume/ })).toHaveCount(0)
  await sheet.getByRole('button', { name: /^Hold/ }).click()
  await expect(sheet.locator('.act-steps')).toContainText('Held. Work and remaining allowance are retained.')
  await expect(tile(page, 'work-2').locator('.task-chip')).toHaveText('Held')
  await expect(sheet.getByRole('button', { name: /^Hold/ })).toHaveCount(0)
  await sheet.getByRole('button', { name: /^Resume/ }).click()
  await expect(sheet.locator('.act-steps')).toContainText('Resumed.')
  await expect(tile(page, 'work-2').locator('.task-chip')).toHaveText('Working')
})

test('wbc · UI-11 · a draft and a command stay with their work and generation: J and K, closing, a new assignment', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  const field = () => page.getByRole('dialog').getByRole('textbox', { name: 'Guidance for its session' })
  await field().fill('Keep this draft')
  await page.getByRole('dialog').locator('.task-sheet-plan').click() // the keys leave the field
  await page.keyboard.press('j')
  await expect(page.getByRole('dialog', { name: 'Implement the PDF retry' })).toHaveCount(0)
  await page.keyboard.press('k')
  await expect(field()).toHaveValue('Keep this draft')
  await page.keyboard.press('Escape')
  await tile(page, 'work-1').click()
  await expect(field()).toHaveValue('Keep this draft')
  await page.getByRole('dialog').getByRole('button', { name: 'Send', exact: true }).click()
  await expect(sheet.locator('.act-steps')).toContainText('Guidance recorded')
  // The same session is given the task again, at its next generation: nothing of the old one carries over.
  await page.evaluate(() => window.workFixture?.reassign?.('work-1'))
  await expect(sheet.locator('.act-steps')).toHaveCount(0)
  await expect(field()).toHaveValue('')
})

test('wbc · UI-12 · a receipt repeated, late, or for another task changes nothing', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&settle=confirmed`)
  const review = await openTask(page, 'work-2', 'Review the report pane')
  await review.getByRole('button', { name: /^Hold/ }).click()
  await expect(review.locator('.act-steps')).toContainText('Held. Work and remaining allowance are retained.')
  const hold = (await commanded(page))[0]?.operation_id ?? ''
  await page.evaluate((op) => window.workFixture?.replay?.(op), hold) // every receipt again, newest first
  await expect(review.locator('.act-steps')).toContainText('Held. Work and remaining allowance are retained.')
  await page.keyboard.press('Escape')
  const retry = await openTask(page, 'work-1', 'Implement the PDF retry')
  await retry.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging fixtures')
  await retry.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(retry.locator('.act-steps')).toContainText('Delivered to the session; not yet verified in the result.')
  const guide = (await commanded(page))[1]?.operation_id ?? ''
  await page.evaluate((op) => window.workFixture?.replay?.(op), guide) // late: queued, then recorded
  await expect(retry.locator('.act-steps')).toContainText('Delivered to the session; not yet verified in the result.')
  await expect(retry.locator('.act-steps li[data-reached]')).toHaveCount(3)
  await page.evaluate(([from, to]) => window.workFixture?.misdeliver?.(from ?? '', to ?? ''), [hold, guide])
  await expect(retry.locator('.act-steps')).toContainText('Delivered to the session; not yet verified in the result.')
  await expect(retry.locator('.act-steps')).not.toContainText('Held')
})

test('wbc · UI-13 · an answer not confirmed is tried again with its own operation, never as another choice', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&unknown=1`)
  const ask = board(page).getByRole('region', { name: 'Davide decides' })
  const choices = ask.getByRole('group', { name: 'Your choice' })
  await choices.getByRole('button', { name: 'Ship it now' }).click()
  await expect(ask.getByRole('status')).toHaveText(
    'Checking whether your choice was recorded. Do not choose again yet.',
  )
  await choices.getByRole('button', { name: 'Ship it now' }).click()
  await expect.poll(async () => (await page.evaluate(() => window.workFixture?.answered ?? [])).length).toBe(2)
  const [first, again] = await page.evaluate(() => window.workFixture?.answered ?? [])
  expect(again?.operation_id).toBe(first?.operation_id)
  await expect(choices.getByRole('button', { name: 'Wait for the review' })).toBeDisabled()
})

test('wbc · UI-14 · a choice recorded before the lead reacts reads as chosen, the plan updating', async ({ page }) => {
  await page.goto(`${PAGE}?case=reacting`) // Luis
  await expect(board(page).locator('.board-decided')).toContainText('Davide chose Ship it now. The plan is updating.')
  await expect(board(page).locator('.decision-pill')).toHaveCount(0)
  await page.goto(`${PAGE}?viewer=davide&case=reacting`)
  const decided = board(page).locator('.board-decided')
  await expect(decided).toContainText('Your choice is recorded. The plan is updating.')
  await expect(decided.getByRole('button')).toHaveCount(0)
})

test('wbc · UI-15 · an answer shows as its chunks arrive, never word by word on a timer; once, under its task', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('button', { name: 'Why is it waiting?' }).click()
  await page.clock.runFor(950) // the first chunk, at 0.9 s
  const first = await sheet.locator('.ask-a').innerText()
  expect(first).toContain('Davide’s Claude Code is waiting')
  expect(first).not.toContain('answers it in Claude Code')
  await page.clock.runFor(60) // no chunk arrives meanwhile, and nothing is revealed by a timer
  expect(await sheet.locator('.ask-a').innerText()).toBe(first)
  await page.clock.runFor(400)
  await expect(sheet.locator('.ask-a')).toContainText('answers it in Claude Code.')
  const whole = await sheet.locator('.ask-a').innerText()
  await page.evaluate(() => window.workFixture?.reconnect?.()) // every event again, as a resumed stream
  expect(await sheet.locator('.ask-a').innerText()).toBe(whole)
  // Another task's sheet has none of it; this one keeps it.
  await page.locator('.task-sheet-plan').click()
  await page.keyboard.press('j')
  await expect(page.getByRole('dialog').locator('.ask-thread')).toHaveCount(0)
  await page.keyboard.press('k')
  await expect(page.getByRole('dialog').locator('.ask-a')).toHaveText(whole)
})

test('wbc · UI-15 · an answer that comes whole shows whole at once', async ({ page }) => {
  await paused(page, `${PAGE}?viewer=davide&ask=whole`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('button', { name: 'What happens if I say yes?' }).click()
  await page.clock.runFor(950)
  await expect(sheet.locator('.ask-a')).toHaveText(
    'It runs the report tests. If they pass, the retry becomes a candidate, and its review can start.',
  )
})

test('wbc · UI-16 · Sophia’s own source reviewer is itself, with no subscription; asking it here keeps the question', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=native`)
  const reviewer = tile(page, 'work-sources')
  await expect(reviewer.locator('.task-tile-name')).toHaveText('Sophia · Source reviewer')
  await expect(reviewer.locator('.plan-sophia')).toHaveCount(1)
  await expect(reviewer.locator('.tool-logo')).toHaveCount(0)
  await expect(reviewer.locator('[data-short]')).toHaveCount(0)
  const sheet = await openTask(page, 'work-sources', 'Review the export’s sources')
  await expect(sheet.locator('.task-who-link')).toHaveCount(0) // no resource to open
  await expect(sheet.locator('.act-boundary')).toHaveText('Within the project’s mandate for Sophia’s reviewer.')
  await sheet.getByRole('textbox', { name: 'Ask Sophia about this task' }).fill('Are the sources complete?')
  await sheet.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(sheet.locator('.ask-none')).toContainText(
    'Not answered here: The task’s conversation isn’t connected in this slice.',
  )
  await expect(sheet.getByRole('button', { name: 'Open the conversation' })).toBeVisible()
  await expect(sheet.getByRole('textbox', { name: 'Ask Sophia about this task' })).toHaveValue(
    'Are the sources complete?',
  )
})

test('wbc · UI-17 · an old report during a long tool call ages, and is never called stuck; the connection is apart', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=old-report`)
  const review = tile(page, 'work-2')
  await expect(review.locator('.task-tile-ago')).toHaveText(/^9 min ago$/)
  await expect(review.locator('.task-chip')).toHaveText('Working')
  expect(
    await review.locator('.task-who').evaluate((w) => Number(getComputedStyle(w).getPropertyValue('--fresh'))),
  ).toBe(0)
  await expect(board(page)).not.toContainText(/stuck/i)
  await expect(tile(page, 'work-1').locator('.task-tile-connection')).toHaveText('connection lost')
  await expect(review.locator('.task-tile-connection')).toHaveCount(0)
})

test('wbc · UI-18 · a revision that failed keeps the last usable version openable, marked', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&case=revision-failed`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  const versions = sheet.locator('.task-result-version')
  await expect(versions).toHaveCount(1)
  await expect(versions).toContainText('Last usable')
  await expect(versions).toContainText('retry-v1')
  await expect(sheet).not.toContainText('retry-v2') // the withdrawn one isn't offered as a result
  await sheet.getByRole('button', { name: 'Open earlier result' }).click()
  await expect(sheet.locator('.task-result-text')).toContainText('Retry v1')
})

test('wbc · UI-19 · by keys alone: a task’s conditions and its result are reached and opened', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&case=defects`)
  await tile(page, 'work-1-review').focus()
  await page.keyboard.press('Enter')
  const sheet = sheetOf(page, 'Review the retry’s candidate')
  await expect(sheet.locator('.task-links').first()).toContainText('Implement the PDF retry')
  const open = sheet.getByRole('button', { name: 'Open result' })
  for (let i = 0; i < 12 && !(await open.evaluate((b) => b === document.activeElement)); i++)
    await page.keyboard.press('Tab')
  await expect(open).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(sheet.locator('.task-result-text')).toContainText('Changes needed before it ships.')
})

test('@phone · wbc · UI-19 · on a phone, a task’s conditions, result and actions are in reach, nothing past the screen', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=defects`)
  await tile(page, 'work-1-review').click()
  const sheet = sheetOf(page, 'Review the retry’s candidate')
  await expect(sheet.locator('.task-links').first()).toContainText('Implement the PDF retry')
  const open = sheet.getByRole('button', { name: 'Open result' })
  await open.scrollIntoViewIfNeeded()
  expect((await rect(open)).height).toBeGreaterThanOrEqual(36)
  await open.click()
  await expect(sheet.locator('.task-result-text')).toContainText('Changes needed before it ships.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})

test('wbc · UI-20 · another account looking starts afresh: no command, draft or look of the last one', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&since=1`)
  await expect(board(page).locator('.board-return')).toBeVisible()
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Only for Davide')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(sheet.locator('.act-steps')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.workFixture?.viewAs?.('luis'))
  await expect(page.locator('.fixture-label')).toContainText('viewing as Luis')
  await expect(board(page).locator('.board-return')).toHaveCount(0) // Luis's own first look
  await expect(tile(page, 'work-1').locator('.task-chip')).toHaveText('Waiting on Davide')
  const luis = await openTask(page, 'work-1', 'Implement the PDF retry')
  await expect(luis.locator('.act-steps')).toHaveCount(0)
  await expect(luis.getByRole('textbox', { name: 'Guidance for its session' })).toHaveValue('')
})

test('wbc · UI-21 · no request leaves the page, and the view the page draws is the one its reader accepted', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&goals=6&case=closed`)
  await expect(board(page)).toBeVisible()
  expect(await page.evaluate(() => window.workFixture?.refused ?? null)).toBeNull()
  // afterEach: nothing reached for anything else (fixture-api.ts refuses and records it).
})
