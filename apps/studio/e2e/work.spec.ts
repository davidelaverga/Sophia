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
  // Each lens's label on one line (WBC-01 renamed Open to Unassigned, a longer word).
  const lines = await board(page)
    .getByRole('radio')
    .evaluateAll((lenses) =>
      lenses.map((lens) => {
        const range = document.createRange()
        range.selectNodeContents(lens.firstChild ?? lens)
        return range.getClientRects().length
      }),
    )
  expect(lines).toEqual([1, 1, 1, 1])
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
/**
 * Pauses the page's clock a moment ahead of its own time. A busy page (its first render, on a server just started) can
 * pass that moment before the pause lands, which refuses it; then it aims again, from the page's time then.
 */
async function pauseSoon(page: Page, tries = 5): Promise<void> {
  const at = new Date((await page.evaluate(() => Date.now())) + 1000)
  try {
    await page.clock.pauseAt(at)
  } catch (e) {
    if (tries <= 1 || !String(e).includes('Cannot fast-forward to the past')) throw e
    await pauseSoon(page, tries - 1)
  }
}
/** Moves the page's clock on from a pause, so delays elapse only as a check says. */
async function paused(page: Page, url: string) {
  await page.clock.install()
  await page.goto(url)
  await pauseSoon(page)
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
  await expect(page.locator('.plan-next')).toContainText('r3, r4 proposed') // every proposal (PR #76 review)
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

test('wbc · UI-11 · an open command of the earlier generation stays with it: the next generation lists none', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost`)
  const sheet = await openTask(page, 'work-2', 'Review the report pane')
  await sheet.getByRole('button', { name: /^Hold/ }).click() // lost: still open
  await expect(sheet.getByRole('button', { name: 'Try again' })).toBeVisible()
  // Given again at its next generation, it is another assignment: not even its earlier attempt's history shows.
  await page.evaluate(() => window.workFixture?.reassign?.('work-2'))
  await expect(sheet.locator('.act-steps')).toHaveCount(0)
  await expect(sheet.getByRole('list', { name: 'Earlier, still open' })).toHaveCount(0)
})

test('wbc · UI-12 · a receipt repeated, late, or for another task changes nothing', async ({ page }) => {
  await paused(page, `${PAGE}?viewer=davide&settle=confirmed`)
  const review = await openTask(page, 'work-2', 'Review the report pane')
  await review.getByRole('button', { name: /^Hold/ }).click()
  await page.clock.runFor(3000)
  await expect(review.locator('.act-steps')).toContainText('Held. Work and remaining allowance are retained.')
  const hold = (await commanded(page))[0]?.operation_id ?? ''
  await page.evaluate((op) => window.workFixture?.replay?.(op), hold) // every receipt again, newest first
  await expect(review.locator('.act-steps')).toContainText('Held. Work and remaining allowance are retained.')
  await page.keyboard.press('Escape')
  // Another task's guidance, only recorded so far: the settled Hold's receipts sent to it change nothing there.
  const retry = await openTask(page, 'work-1', 'Implement the PDF retry')
  await retry.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging fixtures')
  await retry.getByRole('button', { name: 'Send', exact: true }).click()
  await page.clock.runFor(200)
  await expect(retry.locator('.act-steps')).toContainText('Guidance recorded; delivery pending.')
  const guide = (await commanded(page))[1]?.operation_id ?? ''
  await page.evaluate(([from, to]) => window.workFixture?.misdeliver?.(from ?? '', to ?? ''), [hold, guide])
  await expect(retry.locator('.act-steps')).toContainText('Guidance recorded; delivery pending.')
  await expect(retry.locator('.act-steps li[data-reached]')).toHaveCount(1)
  await page.clock.runFor(1600) // its own receipts still land
  await page.evaluate((op) => window.workFixture?.replay?.(op), guide) // late: queued, then recorded
  await expect(retry.locator('.act-steps')).toContainText('Delivered to the session; not yet verified in the result.')
  await expect(retry.locator('.act-steps li[data-reached]')).toHaveCount(3)
  // A refusal older than what was since observed, arriving late, contradicts nothing.
  await page.evaluate((op) => window.workFixture?.stale?.(op), guide)
  await page.waitForTimeout(200)
  await expect(retry.locator('.act-steps')).toContainText('Delivered to the session; not yet verified in the result.')
  await expect(retry.locator('.act-steps li[data-reached]')).toHaveCount(3)
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
  await board(page)
    .getByRole('radio', { name: /^Waiting/ })
    .click() // Davide's lens
  await page.evaluate(() => window.workFixture?.viewAs?.('luis'))
  await expect(board(page).getByRole('radio', { name: /^All/ })).toHaveAttribute('aria-checked', 'true')
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

// ---- The pre-push independent review's findings on f736ad7, each with its regression. ----

test('pre-push · a Stop asked on one task never stops the next: J turns away from the question', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide`)
  await page.evaluate(() => window.workFixture?.begin?.('work-1-review')) // the next task by J takes Stop too
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Stop' })).toBeVisible()
  await page.keyboard.press('j') // the focus is on Keep it working: J still steps
  const next = page.getByRole('dialog', { name: 'Review the retry’s candidate' })
  await expect(next.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Stop' })).toHaveCount(0)
  expect(await commanded(page)).toEqual([])
})

test('pre-push · a Stop asked at one generation is never answered at the next', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(sheet.getByRole('group', { name: 'Stop' })).toBeVisible()
  await page.evaluate(() => window.workFixture?.reassign?.('work-1')) // the same session, its next assignment
  await expect(sheet.getByRole('group', { name: 'Stop' })).toHaveCount(0)
  expect(await commanded(page)).toEqual([])
})

test('pre-push · one press is one request: Send waits while its guidance goes', async ({ page }) => {
  await paused(page, `${PAGE}?viewer=davide&admission=slow`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging fixtures')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await page.clock.runFor(3000)
  await expect(sheet.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  await page.clock.runFor(5000)
  await expect(sheet.locator('.act-steps')).toContainText('Guidance recorded; delivery pending.')
  expect(await commanded(page)).toHaveLength(1)
})

test('pre-push · the same words sent again after a lost reply are the same operation', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging fixtures')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(sheet.locator('.act-steps')).toContainText('Not confirmed whether it was recorded.')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click() // Send again, not Try again: the same words
  await expect(sheet.locator('.act-steps')).toContainText('Guidance recorded; delivery pending.')
  const ops = (await commanded(page)).map((c) => c.operation_id)
  expect(ops).toHaveLength(2)
  expect(ops[1]).toBe(ops[0])
})

test('pre-push · a lost Stop outlives choosing another goal, and is tried again with its own operation', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost&two=1`)
  await stopReview(page)
  await expect(page.getByRole('dialog').locator('.act-steps')).toContainText('Not confirmed whether it was recorded.')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: /The report pane says/ }).click()
  await page.getByRole('tab', { name: /Reports export to PDF/ }).click()
  const sheet = await openTask(page, 'work-2', 'Review the report pane')
  await expect(sheet.locator('.act-steps')).toContainText('Not confirmed whether it was recorded.')
  await sheet.locator('.act-steps').getByRole('button', { name: 'Try again' }).click()
  await expect(sheet.locator('.act-steps')).toContainText('Stop requested; waiting for the runtime to confirm.')
  const ops = (await commanded(page)).map((c) => c.operation_id)
  expect(ops).toHaveLength(2)
  expect(ops[1]).toBe(ops[0])
})

test('pre-push · an earlier command still open is named, and has its own Try again', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('button', { name: 'Stop', exact: true }).click()
  await sheet.getByRole('group', { name: 'Stop' }).getByRole('button', { name: 'Stop' }).click()
  await expect(sheet.locator('.act-steps')).toContainText('Not confirmed whether it was recorded.')
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging fixtures')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  const earlier = sheet.getByRole('list', { name: 'Earlier, still open' })
  await expect(earlier).toContainText('Stop Not confirmed whether it was recorded.')
  await earlier.getByRole('button', { name: 'Try again' }).click()
  await expect(earlier).toContainText('Stop Stop requested; waiting for the runtime to confirm.')
  const stops = (await commanded(page)).filter((c) => c.kind === 'stop').map((c) => c.operation_id)
  expect(stops).toHaveLength(2)
  expect(stops[1]).toBe(stops[0])
})

test('pre-push · work observed outside the plan in force is said, never hidden', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&case=outside`)
  await expect(board(page).locator('.board-notice')).toContainText('1 observed task isn’t in the plan in force')
  const outside = board(page).getByRole('region', { name: 'Observed outside the plan' })
  await expect(outside.locator('[data-work="work-old"]')).toContainText('Davide’s Claude Code · work-old')
  await expect(outside.locator('[data-work="work-old"]')).toContainText('running')
})

// ---- Codex's findings on 8afd007 (#74, WBC-01-CX-0001), each with its regression. ----

test('codex · F-002 · a task whose state isn’t observed stays Active, said so, and offers nothing to send', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=unobserved`)
  await expect(tile(page, 'work-2').locator('.task-chip')).toHaveText('State unknown')
  await expect(tile(page, 'work-1').locator('.task-chip')).toHaveText('Assignment not observed')
  expect(await titles(lane(page, 'Active'))).toEqual(
    expect.arrayContaining(['Implement the PDF retry', 'Review the report pane']),
  )
  const sheet = await openTask(page, 'work-2', 'Review the report pane')
  await expect(sheet.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: /^Hold/ })).toHaveCount(0)
  await expect(sheet.locator('.act-note')).toContainText([
    'Hold and Stop: Its state isn’t observed now, so nothing can be sent to it until it is.',
  ])
  await expect(sheet.getByRole('button', { name: 'What do we know about it?' })).toBeVisible() // asking stays
})

/** Joins the project's room from the mini dock, as a person on Tasks would (the fixture's LiveKit is fake). */
async function joinTheRoom(page: Page) {
  await page
    .locator('.mini-dock')
    .getByRole('button', { name: /^Join the room/ })
    .click()
  await expect(page.locator('.mini-dock').getByRole('button', { name: 'Leave the room' })).toBeVisible()
}

/** Whether a press at a control's centre reaches the control itself, not something over it. */
const pressable = (control: Locator) =>
  control.evaluate((el) => {
    const box = el.getBoundingClientRect()
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === el
  })

async function callKeptInReach(page: Page) {
  await page.goto(`${PAGE}?viewer=davide`)
  await joinTheRoom(page)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  const call = sheet.getByRole('group', { name: 'Your call' })
  const mic = call.getByRole('button', { name: 'Microphone' })
  const leave = call.getByRole('button', { name: 'Leave the room' })
  await expect(mic).toHaveAttribute('aria-pressed', 'true') // sending
  expect(await pressable(mic)).toBe(true)
  expect(await pressable(leave)).toBe(true)
  // The keyboard reaches it inside the sheet: from Close, the next stop is the microphone.
  await sheet.getByRole('button', { name: 'Close' }).focus()
  await page.keyboard.press('Tab')
  await expect(mic).toBeFocused()
  await page.keyboard.press('Space')
  await expect(mic).toHaveAttribute('aria-pressed', 'false') // muted from the sheet
  await leave.click()
  await expect(call).toHaveCount(0) // the call is over: the row goes, the sheet stays
  // What the meeting left opens on top (room-recap.spec.ts); put away, the focus is back in the sheet.
  const recap = page.getByRole('dialog', { name: 'This meeting' })
  await expect(recap).toContainText('Nothing was decided, made or kept in this meeting.')
  await page.keyboard.press('Escape')
  await expect(recap).toHaveCount(0)
  await expect(sheet).toBeVisible()
  expect(await sheet.evaluate((s) => s.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.locator('.mini-dock').getByRole('button', { name: /^Join the room/ })).toBeVisible()
}

test('codex · F-003 · during a call, an open task sheet keeps the microphone and Leave in reach', async ({ page }) => {
  await callKeptInReach(page)
})

test('@phone · codex · F-003 · on a phone too, an open task sheet keeps the microphone and Leave in reach', async ({
  page,
}) => {
  await callKeptInReach(page)
})

test('codex · F-003 · a resource’s sheet keeps the call in reach too', async ({ page }) => {
  await page.goto('/resources.html?viewer=davide')
  await joinTheRoom(page)
  await page
    .getByRole('button', { name: /Davide · Claude Code/ })
    .first()
    .click()
  const call = page.getByRole('dialog').getByRole('group', { name: 'Your call' })
  expect(await pressable(call.getByRole('button', { name: 'Leave the room' }))).toBe(true)
  await expect(call.getByRole('button', { name: 'Microphone' })).toHaveAttribute('aria-pressed', 'true')
})

test('codex · F-002 · a lost command can’t be sent again while its task isn’t observed or its action is denied', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost`)
  const sheet = await openTask(page, 'work-2', 'Review the report pane')
  await sheet.getByRole('button', { name: /^Hold/ }).click() // lost: the earlier one
  await sheet.getByRole('button', { name: 'Stop', exact: true }).click()
  await sheet.getByRole('group', { name: 'Stop' }).getByRole('button', { name: 'Stop' }).click() // lost: the latest
  const retries = sheet.getByRole('button', { name: 'Try again' })
  await expect(retries).toHaveCount(2)
  const sent = async () => (await commanded(page)).map((c) => c.operation_id)
  const before = await sent()
  // Its state isn't observed now: neither the latest nor the earlier can be sent again, and both stay said.
  await page.evaluate(() => window.workFixture?.setLifecycle?.('work-2', 'unknown'))
  await expect(retries).toHaveCount(0)
  await expect(sheet.locator('.act-steps')).toContainText('It can’t be sent again from here now; it is kept as it was.')
  await expect(sheet.getByRole('list', { name: 'Earlier, still open' })).toContainText('Hold Not confirmed')
  expect(await sent()).toEqual(before)
  // Observed again, Stop denied to this viewer: the Stop can't be sent again; the Hold, still allowed, can.
  await page.evaluate(() => window.workFixture?.setLifecycle?.('work-2', 'running'))
  await page.evaluate(() => window.workFixture?.setAvailability?.('work-2', 'stop', 'denied'))
  await expect(sheet.locator('.act-steps').getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await expect(retries).toHaveCount(1)
  // Allowed again: the same Stop goes again with its own operation, never a new one.
  await page.evaluate(() => window.workFixture?.setAvailability?.('work-2', 'stop', 'allowed'))
  await sheet.locator('.act-steps').getByRole('button', { name: 'Try again' }).click()
  await expect(sheet.locator('.act-steps')).toContainText('Stop requested; waiting for the runtime to confirm.')
  const after = await sent()
  expect(after).toHaveLength(3)
  expect(after[2]).toBe(before[1]) // the Stop's own operation
})

// ---- Its progress review (LFE-07.2): asked with the goal's Request review, said on the goal's quiet line. ----

const requestReview = (page: Page) => page.getByRole('button', { name: /^Request review/ })
const reviewLine = (page: Page) => page.locator('.plan-next-review')
const commandsOf = (page: Page) => page.evaluate(() => window.workFixture?.goalCommands ?? [])

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
  await expect(reviewLine(page)).toHaveText(/^The lead is reviewing · asked by you (just now|\d+ s ago)$/)
  await expect(reviewLine(page).locator('.activity-dot')).toBeVisible()
  await page.clock.runFor(2100)
  await expect(reviewLine(page)).toHaveText(/^Reviewed (just now|\d+ s ago) · no change$/)
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

// ---- The PR #76 review (Codex on GitHub), each finding with its regression. ----

test('pr76 · P1 · Stop on the attempt shown now is a new request, not the earlier attempt’s lost one', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost`)
  await stopReview(page)
  await expect(page.getByRole('dialog').locator('.act-steps')).toContainText('Not confirmed whether it was recorded.')
  // The same assignment and generation moves to its next attempt, in another session.
  await page.evaluate(() => window.workFixture?.nextAttempt?.('work-2'))
  const sheet = page.getByRole('dialog', { name: 'Review the report pane' })
  await sheet.getByRole('button', { name: 'Stop', exact: true }).click()
  await sheet.getByRole('group', { name: 'Stop' }).getByRole('button', { name: 'Stop' }).click()
  await expect.poll(async () => (await commanded(page)).length).toBe(2)
  const [first, second] = await commanded(page)
  expect(second?.operation_id).not.toBe(first?.operation_id)
  expect(second?.target.attempt_id).toBe(`${first?.target.attempt_id ?? ''}-again`)
  expect(second?.target.session_id).toBe(`${first?.target.session_id ?? ''}-again`)
})

test('pr76 · P2 · an answer that never comes is said so in time, and the question can be asked again', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&ask=silent`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('button', { name: 'Why is it waiting?' }).click()
  await page.clock.runFor(29_000)
  await expect(sheet.locator('.ask-a')).toHaveText('Thinking…')
  await page.clock.runFor(2_000)
  await expect(sheet.locator('.ask-none')).toContainText('No answer came in time. Nothing was changed.')
  await expect(sheet.locator('.ask-q')).toHaveText('Why is it waiting?') // the question is kept
  await expect(sheet.getByRole('button', { name: 'Open the conversation' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Ask again' }).click()
  await expect(sheet.locator('.ask-a')).toHaveText('Thinking…')
})

test('pr76 · P2 · every proposed plan is shown, beside the accepted one or beside the first proposal', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=replan`)
  await expect(board(page).getByRole('button', { name: /Plan r3, not accepted yet/ })).toBeVisible()
  await expect(board(page).getByRole('button', { name: /Plan r4, not accepted yet/ })).toContainText(
    '1 added · 1 removed',
  )
  // With none accepted: the first proposal is the board, read only, and the others are said beside it.
  await page.goto(`${PAGE}?viewer=davide&case=replan&proposed=1`)
  await expect(page.locator('.plan-next')).toContainText('r3, r4 also proposed')
  const also = board(page).getByRole('button', { name: /^Also proposed/ })
  await expect(also).toHaveCount(2)
  await expect(also.first()).toContainText('Plan r3, not accepted yet')
  await expect(board(page).locator('.board-notice')).toContainText('Proposed, not accepted yet: nothing in it runs.')
})

// ---- CX-0009 (Codex on #74): a question asked again is its own send, and goes only while asking is allowed. ----

const questioned = (page: Page) => page.evaluate(() => window.workFixture?.questions ?? [])

test('codex · F-004 · an earlier send can’t time out or answer a question asked again; each send waits its own time', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&ask=flaky`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  const answer = sheet.locator('.ask-a')
  const again = sheet.getByRole('button', { name: 'Ask again' })
  await sheet.getByRole('button', { name: 'Why is it waiting?' }).click()
  // The first send fails at 5 s, long before its own wait would end (30 s).
  await page.clock.runFor(5_000)
  await expect(answer).toContainText('I couldn’t reach the conversation just now.')
  await page.clock.runFor(5_000)
  await again.click() // 10 s: the second send
  // 30 s: the first send's wait would have ended. The second has waited 20 s of its own 30: still waiting.
  await page.clock.runFor(20_000)
  await expect(answer).toHaveText('Thinking…')
  // 35 s: a part of its answer, then nothing. That part began its wait again: it fails at 65 s, not before.
  await page.clock.runFor(5_000)
  await expect(answer).toHaveText(/^It waits\s*$/)
  await page.clock.runFor(29_000)
  await expect(answer).toHaveText(/^It waits\s*$/)
  await page.clock.runFor(1_000)
  await expect(sheet.locator('.ask-none')).toContainText('No answer came in time. Nothing was changed.')
  // 66 s: the third send. The second's whole answer arrives late, at 80 s, and is let go; the third's comes at 86 s.
  await page.clock.runFor(1_000)
  await again.click()
  await page.clock.runFor(14_000)
  await expect(answer).toHaveText('Thinking…')
  await page.clock.runFor(6_000)
  await expect(answer).toHaveText('It waits for Davide’s answer, said on the third send.')
  const sent = await questioned(page)
  expect(sent).toHaveLength(3)
  expect(new Set(sent.map((q) => JSON.stringify(q))).size).toBe(1) // one question, sent three times
})

test('codex · F-005 · a failed question is asked again only while asking is allowed, and is kept meanwhile', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&ask=silent`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('button', { name: 'Why is it waiting?' }).click()
  await page.clock.runFor(31_000)
  const again = sheet.getByRole('button', { name: 'Ask again' })
  await expect(again).toBeVisible()
  const available = (to: 'allowed' | 'denied' | 'unavailable' | 'missing') =>
    page.evaluate((a) => window.workFixture?.setAvailability?.('work-1', 'ask_sophia', a), to)
  /** Not offered again, and why; the question, its failure and the way to the conversation kept. */
  const kept = async (why: string) => {
    await expect(sheet.locator('.ask-blocked')).toHaveText(
      `It can’t be asked again from here now: ${why} It is kept as it was.`,
    )
    await expect(again).toHaveCount(0)
    await expect(sheet.locator('.ask-q')).toHaveText('Why is it waiting?')
    await expect(sheet.locator('.ask-none')).toContainText('No answer came in time. Nothing was changed.')
    await expect(sheet.getByRole('button', { name: 'Open the conversation' })).toBeVisible()
  }
  await available('denied')
  await kept('No longer allowed for you here.')
  // Why it can't go again is a line of its own, under why there is no answer, not a column beside it.
  const [line, blocked] = await Promise.all([
    sheet.locator('.ask-none').boundingBox(),
    sheet.locator('.ask-blocked').boundingBox(),
  ])
  expect(Math.round(blocked?.x ?? -1)).toBe(Math.round(line?.x ?? 0))
  expect(blocked?.y ?? 0).toBeGreaterThan(line?.y ?? 0)
  await available('unavailable')
  await kept('No longer allowed for you here.')
  await available('missing')
  await kept('Asking about this task isn’t offered here now.')
  await expect(sheet.getByRole('button', { name: 'Why is it waiting?' })).toHaveCount(0) // nothing new to ask either
  expect(await questioned(page)).toHaveLength(1) // nothing went meanwhile
  // Allowed again: Ask again sends the same question.
  await available('allowed')
  await again.click()
  await expect(sheet.locator('.ask-a')).toHaveText('Thinking…')
  const [first, second, ...more] = await questioned(page)
  expect(more).toHaveLength(0)
  expect(second).toEqual(first)
})

// ---- CX-0010 (Codex on #74): an earlier execution's commands are its history; Ask again needs a conversation. ----

/** Stop, confirmed, on the sheet open. */
async function stopIn(sheet: Locator) {
  await sheet.getByRole('button', { name: 'Stop', exact: true }).click()
  await sheet.getByRole('group', { name: 'Stop' }).getByRole('button', { name: 'Stop' }).click()
}

test('codex · F-007 · after a new attempt, the earlier attempt’s open commands are said as its, and never sent again', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost`)
  const sheet = await openTask(page, 'work-2', 'Review the report pane')
  await sheet.getByRole('button', { name: /^Hold/ }).click() // lost: the earlier one
  await stopIn(sheet) // lost: the latest
  const retries = sheet.getByRole('button', { name: 'Try again' })
  await expect(retries).toHaveCount(2)
  const before = await commanded(page)
  // The same assignment and generation moves to its next attempt, in the same session.
  await page.evaluate(() => window.workFixture?.nextAttempt?.('work-2', 'attempt'))
  await expect(sheet.locator('.act-steps')).toHaveCount(0) // nothing speaks for the attempt shown now
  const earlier = sheet.getByRole('list', { name: 'Earlier, still open' })
  const kept = 'Not confirmed whether it was recorded. It can’t be sent again from here now; it is kept as it was.'
  await expect(earlier.locator('li')).toHaveText([
    `Hold for an earlier attempt ${kept}`,
    `Stop for an earlier attempt ${kept}`,
  ])
  await expect(retries).toHaveCount(0) // neither position offers it
  expect(await commanded(page)).toEqual(before)
  // Stop now is the attempt shown's own: a new operation, and its own Try again sends it, to it; the earlier stay.
  await stopIn(sheet)
  await expect.poll(async () => (await commanded(page)).length).toBe(3)
  const now = (await commanded(page))[2]
  expect(now?.target.attempt_id).toBe(`${before[1]?.target.attempt_id ?? ''}-again`)
  expect(now?.target.session_id).toBe(before[1]?.target.session_id)
  await sheet.locator('.act-steps').getByRole('button', { name: 'Try again' }).click()
  await expect.poll(async () => (await commanded(page)).length).toBe(4)
  expect((await commanded(page))[3]).toEqual(now)
  await expect(earlier.getByRole('button', { name: 'Try again' })).toHaveCount(0)
})

test('codex · F-007 · after a new session, the earlier session’s lost Stop is named, and not sent again', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost`)
  const sheet = await stopReview(page)
  await expect(sheet.locator('.act-steps').getByRole('button', { name: 'Try again' })).toBeVisible()
  // A Stop asked of this session, not answered yet, is never answered on the next one.
  await sheet.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(sheet.getByRole('group', { name: 'Stop' })).toBeVisible()
  await page.evaluate(() => window.workFixture?.nextAttempt?.('work-2', 'session'))
  await expect(sheet.getByRole('group', { name: 'Stop' })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await expect(sheet.getByRole('list', { name: 'Earlier, still open' })).toContainText('Stop for another session')
  await expect(sheet.locator('.act-steps')).toHaveCount(0)
  expect(await commanded(page)).toHaveLength(1)
})

test('codex · F-007 · a guidance draft belongs to its execution: a new attempt or session starts with none', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  const field = sheet.getByRole('textbox', { name: 'Guidance for its session' })
  await field.fill('For the first attempt only')
  await page.evaluate(() => window.workFixture?.nextAttempt?.('work-1', 'attempt'))
  await expect(field).toHaveValue('')
  await field.fill('For this session only')
  await page.evaluate(() => window.workFixture?.nextAttempt?.('work-1', 'session'))
  await expect(field).toHaveValue('')
  // What is written now goes to the execution shown, and only what was written for it.
  await field.fill('For the session shown')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(async () => (await commanded(page)).length).toBe(1)
  const [sent] = await commanded(page)
  expect(sent?.text).toBe('For the session shown')
  expect([sent?.target.attempt_id, sent?.target.session_id].every((id) => id?.endsWith('-again'))).toBe(true)
})

test('codex · F-005 · with no conversation connected, a failed question isn’t asked again, and says why', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&ask=silent`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('button', { name: 'Why is it waiting?' }).click()
  await page.clock.runFor(31_000)
  const again = sheet.getByRole('button', { name: 'Ask again' })
  await expect(again).toBeVisible()
  // The conversation goes; asking is still allowed on the task, but nothing can go.
  await page.evaluate(() => window.workFixture?.conversation?.(false))
  await expect(sheet.locator('.ask-blocked')).toHaveText(
    'It can’t be asked again from here now: The conversation isn’t connected here now. It is kept as it was.',
  )
  await expect(again).toHaveCount(0)
  await expect(sheet.locator('.ask-q')).toHaveText('Why is it waiting?')
  await expect(sheet.locator('.ask-none')).toContainText('No answer came in time. Nothing was changed.')
  await expect(sheet.getByRole('button', { name: 'Open the conversation' })).toBeVisible()
  expect(await questioned(page)).toHaveLength(1)
  // Connected again: Ask again sends the same question.
  await page.evaluate(() => window.workFixture?.conversation?.(true))
  await again.click()
  await expect(sheet.locator('.ask-a')).toHaveText('Thinking…')
  const [first, second, ...more] = await questioned(page)
  expect(more).toHaveLength(0)
  expect(second).toEqual(first)
})

// ---- The GitHub review of PR #76 at be46d05: a decision arriving later opens for its decider. ----

const decides = (page: Page, name: string) => board(page).getByRole('region', { name: `${name} decides` })
const pill = (page: Page) => board(page).locator('.decision-pill:not(.review-pill)')

test('pr76 · P2 · a decision arriving later for its decider opens by itself; one the viewer closed stays closed', async ({
  page,
}) => {
  // Luis has none at first: the decisions stay folded under the pill.
  await page.goto(`${PAGE}?viewer=luis`)
  await expect(pill(page)).toHaveAttribute('aria-expanded', 'false', { timeout: 15_000 })
  await page.evaluate(() => window.workFixture?.decisionArrives?.('luis'))
  await expect(decides(page, 'Luis')).toBeVisible()
  await expect(pill(page)).toHaveAttribute('aria-expanded', 'true')
  // Davide's opens with the board; closed by him, a later observation without a new one leaves it closed.
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(decides(page, 'Davide')).toBeVisible({ timeout: 15_000 })
  await pill(page).click()
  await expect(decides(page, 'Davide')).toHaveCount(0)
  await page.evaluate(() => window.workFixture?.setLifecycle?.('work-3', 'running'))
  await expect(pill(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(decides(page, 'Davide')).toHaveCount(0)
  // A new one of his opens them again, the closed one with it.
  await page.evaluate(() => window.workFixture?.decisionArrives?.('davide'))
  await expect(decides(page, 'Davide')).toHaveCount(2)
})

test('pr76 · P2 · a decision arriving while the review’s card is open takes the slot', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&review=material`)
  await reviewPill(page).click()
  await expect(reviewCard(page)).toBeVisible()
  await page.evaluate(() => window.workFixture?.decisionArrives?.('davide'))
  await expect(board(page).getByRole('region', { name: 'Davide decides' }).first()).toBeVisible()
  await expect(reviewCard(page)).toHaveCount(0)
  await expect(reviewPill(page)).toHaveAttribute('aria-expanded', 'false')
})

// ---- CX-0012 (Codex on #74; GitHub 4178085242, 4178085246): no certifying an unmatched check; no expired alert. ----

test('codex · F-009 · complete with evidence, but two versions claim to be current: not Complete, and said why', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=two-current`)
  await expect(tile(page, 'work-1')).toBeVisible({ timeout: 15_000 })
  expect(await titles(lane(page, 'Complete'))).not.toContain('Implement the PDF retry')
  expect(await titles(lane(page, 'Active'))).toContain('Implement the PDF retry')
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await expect(sheet.locator('.task-chip')).toHaveText('Not shown as complete')
  await expect(sheet.locator('.task-sheet-detail')).toHaveText(
    'Its check can’t be matched to a single current version: two claim to be current, or none is.',
  )
  await expect(sheet.locator('.task-result-review')).toHaveText(
    'Review passed for retry-v2, no single current version to match it to',
  )
})

test('codex · F-010 · back after a decision expired, it is said expired, never as waiting on you', async ({ page }) => {
  // The last look predates the decision; it arrived since, still proposed, but past its expiry now.
  await page.goto(`${PAGE}?viewer=davide&since=2&expired=1`)
  const away = board(page).locator('.board-return')
  await expect(away).toContainText('Your decision expired unanswered: Ship the retry before', { timeout: 15_000 })
  await expect(away).not.toContainText('A decision waits on you')
  // Still answerable, the same return says it waits on him.
  await page.goto(`${PAGE}?viewer=davide&since=2`)
  await expect(away).toContainText('A decision waits on you: Ship the retry before')
})

// ---- CX-0013 (Codex on #74; GitHub 4178716683): a short chip on a phone; a result lost said as lost. ----

/** Where an element's right edge falls on the page. */
async function right(l: Locator) {
  const box = await l.boundingBox()
  return (box?.x ?? 0) + (box?.width ?? 0)
}

test('@phone · codex · F-011 · a task not shown as complete keeps to the screen: a short chip, its reason wrapping', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=two-current`)
  const width = page.viewportSize()?.width ?? 0
  const chip = tile(page, 'work-1').locator('.task-chip')
  await expect(chip).toHaveText('Not shown as complete', { timeout: 15_000 })
  expect(await right(chip)).toBeLessThanOrEqual(width)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await expect(sheet.locator('.task-sheet-detail')).toContainText('can’t be matched to a single current version')
  await settled(page)
  // Against the device's width, not the document's own: a mobile page can widen its layout viewport to its content.
  const fits = await page.evaluate(() => ({
    inner: window.innerWidth,
    page: document.documentElement.scrollWidth,
    dialog: (() => {
      const d = document.querySelector('[role="dialog"]')
      return d ? d.scrollWidth - d.clientWidth : -1
    })(),
  }))
  expect(fits.inner).toBe(width)
  expect(fits.page).toBeLessThanOrEqual(width)
  expect(fits.dialog).toBeLessThanOrEqual(1)
  expect(await right(sheet.locator('.task-chip'))).toBeLessThanOrEqual(width)
  expect(await right(sheet.locator('.task-sheet-detail'))).toBeLessThanOrEqual(width)
})

test('codex · F-012 · a result lost since the last look is said lost, not as the task starting', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&case=two-current`)
  await expect(tile(page, 'work-1')).toBeVisible({ timeout: 15_000 })
  // The last look, as kept: the same board, but when retry-v2 was the task's one current result.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sophia.plan.seen.v3:'))
    if (!key) throw new Error('no look kept')
    const kept: unknown = JSON.parse(localStorage.getItem(key) ?? '{}', (field: string, value: unknown) =>
      field === 'work-1' && typeof value === 'object' && value !== null ? { ...value, result: 'retry-v2' } : value,
    )
    localStorage.setItem(key, JSON.stringify(kept))
  })
  await page.reload()
  const away = board(page).locator('.board-return')
  await expect(away).toContainText(
    'Implement the PDF retry has no single current result now: two versions claim to be current',
    {
      timeout: 15_000,
    },
  )
  // Its mark didn't move: nothing else is said of it (not "started", not "isn't observed now").
  const said = (await away.innerText()).split('Implement the PDF retry').length - 1
  expect(said).toBe(1)
})

// ---- CX-0014 (Codex on #74; GitHub 4179066167): a plan's Decided history is its own. ----

const fold = (page: Page) => board(page).locator('.plan-fold-button')
const own = (page: Page) => board(page).getByRole('list', { name: 'Decided', exact: true })
const elsewhere = (page: Page) => board(page).getByRole('list', { name: 'Decided for another plan' })

test('codex · F-013 · a plan lists only its own choices; another plan’s are apart, named by their revision', async ({
  page,
}) => {
  // In force at r2, beside two replacements each with a choice made: r3 of the same plan, and plan-1-alt r4.
  // Proposed only: the same, the r2 shown not accepted yet.
  for (const query of ['', '&proposed=1']) {
    await page.goto(`${PAGE}?viewer=davide&case=replan-decided${query}`)
    await expect(fold(page)).toHaveText(/1 decided · 2 for another plan/, { timeout: 15_000 })
    await fold(page).click()
    await expect(own(page)).toContainText('Luis chose Three times') // r1's choice, carried forward
    await expect(own(page)).not.toContainText('Use the second host')
    await expect(own(page)).not.toContainText('Use the alternative route')
    await expect(elsewhere(page).locator('li')).toHaveText([
      /Davide chose Use the second host · for plan r3$/,
      /Luis chose Use the alternative route · for plan r4$/,
    ])
  }
})

test('codex · F-013 · superseded, the replacement shown keeps its own choice and the history it carries', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=replan-decided&superseded=1`) // r3 shown, proposed
  await expect(fold(page)).toHaveText(/2 decided · 1 for another plan/, { timeout: 15_000 })
  await fold(page).click()
  await expect(own(page)).toContainText('Luis chose Three times')
  await expect(own(page)).toContainText('Davide chose Use the second host')
  await expect(elsewhere(page).locator('li')).toHaveText([/Luis chose Use the alternative route · for plan r4$/])
})

// ---- CX-0015 (Codex on #74; GitHub 4179218923, 4179218926): delivery once established stays; a plan's band is its own. ----

test('codex · F-014 · a delivered guidance stays delivered when a newer receipt says less of it', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging report fixtures')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  const steps = sheet.locator('.act-steps')
  await expect(steps).toContainText('Delivered to the session; not yet verified in the result.')
  const [sent] = await commanded(page)
  // The service's next receipt for it, a newer revision, says it is only queued.
  await page.evaluate((op) => window.workFixture?.weaken?.(op), sent?.operation_id ?? '')
  await expect.poll(() => page.evaluate(() => window.workFixture?.receipts?.length)).toBe(4)
  await page.waitForTimeout(200) // the board has taken it in
  await expect(steps.locator('li[data-reached]')).toHaveCount(3)
  await expect(steps).toContainText('Delivered to the session; not yet verified in the result.')
  await expect(steps).not.toContainText('delivery pending')
})

test('codex · F-015 · the plan’s updating band holds its own choices only; another plan’s are listed with that plan', async ({
  page,
}) => {
  // r2 in force; r3 (the same plan) and plan-1-alt r4 each taking a choice in, pending and unknown. Proposed only too.
  for (const query of ['', '&proposed=1']) {
    await page.goto(`${PAGE}?viewer=davide&case=replan-updating${query}`)
    await expect(fold(page)).toHaveText(/1 decided · 2 for another plan/, { timeout: 15_000 })
    await expect(board(page).locator('.board-decided')).toHaveCount(0)
    await fold(page).click()
    await expect(elsewhere(page).locator('li')).toHaveText([/for plan r3$/, /for plan r4$/])
  }
  // The plan's own choice, recorded, is said there while it takes it in (UI-14), and only it.
  await page.goto(`${PAGE}?viewer=davide&case=replan-updating`)
  await board(page).getByRole('region', { name: 'Davide decides' }).getByRole('button', { name: 'Ship it now' }).click()
  await page.evaluate(() => window.workFixture?.settle?.('d1'))
  const updating = board(page).locator('.board-decided')
  await expect(updating).toContainText('Your choice is recorded. The plan is updating.')
  await expect(updating.locator('.plan-ask')).toHaveCount(1)
  await expect(updating).not.toContainText('Use the second host')
  await expect(updating).not.toContainText('Use the alternative route')
})

// ---- CX-0016 (Codex on #74; GitHub 4179419841, …844, …848, …853). ----

const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' })

/** Davide's Claude Code worker, its acts open, in Resources: reached from Tasks in the same page. */
async function workerInResources(page: Page) {
  await views(page).getByRole('link', { name: 'Resources', exact: true }).click()
  await page
    .getByRole('list', { name: 'Resources' })
    .getByRole('button', { name: 'Davide · Claude Code', exact: true })
    .click()
  const worker = page
    .getByRole('dialog', { name: 'Davide · Claude Code' })
    .locator('.resource-session')
    .filter({ hasText: 'Implement the PDF retry' })
  await worker.getByRole('button', { name: 'Act' }).click()
  return worker
}

/** Back to Tasks, the retry's sheet open. */
async function retryInTasks(page: Page) {
  await page.keyboard.press('Escape')
  await views(page).getByRole('link', { name: 'Tasks', exact: true }).click()
  return openTask(page, 'work-1', 'Implement the PDF retry')
}

test('codex · F-016 · a Stop sent from Resources is Tasks’ too: the same request there is its own operation', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost&attempt=none`) // the same execution on both surfaces
  await expect(board(page)).toBeVisible({ timeout: 15_000 })
  const worker = await workerInResources(page)
  await stopIn(worker)
  await expect(worker.getByRole('button', { name: 'Try again' })).toBeVisible() // its reply lost
  const task = await retryInTasks(page)
  await expect(task.locator('.act-steps')).toContainText('Not confirmed whether it was recorded.')
  await expect(task.locator('.act-steps').getByRole('button', { name: 'Try again' })).toBeVisible()
  // Stop pressed here is the same request: its own operation goes again, and its receipts land here.
  await stopIn(task)
  await expect.poll(async () => (await commanded(page)).length).toBe(2)
  const [first, second] = await commanded(page)
  expect(second).toEqual(first)
  await expect(task.locator('.act-steps')).toContainText('Stop requested; waiting for the runtime to confirm.')
})

test('codex · F-016 · guidance from Resources is the same request in Tasks; another execution’s is named, not sent', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost&attempt=none`)
  await expect(board(page)).toBeVisible({ timeout: 15_000 })
  const worker = await workerInResources(page)
  await worker.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging fixtures')
  await worker.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(worker.getByRole('button', { name: 'Try again' })).toBeVisible()
  const task = await retryInTasks(page)
  const field = task.getByRole('textbox', { name: 'Guidance for its session' })
  await expect(field).toHaveValue('Use the staging fixtures') // the same execution's words, not yet recorded
  await task.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(async () => (await commanded(page)).length).toBe(2)
  const [first, second] = await commanded(page)
  expect(second).toEqual(first)
  // Where the board names the attempt and Resources doesn't, they are different executions: said, never sent again.
  await page.goto(`${PAGE}?viewer=davide&admission=lost`)
  await expect(board(page)).toBeVisible({ timeout: 15_000 })
  await stopIn(await workerInResources(page))
  const named = await retryInTasks(page)
  await expect(named.getByRole('list', { name: 'Earlier, still open' })).toContainText(
    'Stop sent without naming its attempt',
  )
  await expect(named.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await stopIn(named)
  await expect.poll(async () => (await commanded(page)).length).toBe(2)
  const [fromResources, fromTasks] = await commanded(page)
  expect(fromTasks?.operation_id).not.toBe(fromResources?.operation_id)
  expect(fromTasks?.target.attempt_id).not.toBeNull()
})

test('codex · F-017 · a result that never comes is said so in time; a reply after that changes nothing', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&case=defects&result=late`)
  const sheet = await openTask(page, 'work-1-review', 'Review the retry’s candidate')
  const note = sheet.locator('.task-result-note')
  await sheet.getByRole('button', { name: 'Open result' }).click()
  await expect(note).toHaveText('Reading findings-v1…')
  await page.clock.runFor(29_000)
  await expect(note).toHaveText('Reading findings-v1…')
  await page.clock.runFor(2_000) // past the Studio's 30 s read limit
  const late = 'findings-v1 didn’t come in time. Nothing else is shown in its place; open it again to try again.'
  await expect(note).toHaveText(late)
  await page.clock.runFor(10_000) // its reply comes at 40 s, after the limit: nothing changes
  await expect(note).toHaveText(late)
  await expect(sheet.locator('.task-result-text')).toHaveCount(0)
  // Opened again, it reads.
  await sheet.getByRole('button', { name: 'Open result' }).click()
  await page.clock.runFor(500)
  await expect(sheet.locator('.task-result-text')).toContainText('Changes needed before it ships.')
})

test('codex · F-017 · a port that never answers leaves no read waiting', async ({ page }) => {
  await paused(page, `${PAGE}?viewer=davide&case=defects&result=silent`)
  const sheet = await openTask(page, 'work-1-review', 'Review the retry’s candidate')
  await sheet.getByRole('button', { name: 'Open result' }).click()
  await page.clock.runFor(31_000)
  await expect(sheet.locator('.task-result-note')).toContainText('didn’t come in time')
})

test('codex · F-018 · another plan starts its own view; the same plan’s next revision keeps it, and commands stay', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost`)
  await expect(board(page)).toBeVisible({ timeout: 15_000 })
  const review = await openTask(page, 'work-2', 'Review the report pane')
  await review.getByRole('button', { name: /^Hold/ }).click() // its reply lost: still open
  await expect(review.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.keyboard.press('Escape')
  await board(page)
    .getByRole('radio', { name: /^Waiting/ })
    .click()
  await fold(page).click()
  // The same plan's next revision: a live update, the view kept.
  await page.evaluate(() => window.workFixture?.react?.('d1'))
  await expect(board(page)).toHaveAttribute('aria-label', 'Plan r3')
  await expect(board(page)).toHaveAttribute('data-lens', 'waiting')
  await expect(fold(page)).toHaveAttribute('aria-expanded', 'true')
  // Another plan in its place: its own view, from the start; the Hold sent is still known.
  await page.evaluate(() => window.workFixture?.replan?.())
  await expect(board(page)).toHaveAttribute('aria-label', 'Plan r1')
  await expect(board(page)).toHaveAttribute('data-lens', 'all')
  await expect(fold(page)).toHaveAttribute('aria-expanded', 'false')
  const again = await openTask(page, 'work-2', 'Review the report pane')
  await expect(again.locator('.act-steps')).toContainText('Not confirmed whether it was recorded.')
})

test('codex · F-019 · past its expiry, a decision calls no one: the pill says it expired, never “for you”', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&expired=1`)
  await expect(pill(page)).toHaveText(/^1 decision expired/, { timeout: 15_000 })
  await expect(pill(page)).not.toHaveAttribute('data-mine')
  // Expiring while the page is open: his to answer, then, past its expiry, only read.
  await paused(page, `${PAGE}?viewer=davide&expired=soon`)
  await expect(pill(page)).toHaveText(/^1 decision for you/, { timeout: 15_000 })
  await expect(pill(page)).toHaveAttribute('data-mine', 'true')
  await page.clock.runFor(31_000)
  await expect(pill(page)).toHaveText(/^1 decision expired/)
  await expect(pill(page)).not.toHaveAttribute('data-mine')
  await expect(board(page).getByRole('region', { name: 'Davide decides' })).toContainText('expired')
})

// ---- CX-0017 (Codex on #74; GitHub 4179628491, 4179628493). ----

test('codex · F-020 · complete with evidence, but its check of this version not passed: not Complete, and said why', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=unpassed`)
  await expect(board(page)).toBeVisible({ timeout: 15_000 })
  const complete = await titles(lane(page, 'Complete'))
  for (const [id, name, why, review] of [
    ['work-1', 'Implement the PDF retry', 'is still pending', 'Review pending'],
    ['work-2', 'Review the report pane', 'found changes needed', 'Review found changes needed'],
    ['work-3', 'Write the export’s release note', 'was inconclusive', 'Review inconclusive'],
  ] as const) {
    expect(complete).not.toContain(name)
    await expect(tile(page, id).locator('.task-chip')).toHaveText('Not shown as complete')
    const sheet = await openTask(page, id, name)
    await expect(sheet.locator('.task-sheet-detail')).toHaveText(`Its check of the version it holds now ${why}.`)
    await expect(sheet.locator('.task-result-review')).toHaveText(review)
    await page.keyboard.press('Escape')
  }
})

test('codex · F-021 · with no command port, what was sent stays said and followed; nothing new goes, nor again', async ({
  page,
}) => {
  const unsendable = 'Nothing can be sent from here now. What was sent is still followed as its receipts come.'
  await page.goto(`${PAGE}?viewer=davide&admission=slow`) // a receipt only after 7 s
  const sheet = await openTask(page, 'work-2', 'Review the report pane')
  await stopIn(sheet)
  const steps = sheet.locator('.act-steps')
  await expect(steps).toContainText('Sending…')
  await page.evaluate(() => window.workFixture?.commandPort?.(false))
  await expect(sheet.locator('.session-acts .act-note')).toHaveText(unsendable)
  await expect(steps).toContainText('Sending…') // still said
  await expect(sheet.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: /^Hold/ })).toHaveCount(0)
  // Its receipts land meanwhile, from the port it went through.
  await expect(steps).toContainText('Stop requested; waiting for the runtime to confirm.', { timeout: 15_000 })
  await page.evaluate(() => window.workFixture?.commandPort?.(true))
  await expect(sheet.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  await expect(steps).toContainText('Stop requested; waiting for the runtime to confirm.')
  expect(await commanded(page)).toHaveLength(1)
})

test('codex · F-021 · in Resources too: a lost Stop stays said with no port, and isn’t tried again until one is back', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost&attempt=none`)
  await expect(board(page)).toBeVisible({ timeout: 15_000 })
  const worker = await workerInResources(page)
  await stopIn(worker)
  const retry = worker.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeVisible()
  await page.evaluate(() => window.workFixture?.commandPort?.(false))
  await expect(worker.locator('.act-steps')).toContainText(
    'Not confirmed whether it was recorded. It can’t be sent again from here now; it is kept as it was.',
  )
  await expect(retry).toHaveCount(0)
  await expect(worker.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  // Back, the same Stop can be tried again, with its own operation.
  await page.evaluate(() => window.workFixture?.commandPort?.(true))
  await retry.click()
  await expect.poll(async () => (await commanded(page)).length).toBe(2)
  const [first, again] = await commanded(page)
  expect(again).toEqual(first)
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

test('review card · read with the plan in force: once the plan moves on, the card says it reviewed the one before', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&review=material`)
  await reviewPill(page).click()
  await expect(reviewCard(page).getByRole('button', { name: 'Waits on your decision: answer it' })).toBeVisible()
  await expect(reviewCard(page).locator('.review-result-stale')).toHaveCount(0)
  // The lead takes a decision into the plan's next revision; the review stays the one of r2.
  await page.evaluate(() => window.workFixture?.react?.('d1'))
  await expect(page.locator('.plan-next-review')).toHaveText(/· a change proposed · of r2$/)
  await expect(reviewCard(page).locator('.review-result-stale')).toHaveText('Reviewed r2 · the plan is now r3')
  await expect(reviewCard(page).getByRole('button', { name: /answer it/ })).toHaveCount(0)
})

test('review card · on a plan only proposed, the line and the card say the same revision, and nothing is offered', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&review=material`)
  await reviewPill(page).click()
  await expect(reviewCard(page).getByRole('button', { name: 'Challenge' })).toBeVisible() // in force: it can be
  await page.goto(`${PAGE}?viewer=davide&review=material&case=replan&proposed=1`)
  // One reference, the plan in force (none here), for both: the review is said as of r2, never measured against the
  // revision the board shows (Codex F-006).
  await expect(page.locator('.plan-next-review')).toHaveText(/· a change proposed · of r2$/)
  await reviewPill(page).click()
  await expect(reviewCard(page).locator('.review-result-stale')).toHaveText('Reviewed r2 · no plan is in force now')
  await expect(reviewCard(page).getByRole('button', { name: /answer it/ })).toHaveCount(0)
  await expect(reviewCard(page).getByRole('button', { name: 'Challenge' })).toHaveCount(0) // nothing in it runs
})

test('review card · read a moment behind the board, it still offers nothing on a plan only proposed', async ({
  page,
}) => {
  // The review's read still names r2 in force; the board's already shows r2 only proposed. The board decides.
  await page.goto(`${PAGE}?viewer=davide&review=material&case=replan&proposed=1&lag=1`)
  await reviewPill(page).click()
  await expect(reviewCard(page).locator('.review-result-stale')).toHaveCount(0)
  await expect(reviewCard(page)).toContainText('Waits on Davide’s decision.')
  await expect(reviewCard(page).getByRole('button', { name: /answer it/ })).toHaveCount(0)
  await expect(reviewCard(page).getByRole('button', { name: 'Challenge' })).toHaveCount(0)
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
  // WBC-01's words for a recorded choice (the contract's copy); the node is what this check is about.
  await expect(said).toHaveText('Your choice is recorded. The plan is updating.')
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

// ---- CX-0019 (Codex on #74; GitHub 4179798118, 4179798123): nothing sent from a stale read; no answer sent for good. ----

const staleRead =
  'Its live state can’t be read now. What shows is its last read, and may be stale, so nothing is sent from it until it can be read again.'
const unsendable = 'Nothing can be sent from here now. What was sent is still followed as its receipts come.'
const askedNot = 'This plan’s live state can’t be read now, so nothing is asked about it from here until it can be.'
const checking = 'Checking whether your choice was recorded. Do not choose again yet.'
const answeredOf = (page: Page) => page.evaluate(() => window.workFixture?.answered ?? [])
const readAs = (page: Page, coverage: 'complete' | 'unavailable') =>
  page.evaluate((c) => window.workFixture?.coverage?.(c), coverage)

test('codex · F-022 · from a read that may be stale nothing goes: no command, choice, challenge or question', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&coverage=unavailable&review=material`)
  await expect(board(page).locator('.board-notice').first()).toHaveText(staleRead, { timeout: 15_000 })
  // Davide's decision is shown, its choices as words.
  const ask = decides(page, 'Davide')
  await expect(ask).toContainText('Ship it now or Wait for the review')
  await expect(ask.getByRole('button')).toHaveCount(0)
  // The lead's review reads as before, with no Challenge.
  await reviewPill(page).click()
  await expect(reviewCard(page)).toBeVisible()
  await expect(reviewCard(page).getByRole('button', { name: 'Challenge' })).toHaveCount(0)
  // A task's sheet: no Stop, Hold or guidance, and why.
  const sheet = await openTask(page, 'work-2', 'Review the report pane')
  await expect(sheet.locator('.session-acts .act-note')).toHaveText(unsendable)
  await expect(sheet.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: /^Hold/ })).toHaveCount(0)
  await expect(sheet.getByRole('textbox', { name: 'Guidance for its session' })).toHaveCount(0)
  expect(await commanded(page)).toEqual([])
  expect(await answeredOf(page)).toEqual([])
  expect(await challengesOf(page)).toEqual([])
})

test('codex · F-022 · from a read that may be stale a question is kept with why, and goes nowhere; a result still reads', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=defects&coverage=unavailable`)
  const retry = await openTask(page, 'work-1', 'Implement the PDF retry')
  await retry.getByRole('button', { name: /\?$/ }).first().click() // a question its state invites
  await expect(retry.locator('.ask-none')).toContainText(askedNot)
  expect(await questioned(page)).toEqual([])
  await page.keyboard.press('Escape')
  const review = await openTask(page, 'work-1-review', 'Review the retry’s candidate')
  await review.getByRole('button', { name: 'Open result' }).click()
  await expect(review.locator('.task-result-text')).toContainText('Changes needed before it ships.')
})

test('codex · F-022 · what was sent before the read went stale stays said, its replies landing; read again, it goes', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&admission=slow&unknown=1`) // a Stop's receipt after 7 s; a choice unknown
  const ask = decides(page, 'Davide')
  await ask.getByRole('button', { name: 'Ship it now' }).click()
  await page.clock.runFor(300)
  await expect(ask.getByRole('status')).toHaveText(checking)
  const sheet = await openTask(page, 'work-2', 'Review the report pane')
  await stopIn(sheet)
  await expect(sheet.locator('.act-steps')).toContainText('Sending…')
  await page.keyboard.press('Escape')
  const retry = await openTask(page, 'work-1', 'Implement the PDF retry')
  await retry.getByRole('button', { name: 'Why is it waiting?' }).click()
  // The read goes stale now; the answer comes from 900 ms, and lands.
  await readAs(page, 'unavailable')
  await expect(board(page).locator('.board-notice').first()).toHaveText(staleRead)
  await page.clock.runFor(2_000)
  await expect(retry.locator('.ask-a')).toContainText('It goes on as soon as Davide answers it in Claude Code.')
  await page.keyboard.press('Escape')
  // The Stop is still said, nothing offered, and its receipts land.
  const stopped = await openTask(page, 'work-2', 'Review the report pane')
  const steps = stopped.locator('.act-steps')
  await expect(steps).toContainText('Sending…')
  await expect(stopped.locator('.session-acts .act-note')).toHaveText(unsendable)
  await expect(stopped.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  await page.clock.runFor(10_000)
  await expect(steps).toContainText('Stop requested; waiting for the runtime to confirm.')
  await page.keyboard.press('Escape')
  // The choice is still said, and can't be sent again from here.
  await expect(ask.getByRole('status')).toHaveText(checking)
  await expect(ask.getByRole('button')).toHaveCount(0)
  // Read again: the same choice goes again, as its own operation; Stop is offered, with one sent in all.
  await readAs(page, 'complete')
  await expect(board(page).locator('.board-notice')).not.toContainText([staleRead])
  await ask.getByRole('button', { name: 'Ship it now' }).click()
  await expect.poll(async () => (await answeredOf(page)).length).toBe(2)
  const [first, again] = await answeredOf(page)
  expect(again).toEqual(first)
  const back = await openTask(page, 'work-2', 'Review the report pane')
  await expect(back.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  expect(await commanded(page)).toHaveLength(1)
})

test('codex · F-023 · a choice with no reply is not confirmed at the write limit; only it goes again, as its operation', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&decide=silent`)
  const ask = decides(page, 'Davide')
  const status = ask.getByRole('status')
  const ship = ask.getByRole('button', { name: 'Ship it now' })
  const wait = ask.getByRole('button', { name: 'Wait for the review' })
  await ship.click()
  await expect(status).toHaveText('Sending your choice…')
  await expect(ship).toBeDisabled()
  await expect(wait).toBeDisabled()
  await page.clock.runFor(89_000)
  await expect(status).toHaveText('Sending your choice…')
  await page.clock.runFor(1_000) // 90 s: the Studio's limit for a write
  await expect(status).toHaveText(checking)
  await expect(ship).toBeEnabled()
  await expect(wait).toBeDisabled() // another choice waits until this one is known
  // Sent again, the same; closed meanwhile, its wait goes on, and ends the same way.
  await ship.click()
  await expect(status).toHaveText('Sending your choice…')
  await pill(page).click()
  await expect(ask).toHaveCount(0)
  await page.clock.runFor(90_000)
  await pill(page).click()
  await expect(status).toHaveText(checking)
  const sent = await answeredOf(page)
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0]) // the same choice, as the same operation
})

test('codex · F-023 · the first send’s late reply changes nothing while the same choice goes again, the board left and back', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&decide=late`) // the first reply comes at 120 s, each next 40 s after it
  const ask = decides(page, 'Davide')
  const status = ask.getByRole('status')
  await ask.getByRole('button', { name: 'Ship it now' }).click()
  await page.clock.runFor(90_000)
  await expect(status).toHaveText(checking)
  await ask.getByRole('button', { name: 'Ship it now' }).click() // 90 s: sent again, recorded at 130 s
  await expect(status).toHaveText('Sending your choice…')
  // Away in Resources, the board gone: at 120 s the first send's reply comes, "not confirmed", late.
  await views(page).getByRole('link', { name: 'Resources', exact: true }).click()
  await expect(board(page)).toHaveCount(0)
  await page.clock.runFor(35_000)
  // Back at 125 s, the board anew: still the second send, waiting; then its own reply.
  await views(page).getByRole('link', { name: 'Tasks', exact: true }).click()
  await expect(status).toHaveText('Sending your choice…')
  await page.clock.runFor(5_000)
  await expect(status).toHaveText('Your choice is recorded. The plan is updating.')
  await expect(ask.getByRole('button', { name: 'Wait for the review' })).toBeDisabled()
  const sent = await answeredOf(page)
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0])
})

// ---- CX-0021 (Codex on #74): a challenge sent before the read went stale stays said, its receipt landing. ----

const reason = 'The renderer’s host is shared with the exports.'
const challengeSaid = (page: Page) => reviewCard(page).locator('.review-challenge [role="status"]')

test('codex · F-024 · a challenge sent before the read went stale stays said, its late receipt landing; sent once', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&review=material`) // its receipt comes 300 ms after it is sent
  await reviewPill(page).click()
  await reviewCard(page).getByRole('button', { name: 'Challenge' }).click()
  await challengeField(page).fill(reason)
  await reviewCard(page).getByRole('button', { name: 'Send' }).click()
  await expect(challengeSaid(page)).toHaveText('Sending your challenge…')
  // The read goes stale while it is on its way: its words and its status stay, with nothing to send.
  await readAs(page, 'unavailable')
  await expect(board(page).locator('.board-notice').first()).toHaveText(staleRead)
  await expect(reviewCard(page).locator('.review-challenge-quote')).toHaveText(reason)
  await expect(challengeSaid(page)).toHaveText('Sending your challenge…')
  await expect(challengeField(page)).toHaveCount(0)
  await expect(reviewCard(page).getByRole('button', { name: /^(Send|Challenge)/ })).toHaveCount(0)
  // Its receipt comes while the read is still stale, and is said.
  await page.clock.runFor(1_000)
  await expect(challengeSaid(page)).toHaveText('Sent to the lead, for its next review.')
  // Read again: the same receipt, nothing sent again.
  await readAs(page, 'complete')
  await expect(board(page).locator('.board-notice')).not.toContainText([staleRead])
  await expect(challengeSaid(page)).toHaveText('Sent to the lead, for its next review.')
  await expect(reviewCard(page).locator('.review-challenge-quote')).toHaveText(reason)
  expect(await challengesOf(page)).toEqual([{ review: 'review-material', text: reason, key: expect.any(String) }])
})

test('codex · F-024 · not confirmed while the read is stale, it is kept, never sent again; read again, the same goes', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&review=material&challenge=unknown`) // the first reply is lost
  await reviewPill(page).click()
  await reviewCard(page).getByRole('button', { name: 'Challenge' }).click()
  await challengeField(page).fill(reason)
  await reviewCard(page).getByRole('button', { name: 'Send' }).click()
  await readAs(page, 'unavailable')
  await page.clock.runFor(1_000)
  const unconfirmed = 'Not confirmed. Sending again repeats the same request.'
  await expect(challengeSaid(page)).toHaveText(unconfirmed)
  await expect(reviewCard(page).locator('.review-challenge .act-note')).toHaveText(
    'It can’t be sent again from here now; it is kept as it was.',
  )
  await expect(reviewCard(page).getByRole('button', { name: 'Send again' })).toHaveCount(0)
  // Luis, looking meanwhile, sees no challenge of Davide's; back as Davide, it is as it was.
  await page.evaluate(() => window.workFixture?.viewAs?.('luis'))
  await reviewPill(page).click()
  await expect(reviewCard(page)).toBeVisible()
  await expect(reviewCard(page).locator('.review-challenge')).toHaveCount(0)
  await page.evaluate(() => window.workFixture?.viewAs?.('davide'))
  await reviewPill(page).click()
  await expect(challengeSaid(page)).toHaveText(unconfirmed)
  // Read again: Send again goes, with the same key and the same words.
  await readAs(page, 'complete')
  await reviewCard(page).getByRole('button', { name: 'Send again' }).click()
  await page.clock.runFor(1_000)
  await expect(challengeSaid(page)).toHaveText('Sent to the lead, for its next review.')
  const sent = await challengesOf(page)
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0])
})

// ---- CX-0023 (Codex on #74; GitHub 4180194401): a send that has ended hears nothing more. ----

test('codex · F-025 · a send past its wait stays failed: its own late answer changes nothing; asked again, the next answers', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&ask=flaky`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  const answer = sheet.locator('.ask-a')
  const none = sheet.locator('.ask-none')
  const again = sheet.getByRole('button', { name: 'Ask again' })
  await sheet.getByRole('button', { name: 'Why is it waiting?' }).click()
  await page.clock.runFor(5_000) // the first send fails, said so
  await again.click() // 5 s: the second send
  await page.clock.runFor(25_000) // 30 s: a part of its answer, then nothing
  await expect(answer).toHaveText(/^It waits\s*$/)
  await page.clock.runFor(30_000) // 60 s: past its wait
  const failed = 'No answer came in time. Nothing was changed.'
  await expect(none).toContainText(failed)
  await expect(again).toBeVisible()
  // 75 s: its own whole answer comes, late. What was said stays, and so does Ask again.
  await page.clock.runFor(16_000)
  await expect(none).toContainText(failed)
  await expect(sheet.getByText('Too late: the second send’s answer.')).toHaveCount(0)
  await expect(answer).not.toContainText('Too late')
  await expect(again).toBeVisible()
  // Asked again: the next send, and its own answer.
  await again.click()
  await page.clock.runFor(20_000)
  await expect(answer).toHaveText('It waits for Davide’s answer, said on the third send.')
  await expect(none).toHaveCount(0)
  const sent = await questioned(page)
  expect(sent).toHaveLength(3)
  expect(new Set(sent.map((q) => JSON.stringify(q))).size).toBe(1)
})

// ---- CX-0025 (Codex on #74; GitHub 4180308536, 4180308543): no grant by order; ids kept whole. ----

const ambiguous = 'Offered here more than once, so it isn’t allowed until the view says it once.'

test('codex · F-026 · a command offered twice is no grant, in either order: nothing offered, said why; once again, it goes', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const sheet = await openTask(page, 'work-2', 'Review the report pane')
  const stop = sheet.getByRole('button', { name: 'Stop', exact: true })
  await expect(stop).toBeVisible() // offered once: as the view says
  for (const [first, second] of [
    ['allowed', 'denied'],
    ['denied', 'allowed'],
    ['allowed', 'allowed'],
  ] as const) {
    await page.evaluate(([a, b]) => window.workFixture?.grantTwice?.('work-2', 'stop', a, b), [first, second] as const)
    await expect(stop).toHaveCount(0)
    await expect(sheet.getByText(`Stop: ${ambiguous}`)).toBeVisible()
    await expect(sheet.getByRole('button', { name: /^Hold/ })).toBeVisible() // offered once, still offered
  }
  expect(await commanded(page)).toEqual([])
  // Said once again: Stop is offered, and goes, once.
  await page.evaluate(() => window.workFixture?.setAvailability?.('work-2', 'stop', 'missing'))
  await page.evaluate(() => window.workFixture?.setAvailability?.('work-2', 'stop', 'allowed'))
  await stopIn(sheet)
  await expect.poll(async () => (await commanded(page)).length).toBe(1)
  expect((await commanded(page))[0]).toMatchObject({ kind: 'stop', target: { work_id: 'work-2' } })
})

test('codex · F-026 · a question or a result offered twice is unavailable, said why; the task still reads', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=defects`)
  await page.evaluate(() => window.workFixture?.grantTwice?.('work-1-review', 'open_result', 'allowed', 'denied'))
  await page.evaluate(() => window.workFixture?.grantTwice?.('work-1-review', 'ask_sophia', 'denied', 'allowed'))
  const sheet = await openTask(page, 'work-1-review', 'Review the retry’s candidate')
  await expect(sheet.getByRole('button', { name: 'Open result' })).toHaveCount(0)
  await expect(sheet.locator('.task-result')).toContainText(ambiguous)
  await expect(sheet.locator('.task-result')).toContainText('findings-v1') // its version still shown
  await sheet.getByRole('textbox', { name: 'Ask Sophia about this task' }).fill('Is it done?')
  await sheet.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(sheet.locator('.ask-none')).toContainText(ambiguous)
  expect(await questioned(page)).toEqual([])
})

const guide = (sheet: Locator) => sheet.getByRole('textbox', { name: 'Guidance for its session' })

test('codex · F-027 · tasks whose ids hold the old separator keep their own drafts and history', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&case=pipes&admission=slow`)
  // A draft for x|y (assignment z) stays x|y's.
  const first = await openTask(page, 'x|y', 'Check the x|y export')
  await guide(first).fill('For the x|y export only.')
  await page.keyboard.press('Escape')
  // x (assignment y|z), at the same generation, attempt and session: nothing of it.
  const second = await openTask(page, 'x', 'Check the x export')
  await expect(guide(second)).toHaveValue('')
  await stopIn(second)
  await expect(second.locator('.act-steps')).toContainText('Sending…')
  await page.keyboard.press('Escape')
  // Back on x|y: its own words, none of x's Stop, and Stop still its own to send.
  const again = await openTask(page, 'x|y', 'Check the x|y export')
  await expect(guide(again)).toHaveValue('For the x|y export only.')
  await expect(again.locator('.act-steps')).toHaveCount(0)
  await expect(again.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  await again.getByRole('button', { name: /^Send/ }).click()
  await expect.poll(async () => (await commanded(page)).length).toBe(2)
  const [stopped, guided] = await commanded(page)
  expect(stopped?.target).toMatchObject({ work_id: 'x', assignment_id: 'y|z' })
  expect(guided).toMatchObject({
    kind: 'guidance',
    text: 'For the x|y export only.',
    target: { work_id: 'x|y', assignment_id: 'z' },
  })
})

// ---- CX-0026 (Codex on #74; GitHub 4180347593, 4180347601): one key per choice; a decision's task from its own plan. ----

test('codex · F-028 · a decision two of whose choices share a key is refused with its view: nothing drawn, nothing sent', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=same-key`)
  const why = '$.goals[0].decisions[0].choices: each choice its own key'
  await expect(page.getByRole('alert')).toContainText(why, { timeout: 15_000 })
  await expect(board(page)).toHaveCount(0)
  expect(await answeredOf(page)).toEqual([])
})

test('codex · F-029 · a decision names its task from the plan it is bound to, or says which plan; never the one shown', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=rebound`)
  const about = (id: string) => board(page).locator(`[data-decision="${id}"] .plan-ask-about`)
  // Bound to the plan shown: its task as that plan names it.
  await expect(about('d1')).toHaveText('About Implement the PDF retry', { timeout: 15_000 })
  // Bound to plan-1-alt r4, which keeps work-2's id for a new task: that task, not the one shown under the id.
  await expect(about('d-alt')).toHaveText('About Rebuild the report pane from its sources')
  // Bound to a revision held nowhere here: which plan, and no task's words borrowed.
  await expect(about('d-r9')).toHaveText('About work-1, in plan r9, not shown here')
  // Its decider still answers it, bound as it is.
  await board(page).locator('[data-decision="d-alt"]').getByRole('button', { name: 'Ship it now' }).click()
  await expect.poll(async () => (await answeredOf(page)).length).toBe(1)
  expect((await answeredOf(page))[0]).toMatchObject({
    decision_id: 'd-alt',
    work_id: 'work-2',
    plan_id: 'plan-1-alt',
    plan_revision: 4,
    choice: 'ship',
  })
})

// ---- CX-0027 (Codex on #74; GitHub 4180471004): an accepted decision names its choice. ----

test('codex · F-032 · a decision said accepted with no choice of its own is refused with its view, never “chose one”', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=unchosen`)
  await expect(page.getByRole('alert')).toContainText(
    '$.goals[0].decisions[0].selected_choice: an accepted decision names one of its choices',
    { timeout: 15_000 },
  )
  await expect(board(page)).toHaveCount(0)
  await expect(page.getByText('chose one')).toHaveCount(0)
  // Accepted with its own choice, the board reads it as made (UI-14's case).
  await page.goto(`${PAGE}?case=reacting`)
  await expect(board(page)).toBeVisible({ timeout: 15_000 })
})

// ---- CX-0029 (Codex on #74; GitHub 4180579675, 4180579679, 4180579681): looks and decisions, each its own. ----

test('codex · F-034 · a look kept under the old joined key is left as it is: never read here, never moved or deleted', async ({
  page,
}) => {
  const fresh =
    'sophia.plan.seen.v3:["00000000-0000-4000-8000-0000000000aa","00000000-0000-4000-8000-0000000000b1","plan-1","davide"]'
  const old =
    'sophia.plan.seen.v2.00000000-0000-4000-8000-0000000000aa.00000000-0000-4000-8000-0000000000b1.plan-1.davide'
  // An old look for this very plan, taken before anything was: read as this one's, it would say everything arrived.
  await page.addInitScript(
    ({ key }) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, JSON.stringify({ items: {}, decisions: {} }))
        sessionStorage.setItem('seeded', '1')
      }
    },
    { key: old },
  )
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(board(page)).toBeVisible({ timeout: 15_000 })
  // A first visit here: nothing said changed, and its look kept under the whole-field key.
  await expect(board(page).locator('.board-return')).toHaveCount(0)
  const kept = await page.evaluate(({ whole, joined }) => [localStorage.getItem(whole), localStorage.getItem(joined)], {
    whole: fresh,
    joined: old,
  })
  expect(kept[0]).not.toBeNull()
  expect(kept[1]).toBe(JSON.stringify({ items: {}, decisions: {} })) // the old one as it was
  // Another viewer's look is another: Luis starts afresh too, Davide's kept.
  await page.evaluate(() => window.workFixture?.viewAs?.('luis'))
  await expect(board(page).locator('.board-return')).toHaveCount(0)
})

test('codex · F-035 · two decisions with one id at one revision are refused with their view: nothing drawn', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=twice-asked`)
  await expect(page.getByRole('alert')).toContainText('another decision has this id at this revision', {
    timeout: 15_000,
  })
  await expect(board(page)).toHaveCount(0)
  expect(await answeredOf(page)).toEqual([])
})

test('codex · F-036 · a decision not yet decided that names a choice is refused with its view', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&case=chosen-early`)
  await expect(page.getByRole('alert')).toContainText(
    '$.goals[0].decisions[0].selected_choice: a decision not yet decided names none',
    { timeout: 15_000 },
  )
  await expect(board(page)).toHaveCount(0)
})

// ---- CX-0033 (Codex on #74; GitHub 4180694992, 4180694995, 4180694998): a plan or a decision at its revision. ----

test('codex · F-040 · the review waits on its decision as its latest revision stands, whatever the order', async ({
  page,
}) => {
  const card = reviewCard(page)
  const answer = card.getByRole('button', { name: 'Waits on your decision: answer it' })
  const expired = card.getByText('Its decision expired before it was answered.')
  // An older revision answered, the latest still open, in either order: Davide is asked to answer it.
  for (const c of ['older-first', 'older-last']) {
    await page.goto(`${PAGE}?viewer=davide&review=material&case=${c}`)
    await reviewPill(page).click()
    await expect(answer).toBeVisible({ timeout: 15_000 })
    await expect(expired).toHaveCount(0)
  }
  // The latest answered, an older one still open: nothing to answer, no older revision standing in.
  await page.goto(`${PAGE}?viewer=davide&review=material&case=newer-done`)
  await reviewPill(page).click()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(answer).toHaveCount(0)
  await expect(expired).toHaveCount(0)
  // The latest past its expiry, an older one still open: said expired, not answerable.
  await page.goto(`${PAGE}?viewer=davide&review=material&case=newer-expired`)
  await reviewPill(page).click()
  await expect(expired).toBeVisible({ timeout: 15_000 })
  await expect(answer).toHaveCount(0)
})

test('codex · F-041 · two revisions of one decision decided are two rows, each its own, as they move and go', async ({
  page,
}) => {
  const keyWarnings: string[] = []
  page.on('console', (m) => {
    if (/same key|unique "key"/i.test(m.text())) keyWarnings.push(m.text())
  })
  await page.goto(`${PAGE}?viewer=davide&case=two-accepted`)
  await fold(page).click()
  // d1's two rows (Luis's d2, decided too, is listed beside them).
  const rows = own(page).getByRole('listitem').filter({ hasText: 'Davide chose' })
  const first = /^Ship the retry now, as first asked\?\s+Davide chose Ship it now$/
  const latest = /Davide chose Wait for the review$/
  await expect(rows).toHaveText([first, latest], { timeout: 15_000 })
  await page.evaluate(() => window.workFixture?.reverseDecisions?.())
  await expect(rows).toHaveText([latest, first])
  await page.evaluate(() => window.workFixture?.dropDecision?.('d1', 3))
  await expect(rows).toHaveText([latest])
  expect(keyWarnings).toEqual([])
})

// ---- CX-0035 (Codex on #74; GitHub 4180785541, 4180785544): one id per version of an item, and per goal. ----

test('codex · F-042 · two versions of a task with one id are refused with their view: never certified Complete', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=same-version`)
  await expect(page.getByRole('alert')).toContainText('.candidates: each version its own id', { timeout: 15_000 })
  await expect(board(page)).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Complete', exact: true })).toHaveCount(0)
  // Two distinct versions both current (F-009's case) stay on the board, not Complete.
  await page.goto(`${PAGE}?viewer=davide&case=two-current`)
  await expect(tile(page, 'work-1')).toBeVisible({ timeout: 15_000 })
  expect(await titles(lane(page, 'Complete'))).not.toContain('Implement the PDF retry')
})

test('codex · F-043 · two goals with one id are refused with their view: neither drawn, none dropped', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&twin=1`)
  await expect(page.getByRole('alert')).toContainText('$.goals[1]: another goal has this id', { timeout: 15_000 })
  await expect(board(page)).toHaveCount(0)
})

// ---- CX-0039 (Codex; GitHub 4183052368): work outside the plan observed twice, listed once. ----

/** A work id listed once in `list`, said observed more than once, with no lifecycle of either observation. */
const listedOnceUnknown = async (list: Locator, id: string) => {
  const row = list.locator(`[data-work="${id}"]`)
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(`Observed more than once · ${id}`)
  await expect(row).toContainText('which is current isn’t known')
  await expect(row).not.toContainText(/running|planned/)
}

test('codex · F-045 · work outside the plan observed twice is listed once, said ambiguous; with no plan in force too', async ({
  page,
}) => {
  const keyWarnings: string[] = []
  page.on('console', (m) => {
    if (/same key|unique "key"/i.test(m.text())) keyWarnings.push(m.text())
  })
  await page.goto(`${PAGE}?viewer=davide&case=outside-twice`)
  const outside = board(page).getByRole('region', { name: 'Observed outside the plan' })
  await expect(outside.locator('[data-work]')).toHaveCount(3, { timeout: 15_000 })
  await listedOnceUnknown(outside, 'work-old') // running and planned
  await listedOnceUnknown(outside, 'work-same') // the same, twice
  await expect(outside.locator('[data-work="work-extra"]')).toContainText('Davide’s Claude Code · work-extra')
  await expect(outside.locator('[data-work="work-extra"]')).toContainText('running')
  const notice = board(page).locator('.board-notice')
  await expect(notice).toContainText('A task is observed twice')
  await expect(notice).toContainText('3 observed tasks aren’t in the plan in force')
  // No plan in force: the same rule, the count of distinct tasks, and why.
  await page.goto(`${PAGE}?viewer=davide&case=no-plan-twice`)
  const none = page.getByRole('region', { name: 'No plan in force' })
  await expect(none.locator('.board-notice').first()).toHaveText(
    'This goal has no plan in force, but 3 of its tasks are observed.',
    { timeout: 15_000 },
  )
  await expect(none).toContainText('A task is observed twice: which of its observations is current isn’t known.')
  await expect(none.locator('[data-work]')).toHaveCount(3)
  await listedOnceUnknown(none, 'work-old')
  await listedOnceUnknown(none, 'work-same')
  await expect(none.locator('[data-work="work-extra"]')).toContainText('running')
  expect(keyWarnings).toEqual([])
})

// ---- CX-0041 (Codex; GitHub 4183258509, 4183258514): an empty answer is no answer; a plan in its slot. ----

test('codex · F-046 · an answer that comes back empty is said so, never left Thinking; asked again, it answers', async ({
  page,
}) => {
  await paused(page, `${PAGE}?viewer=davide&ask=empty`)
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  await sheet.getByRole('button', { name: 'Why is it waiting?' }).click()
  await page.clock.runFor(1_000) // its first send completes with no words at 900 ms
  await expect(sheet.locator('.ask-none')).toContainText('Her answer came back empty. Nothing was changed.')
  await expect(sheet.getByText('Thinking…')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Ask again' }).click()
  await page.clock.runFor(2_000)
  await expect(sheet.locator('.ask-a')).toContainText('It goes on as soon as Davide answers it in Claude Code.')
  await expect(sheet.locator('.ask-none')).toHaveCount(0)
  const sent = await questioned(page)
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0])
})

test('codex · F-047 · a plan in force only proposed, or a proposal accepted, is refused with its view', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&case=proposed-in-force`)
  await expect(page.getByRole('alert')).toContainText("current_plan.state: the plan in force isn't one only proposed", {
    timeout: 15_000,
  })
  await expect(board(page)).toHaveCount(0)
  await page.goto(`${PAGE}?viewer=davide&case=accepted-proposal`)
  await expect(page.getByRole('alert')).toContainText("proposed_plans[0].state: a proposal isn't a plan accepted", {
    timeout: 15_000,
  })
  await expect(board(page)).toHaveCount(0)
})

// ---- CX-0043 (Codex on #74; F-048, F-049): a decision at its latest revision; each wait of a task once. ----

/** The decisions open over the lanes: not the plan's own choices being taken in. */
const asked = (page: Page) => board(page).locator('.board-decisions:not(.board-decided) .plan-ask')

test('codex · F-048 · only a decision’s latest revision is asked; its older one, ended or not, never comes back', async ({
  page,
}) => {
  const latest = 'Ship the retry before the report pane’s review is done?'
  const first = 'Ship the retry now, as first asked?'
  // Both revisions proposed, in either order: the latest alone is asked, opened for Davide; one decision in the pill.
  await page.goto(`${PAGE}?viewer=davide&case=twice-open`)
  for (const reversed of [false, true]) {
    if (reversed) await page.evaluate(() => window.workFixture?.reverseDecisions?.())
    await expect(pill(page)).toHaveText(/^1 decision for you/, { timeout: 15_000 })
    await expect(pill(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(asked(page)).toHaveCount(1)
    await expect(asked(page)).toContainText(latest)
    await expect(board(page).getByText(first)).toHaveCount(0)
  }
  // The latest ended, however, in either order: nothing open or calling; the older one, still proposed, isn't back.
  for (const state of ['accepted', 'declined', 'expired', 'superseded'] as const) {
    for (const reversed of [false, true]) {
      await page.goto(`${PAGE}?viewer=davide&case=twice-open`)
      await expect(asked(page)).toHaveCount(1, { timeout: 15_000 })
      if (reversed) await page.evaluate(() => window.workFixture?.reverseDecisions?.())
      await page.evaluate((s) => window.workFixture?.endDecision?.('d1', 4, s), state)
      await expect(pill(page), state).toHaveCount(0)
      await expect(asked(page), state).toHaveCount(0)
      await expect(board(page).locator('.plan-ask[data-mine]'), state).toHaveCount(0)
      await expect(board(page).getByText(first), state).toHaveCount(0)
    }
  }
  // Closed by Davide, a revision arriving opens it again by itself: the new one alone, the older ones history.
  await page.goto(`${PAGE}?viewer=davide&case=twice-open`)
  await expect(asked(page)).toHaveCount(1, { timeout: 15_000 })
  await pill(page).click()
  await expect(asked(page)).toHaveCount(0)
  await page.evaluate(() => window.workFixture?.reviseDecision?.('d1'))
  await expect(pill(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(asked(page)).toHaveCount(1)
  await expect(asked(page)).toContainText(`${latest} (revised)`)
  // Another decision is its own: asked beside it.
  await page.evaluate(() => window.workFixture?.decisionArrives?.('davide'))
  await expect(pill(page)).toHaveText(/^2 decisions for you/)
  await expect(asked(page)).toHaveCount(2)
})

test('codex · F-049 · a task waiting twice on one kind and reference is refused; waits apart are each read', async ({
  page,
}) => {
  const keyWarnings: string[] = []
  page.on('console', (m) => {
    if (/same key|unique "key"/i.test(m.text())) keyWarnings.push(m.text())
  })
  // Its one permission, Luis's and then Davide's: the view is refused, never said by whichever comes first.
  await page.goto(`${PAGE}?viewer=davide&case=twice-waiting`)
  await expect(page.getByRole('alert')).toContainText(
    'waiting_on[1]: another wait of this task has this kind and reference',
    { timeout: 15_000 },
  )
  await expect(board(page)).toHaveCount(0)
  // One reference under two kinds, references holding a joined key's separators, the same wait on another task: read.
  await page.goto(`${PAGE}?viewer=davide&case=waits-apart`)
  await expect(tile(page, 'work-2').locator('.task-chip')).toHaveText('Waiting on you', { timeout: 15_000 })
  await expect(tile(page, 'work-1').locator('.task-chip')).toHaveText('Waiting on you')
  const sheet = await openTask(page, 'work-1', 'Implement the PDF retry')
  const waits = sheet.locator('.task-waits li')
  await expect(waits).toHaveText([
    /Run the report’s tests \(action:1\)\.\s*You answer it$/,
    /Choose the limit \(action:1\)\.\s*Luis answers it$/,
    /Edit the export config \(action","1\)\.\s*Luis answers it$/,
    /Open the report pane \(action\)\.\s*You answer it$/,
  ])
  expect(keyWarnings).toEqual([])
})

// ---- WBC-02 (Codex on #107, r4206591778): Review sources keeps a selection within what a review reads. ----

test('codex · #107 · sources over a review’s limit together are said so and propose nothing; within it, they may', async ({
  page,
}) => {
  await page.goto(`${PAGE}?served=1`)
  await page.getByRole('button', { name: 'Review sources' }).first().click()
  const form = page.getByRole('form', { name: 'Review sources' })
  const pick = (label: string) => form.getByRole('checkbox', { name: label })
  const propose = form.getByRole('button', { name: 'Propose review' })
  const over = form.getByRole('status').filter({ hasText: 'a review reads at most' })
  // Two report versions, each within the limit, hold more than it together.
  await pick('Launch brief v3').check()
  await pick('Risk register v5').check()
  await expect(over).toHaveText(
    'These sources hold 35.2 KiB of text; a review reads at most 32 KiB. Choose fewer or shorter sources.',
  )
  await expect(propose).toBeDisabled()
  // Enter in a field sends nothing either: a proposal would be a request this page doesn't answer (afterEach).
  await form.getByLabel('Purpose (optional)').press('Enter')
  await expect(form.getByRole('alert')).toHaveCount(0)
  // One deselected, another chosen: exactly at the limit, it may be proposed.
  await pick('Risk register v5').uncheck()
  await pick('Press plan v2').check()
  await expect(over).toHaveCount(0)
  await expect(propose).toBeEnabled()
  // A third, of one byte: over by one, said as more than the limit.
  await pick('Budget note v1').check()
  await expect(over).toContainText('These sources hold 32.1 KiB of text')
  await expect(propose).toBeDisabled()
  // Deselected again: back within it.
  await pick('Budget note v1').uncheck()
  await expect(over).toHaveCount(0)
  await expect(propose).toBeEnabled()
})

test('codex · #107 · a cap below a cent, or between cents, starts the allowance there and the form may be sent', async ({
  page,
}) => {
  for (const cap of ['0.005', '0.015']) {
    await page.goto(`${PAGE}?served=1&cap=${cap}`)
    await page.getByRole('button', { name: 'Review sources' }).first().click()
    const form = page.getByRole('form', { name: 'Review sources' })
    const allowance = form.getByLabel(`Allowance, USD (at most ${cap})`)
    const propose = form.getByRole('button', { name: 'Propose review' })
    await form.getByRole('checkbox', { name: 'Press plan v2' }).check()
    await expect(allowance).toHaveValue(cap)
    await expect(propose).toBeEnabled()
    // The browser's own validation takes it too, so Propose review is not a button that sends nothing.
    expect(await form.evaluate((f) => f instanceof HTMLFormElement && f.checkValidity())).toBe(true)
    // Finer than Sophia keeps: the field and the form agree that it may not be sent.
    await allowance.fill('0.0000015')
    await expect(propose).toBeDisabled()
    await expect(allowance).toHaveAttribute('aria-invalid', 'true')
    expect(await form.evaluate((f) => f instanceof HTMLFormElement && f.checkValidity())).toBe(false)
    await allowance.fill('0.000001')
    await expect(propose).toBeEnabled()
    expect(await form.evaluate((f) => f instanceof HTMLFormElement && f.checkValidity())).toBe(true)
  }
})
