import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// Conversations: decide here (docs/plans/conversations-decide.md, C7). A proposal waiting is accepted or put off in the
// context, at the revision read; a message is proposed as a decision from the thread. The brief's own writes (A08), as
// the fixture answers them; only the API is faked.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&demo=1'
const context = (page: Page) => page.locator('.conv-context')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const stillOpen = (page: Page) => context(page).locator('.conv-decisions.open')

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** The bodies of the writes that reached the brief at a path ending so: the page's fetch is faked, none leaves it. */
const writes = (page: Page, ending: string) =>
  page.evaluate(
    (end) => (window.fixture?.missionWrites ?? []).filter((w) => w.path.endsWith(end)).map((w) => w.body),
    ending,
  )

async function enter(page: Page, url = PAGE) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(url)
  await expect(stillOpen(page)).toContainText('Map first, list second')
}

/** Another conversation opened, then the one titled `back` again: its messages are mounted anew. */
async function away(page: Page, back: string) {
  const rows = page.getByRole('region', { name: 'All conversations' }).getByRole('button')
  await rows.filter({ hasText: 'Short or long briefs?' }).click()
  await expect(open(page).getByRole('heading').first()).toHaveText('Short or long briefs?')
  await rows.filter({ hasText: back }).click()
  await expect(open(page).getByRole('heading').first()).toHaveText(back)
}

test('decide · «Accept» in Still open makes it an accepted decision, at the revision read', async ({ page }) => {
  await enter(page)
  await stillOpen(page).getByRole('button', { name: 'Accept' }).click()
  await expect.poll(() => writes(page, '/decision')).toEqual([{ decision: 'accept', expectedRevision: 1 }])
  await expect(context(page).locator('.conv-decisions:not(.open) li').first()).toHaveText('Map first, list second')
  await expect(context(page).getByText('Nothing waits for a decision.')).toBeVisible()
  await expect(context(page).getByRole('status')).toHaveText('Accepted: Map first, list second')
  // The press answered is gone with its line: the focus is on what it says, not lost.
  await expect(context(page).getByRole('status')).toBeFocused()
})

test('decide · «Decline» takes it out of Still open, and nothing is accepted', async ({ page }) => {
  await enter(page)
  await stillOpen(page).getByRole('button', { name: 'Decline' }).click()
  await expect(context(page).getByText('Nothing waits for a decision.')).toBeVisible()
  await expect(context(page).locator('.conv-decisions:not(.open)')).not.toContainText('Map first, list second')
})

test('decide · someone decided first: the context says so and shows the brief as it is now', async ({ page }) => {
  await enter(page, `${PAGE}&decide=stale`)
  // Its words wait for the brief read again: never «the brief changed» from the brief as it was.
  await page.evaluate(() => window.fixture?.holdMission(true))
  await stillOpen(page).getByRole('button', { name: 'Accept' }).click()
  // The 409 is answered at once; half a second on, its words still wait for the read again.
  await expect.poll(() => writes(page, '/decision')).toHaveLength(1)
  await page.waitForTimeout(500)
  expect(await context(page).getByRole('status').textContent()).toBe('Accepting…')
  await page.evaluate(() => window.fixture?.holdMission(false))
  await expect(context(page).getByRole('status')).toHaveText(
    'Someone decided it first. This is the brief as it is now.',
  )
  // Read again: no longer waiting, among the accepted decisions, as whoever decided it left it.
  await expect(context(page).getByText('Nothing waits for a decision.')).toBeVisible()
  await expect(context(page).locator('.conv-decisions:not(.open) li').first()).toHaveText('Map first, list second')
  // The press it was on is gone: the focus is on what was said.
  await expect(context(page).getByRole('status')).toBeFocused()
})

test('decide · refused while it still waits: it says the brief changed, not that someone decided', async ({ page }) => {
  await enter(page, `${PAGE}&decide=replaced`)
  const accept = stillOpen(page).getByRole('button', { name: 'Accept' })
  await accept.click()
  await expect(context(page).getByRole('status')).toHaveText(
    'It can’t be decided as it is: the brief changed since. This is the brief as it is now.',
  )
  await expect(context(page).getByRole('status')).toBeFocused()
  // Still waiting, undecided, as the API leaves it: it can still be declined.
  await expect(stillOpen(page)).toContainText('Map first, list second')
  await expect(accept).not.toHaveAttribute('aria-disabled')
})

test('decide · while a decision goes it says «Accepting…», and both presses wait, drawn so', async ({ page }) => {
  await enter(page, `${PAGE}&decide=slow`)
  const accept = stillOpen(page).getByRole('button', { name: 'Accept' })
  const decline = stillOpen(page).getByRole('button', { name: 'Decline' })
  await accept.click()
  await expect(context(page).getByRole('status')).toHaveText('Accepting…')
  for (const press of [accept, decline]) {
    await expect(press).toHaveAttribute('aria-disabled', 'true')
    expect(await press.evaluate((b) => getComputedStyle(b).opacity)).toBe('0.45')
  }
  await decline.click({ force: true }) // waiting: nothing more is sent
  // Gone to write meanwhile: the answer takes no focus from there.
  const composer = open(page).getByRole('textbox', { name: 'Continue this question with the team' })
  await composer.focus()
  await expect(context(page).getByRole('status')).toHaveText('Accepted: Map first, list second')
  await expect(composer).toBeFocused()
  expect(await writes(page, '/decision')).toEqual([{ decision: 'accept', expectedRevision: 1 }])
})

test('decide · answered, it is said once the brief is read again; meanwhile its presses wait', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.holdMission(true))
  const accept = stillOpen(page).getByRole('button', { name: 'Accept' })
  await accept.click()
  await expect.poll(() => writes(page, '/decision')).toHaveLength(1)
  await expect(context(page).getByRole('status')).toHaveText('Accepting…')
  await expect(accept).toHaveAttribute('aria-disabled', 'true')
  await accept.click({ force: true }) // a press sends nothing
  await page.evaluate(() => window.fixture?.holdMission(false))
  await expect(context(page).getByRole('status')).toHaveText('Accepted: Map first, list second')
  await expect(context(page).getByText('Nothing waits for a decision.')).toBeVisible()
  expect(await writes(page, '/decision')).toHaveLength(1)
})

test('decide · answered but the brief can’t be read again: its presses wait until a read no longer lists it', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.failMission(true))
  const accept = stillOpen(page).getByRole('button', { name: 'Accept' })
  await accept.click()
  await expect(context(page).getByRole('status')).toHaveText('Accepted: Map first, list second')
  // Still listed as the last read had it, said as possibly out of date; its presses wait, and send nothing.
  await expect(context(page).getByText('This may be out of date.')).toBeVisible()
  await expect(accept).toHaveAttribute('aria-disabled', 'true')
  await accept.click({ force: true })
  expect(await writes(page, '/decision')).toHaveLength(1)
  await page.evaluate(() => window.fixture?.failMission(false))
  await context(page).getByRole('button', { name: 'Try again' }).click()
  await expect(context(page).getByText('Nothing waits for a decision.')).toBeVisible()
})

test('decide · with no reply, a trip to Goals and back: the decision is still held, sent again under its key', async ({
  page,
}) => {
  await enter(page, `${PAGE}&decide=lost`)
  await stillOpen(page).getByRole('button', { name: 'Accept' }).click()
  const status = context(page).getByRole('status')
  await expect(status).toHaveText('Not confirmed: Accepted: Map first, list second. Try again')
  // To another view and back: the pane is mounted anew, and the decision with no reply is still the one held.
  const views = page.getByRole('navigation', { name: 'Project views' })
  await views.getByRole('link', { name: 'Goals' }).click()
  await expect(page.getByRole('heading', { name: 'Goals', level: 2 })).toBeVisible()
  await views.getByRole('link', { name: 'Conversations' }).click()
  await expect(status).toHaveText('Not confirmed: Accepted: Map first, list second. Try again')
  // Sent again under its key: the first one's receipt answers it (a new key would find nothing left to decide).
  await status.getByRole('button', { name: 'Try again' }).click()
  await expect(status).toHaveText('Accepted: Map first, list second')
  expect(await writes(page, '/decision')).toHaveLength(2)
})

test('decide · refused while the person is away: back, it says what the brief read again says', async ({ page }) => {
  await enter(page, `${PAGE}&decide=stale-late`)
  await stillOpen(page).getByRole('button', { name: 'Accept' }).click()
  const views = page.getByRole('navigation', { name: 'Project views' })
  await views.getByRole('link', { name: 'Goals' }).click()
  await expect(page.getByRole('heading', { name: 'Goals', level: 2 })).toBeVisible()
  // The refusal comes back (3 s) while no pane shows the brief: the brief is read again all the same.
  await page.waitForTimeout(3500)
  await views.getByRole('link', { name: 'Conversations' }).click()
  await expect(context(page).getByRole('status')).toHaveText(
    'Someone decided it first. This is the brief as it is now.',
  )
})

test('decide · a message proposed as a decision: its words in, sent as a constraint, then in Still open', async ({
  page,
}) => {
  await enter(page)
  await page
    .getByRole('region', { name: 'All conversations' })
    .getByRole('button', { name: /Short or long briefs/ })
    .click()
  const marco = open(page).locator('.conv-messages > li').filter({ hasText: 'Anything longer, nobody reads.' })
  await marco.hover()
  await marco.getByRole('button', { name: 'Propose as decision' }).click()
  const field = open(page).getByRole('textbox', { name: 'Decision to propose' })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('One page. Anything longer, nobody reads.')
  await field.fill('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect
    .poll(() => writes(page, '/mission/proposals'))
    .toEqual([{ kind: 'constraint', statement: 'Briefs stay on one page' }])
  await expect(stillOpen(page)).toContainText('Briefs stay on one page')
  await expect(marco.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  // Back on its press, the focus where the form was opened from.
  await expect(marco.getByRole('button', { name: 'Propose as decision' })).toBeFocused()
})

/** Marco's message in «Short or long briefs?», proposed as «Briefs stay on one page». */
async function proposeMarco(page: Page) {
  await page
    .getByRole('region', { name: 'All conversations' })
    .getByRole('button', { name: /Short or long briefs/ })
    .click()
  const marco = open(page).locator('.conv-messages > li').filter({ hasText: 'Anything longer, nobody reads.' })
  await marco.hover()
  await marco.getByRole('button', { name: 'Propose as decision' }).click()
  await open(page).getByRole('textbox', { name: 'Decision to propose' }).fill('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  return marco
}

test('decide · a proposal decided since is said decided, never still in Still open', async ({ page }) => {
  await enter(page)
  const marco = await proposeMarco(page)
  await expect(marco.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  await stillOpen(page)
    .getByRole('listitem')
    .filter({ hasText: 'Briefs stay on one page' })
    .getByRole('button', { name: 'Accept' })
    .click()
  await expect(context(page).getByRole('status')).toHaveText('Accepted: Briefs stay on one page')
  await expect(marco.getByRole('status')).toHaveText('Proposed · decided since')
})

test('decide · proposed while the brief can’t be read again: it says so, and Still open once it is read', async ({
  page,
}) => {
  await enter(page, `${PAGE}&propose=slow`)
  const marco = await proposeMarco(page)
  // Recorded, its answer on its way (3 s): the brief's read again fails meanwhile.
  await expect.poll(() => writes(page, '/mission/proposals')).toHaveLength(1)
  await page.evaluate(() => window.fixture?.failMission(true))
  await expect(marco.getByRole('status')).toHaveText('Proposed · Still open couldn’t be read again')
  await page.evaluate(() => window.fixture?.failMission(false))
  await context(page).getByRole('button', { name: 'Try again' }).click()
  await expect(marco.getByRole('status')).toHaveText('Proposed · it’s in Still open')
})

test('decide · with no reply, Cancel keeps the proposal’s words and key: reopened, Propose sends the same one, never a second', async ({
  page,
}) => {
  await enter(page, `${PAGE}&propose=lost`)
  const mine = open(page).locator('.conv-messages > li').last()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  const field = open(page).getByRole('textbox', { name: 'Decision to propose' })
  await field.fill('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect(open(page).getByRole('alert')).toContainText('No reply yet')
  await open(page).getByRole('button', { name: 'Cancel' }).click()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  await expect(field).toHaveValue('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect(mine.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  // The first one had landed: the same key answers it, and Still open holds it once.
  await expect(stillOpen(page).locator('li').filter({ hasText: 'Briefs stay on one page' })).toHaveCount(1)
})

test('decide · with no reply, another conversation and back: the proposal is still held, sent again under its key', async ({
  page,
}) => {
  await enter(page, `${PAGE}&propose=lost`)
  const first = (await open(page).getByRole('heading').first().textContent()) ?? ''
  const mine = open(page).locator('.conv-messages > li').last()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  await open(page).getByRole('textbox', { name: 'Decision to propose' }).fill('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect(open(page).getByRole('alert')).toContainText('No reply yet')
  // Away to another conversation, and back to this one: the message is mounted anew.
  await away(page, first)
  const again = open(page).locator('.conv-messages > li').last()
  await again.hover()
  await again.getByRole('button', { name: 'Propose as decision' }).click()
  await expect(open(page).getByRole('textbox', { name: 'Decision to propose' })).toHaveValue('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect(again.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  await expect(stillOpen(page).locator('li').filter({ hasText: 'Briefs stay on one page' })).toHaveCount(1)
})

test('decide · on its way, another conversation and back: the words sent are shown, and its landing closes the form', async ({
  page,
}) => {
  await enter(page, `${PAGE}&propose=slow`)
  const first = (await open(page).getByRole('heading').first().textContent()) ?? ''
  const mine = open(page).locator('.conv-messages > li').last()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  await open(page).getByRole('textbox', { name: 'Decision to propose' }).fill('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await away(page, first)
  const again = open(page).locator('.conv-messages > li').last()
  await again.hover()
  await again.getByRole('button', { name: 'Propose as decision' }).click()
  // Still on its way: the words it was sent with, which can't change, and no second press.
  await expect(open(page).getByRole('textbox', { name: 'Decision to propose' })).toHaveValue('Briefs stay on one page')
  await expect(open(page).getByRole('button', { name: 'Proposing…' })).toBeVisible()
  // It lands: the form goes, the press says so, and Still open holds it once.
  await expect(again.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  await expect(open(page).getByRole('textbox', { name: 'Decision to propose' })).toHaveCount(0)
  await expect(stillOpen(page).locator('li').filter({ hasText: 'Briefs stay on one page' })).toHaveCount(1)
})

test('decide · words already waiting in Still open are not sent again: it says they are there', async ({ page }) => {
  await enter(page)
  const mine = open(page).locator('.conv-messages > li').last()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  // As after a lost reply and a reload: the key is gone, but the brief, read now, already has these words.
  await open(page).getByRole('textbox', { name: 'Decision to propose' }).fill('  map first, LIST second ')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect(mine.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  expect(await writes(page, '/mission/proposals')).toEqual([])
  await expect(stillOpen(page).locator('li').filter({ hasText: 'Map first, list second' })).toHaveCount(1)
})

test('decide · when the brief can’t be read first, nothing is sent: it says so, and the next press reads again', async ({
  page,
}) => {
  await enter(page)
  const mine = open(page).locator('.conv-messages > li').last()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  await open(page).getByRole('textbox', { name: 'Decision to propose' }).fill('Briefs stay on one page')
  await page.evaluate(() => window.fixture?.failMission(true))
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect(open(page).getByRole('alert')).toHaveText(
    'Couldn’t check the brief first, so nothing was sent. Try again.',
  )
  expect(await writes(page, '/mission/proposals')).toEqual([])
  await page.evaluate(() => window.fixture?.failMission(false))
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect(mine.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  expect(await writes(page, '/mission/proposals')).toEqual([
    { kind: 'constraint', statement: 'Briefs stay on one page' },
  ])
})

test('decide @phone · on a touch screen the press is a finger’s 40 px, and a keyboard reaches it unpressed', async ({
  page,
}) => {
  await page.goto(PAGE)
  // A phone shows the list first: the first conversation, opened.
  await page
    .getByRole('region', { name: 'All conversations' })
    .getByRole('listitem')
    .getByRole('button')
    .first()
    .click()
  const mine = open(page).locator('.conv-messages > li').last()
  const press = mine.getByRole('button', { name: 'Propose as decision' })
  // Out of sight until the message is pressed, it is still in reach of a keyboard and a screen reader.
  await expect(press).toHaveCSS('opacity', '0')
  await press.focus()
  await expect(press).toBeFocused()
  await expect(press).toHaveCSS('opacity', '1')
  const box = await press.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(40)
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
})

test('decide · Esc closes the form and gives the focus back to its press; nothing is sent', async ({ page }) => {
  await enter(page)
  const mine = open(page).locator('.conv-messages > li').last()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  await page.keyboard.press('Escape')
  await expect(open(page).getByRole('textbox', { name: 'Decision to propose' })).toHaveCount(0)
  await expect(mine.getByRole('button', { name: 'Propose as decision' })).toBeFocused()
})

test('decide · the presses keep to the app’s sizes and read at 4.5:1', async ({ page }) => {
  await enter(page)
  expect(await lowContrast(page, '.conv-decisions.open')).toEqual([])
  const sizes = await typeSizes(page, '.conv-context')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px'], sizes.join(' ')).toContain(s)
})
