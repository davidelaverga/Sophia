import { expect, test, type Page } from '@playwright/test'

// The project's context and the fence (PR #199 r4239772110, CX-0086): a refusal, the list's, a thread's or the context's
// own read's, fences the context too. Nothing it held shows (the mission, the decisions, what is held for them) nor
// its controls; the context's own refusal fences the whole view, and is not asked again; once the fence lifts, what
// it read before shows only after a read set out since answers. A 503 with no refusal keeps what was read, said
// possibly out of date. Every word is synthetic; only the API is faked.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&demo=1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const rows = (page: Page) => list(page).getByRole('listitem').getByRole('button')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const context = (page: Page) => page.locator('.conv-context')
const stillOpen = (page: Page) => context(page).locator('.conv-decisions.open')
const accept = (page: Page) => stillOpen(page).getByRole('button', { name: 'Accept' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const kept = (page: Page) => page.evaluate(() => window.fixture?.kept())
const writes = (page: Page, ending: string) =>
  page.evaluate(
    (end) => (window.fixture?.missionWrites ?? []).filter((w) => w.path.endsWith(end)).map((w) => w.body),
    ending,
  )
const FENCED = 'This project refused a read of its conversations.'
const NOT_SHOWN = 'The project’s context isn’t shown until its conversations can be read again.'
const PENDING = 'Map first, list second'

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** At 1440 px, where the context is a pane beside the conversation: its mission and Still open read. */
async function enter(page: Page, url = PAGE) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(url)
  await expect(stillOpen(page)).toContainText(PENDING)
}

/** Nothing of the context shows: no mission, no decision, no Accept or Decline. */
async function contextHidden(page: Page) {
  await expect(context(page)).toContainText(NOT_SHOWN)
  await expect(context(page).locator('.conv-mission, .conv-decisions')).toHaveCount(0)
  await expect(context(page).getByRole('button', { name: /^(Accept|Decline)$/ })).toHaveCount(0)
}

/** The list's reads fail as the feed moves (it says it may be out of date); then refused, and Try again reads it. */
async function listRefusedOnTryAgain(page: Page) {
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate(() => window.fixture?.listMore(true))
  await expect(list(page).getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.evaluate(() => window.fixture?.failConversations(false))
  await page.evaluate(() => window.fixture?.refuseConversations(true))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await expect(list(page)).toContainText(FENCED)
}

/** Counts, from the first refused read on, each frame that shows any of the context's mission, decisions or presses. */
async function sampleContextFrames(page: Page, marker: string) {
  await page.evaluate((m) => {
    const frames = document.documentElement.dataset
    frames.contextAfterRefusal = '0'
    const tick = () => {
      if ((window.fixture?.served ?? []).includes(m) && document.querySelector('.conv-mission, .conv-decisions'))
        frames.contextAfterRefusal = String(Number(frames.contextAfterRefusal) + 1)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, marker)
}
const contextFrames = (page: Page) => page.evaluate(() => Number(document.documentElement.dataset.contextAfterRefusal))

test('context fence · the list read alone refused: no frame after shows the mission, a decision or its presses; back only from a read since', async ({
  page,
}) => {
  await enter(page)
  await sampleContextFrames(page, 'conversations-refused')
  await listRefusedOnTryAgain(page)
  await contextHidden(page)
  await page.waitForTimeout(1000)
  expect(await contextFrames(page)).toBeLessThanOrEqual(3)
  // Given the project back, the brief's read since held: what was read before the refusal shows nothing meanwhile.
  await page.evaluate(() => window.fixture?.holdMission(true))
  await page.evaluate(() => window.fixture?.refuseConversations(false))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await expect(rows(page)).not.toHaveCount(0)
  await expect(context(page)).toContainText('Reading the project’s context again…')
  await expect(context(page).locator('.conv-mission, .conv-decisions')).toHaveCount(0)
  await page.evaluate(() => window.fixture?.holdMission(false))
  await expect(stillOpen(page)).toContainText(PENDING)
  await expect(accept(page)).toBeEnabled()
})

test('context fence · the context’s own read refused (403): asked once, and the whole view is fenced; a 503 before it kept what was read', async ({
  page,
}) => {
  await enter(page)
  // A 503 first, with no refusal: what was read stays, said possibly out of date, with Try again.
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate(() => window.fixture?.failMission(true))
  await page.evaluate(() => window.fixture?.listMore(true))
  const again = context(page).getByRole('button', { name: 'Try again' })
  await expect(context(page)).toContainText('This may be out of date.')
  await expect(stillOpen(page)).toContainText(PENDING)
  // Out of the project: the brief refused; the context's own Try again is the only read to meet it.
  await page.evaluate(() => window.fixture?.failMission(false))
  await page.evaluate(() => window.fixture?.refuseMission(true))
  await again.click()
  await expect(list(page)).toContainText(FENCED)
  await contextHidden(page)
  await expect(rows(page)).toHaveCount(0)
  await expect(open(page)).toHaveCount(0)
  await expect(list(page).getByRole('button', { name: 'New conversation' })).toHaveCount(0)
  await page.waitForTimeout(1500)
  expect((await served(page)).filter((s) => s === 'mission-refused')).toHaveLength(1)
  expect(typeof (await kept(page))?.fence?.at).toBe('number')
  // Given the project back: a list read since lifts the fence; the brief is read again, and shows.
  await page.evaluate(() => window.fixture?.refuseMission(false))
  await page.evaluate(() => window.fixture?.failConversations(false))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await expect(rows(page)).not.toHaveCount(0)
  await expect(stillOpen(page)).toContainText(PENDING)
})

test('context fence · a read of the brief set out before the refusal, answering after it, brings nothing back', async ({
  page,
}) => {
  await enter(page)
  // The brief's read as the feed moves is held; the list then refused; the held read answers after the refusal.
  await page.evaluate(() => window.fixture?.holdMission(true))
  await listRefusedOnTryAgain(page)
  await page.evaluate(() => window.fixture?.holdMission(false))
  await page.waitForTimeout(500)
  await contextHidden(page)
  // Given the project back, that older answer is not taken for current: the brief is read again before it shows.
  await page.evaluate(() => window.fixture?.holdMission(true))
  await page.evaluate(() => window.fixture?.refuseConversations(false))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await expect(rows(page)).not.toHaveCount(0)
  await expect(context(page)).toContainText('Reading the project’s context again…')
  await expect(context(page).locator('.conv-mission, .conv-decisions')).toHaveCount(0)
  await page.evaluate(() => window.fixture?.holdMission(false))
  await expect(stillOpen(page)).toContainText(PENDING)
})

test('context fence · the focus on Accept, beside the conversation, when the list is refused as the feed moves: it goes to the fence’s note', async ({
  page,
}) => {
  await enter(page)
  await accept(page).focus()
  await expect(accept(page)).toBeFocused()
  await page.evaluate(() => window.fixture?.refuseConversations(true))
  await page.evaluate(() => window.fixture?.listMore(true))
  const note = list(page).getByText(FENCED)
  await expect(note).toBeVisible()
  await expect(note).toBeFocused()
  await contextHidden(page)
})

test('context fence · @phone: the context open as a panel, the focus on Accept, the list refused as the feed moves: the panel goes, the note in sight and focused', async ({
  page,
}) => {
  await page.goto(PAGE)
  await rows(page).first().click()
  await open(page).getByRole('button', { name: 'Context' }).click()
  await expect(stillOpen(page)).toContainText(PENDING)
  await accept(page).focus()
  await expect(accept(page)).toBeFocused()
  await page.evaluate(() => window.fixture?.refuseConversations(true))
  await page.evaluate(() => window.fixture?.listMore(true))
  const note = list(page).getByText(FENCED)
  await expect(note).toBeVisible()
  await expect(note).toBeFocused()
  await expect(page.locator('.conversations')).not.toHaveAttribute('data-context', /.+/)
  await expect(page.locator('.conv-mission, .conv-decisions')).toHaveCount(0)
})

test('context fence · a decision held with no reply: kept across the fence under its key, nothing sent meanwhile; then sent again under it', async ({
  page,
}) => {
  await enter(page, `${PAGE}&decide=lost`)
  await accept(page).click()
  const status = context(page).getByRole('status')
  await expect(status).toHaveText('Not confirmed: Accepted: Map first, list second. Try again')
  const held = (await kept(page))?.decision
  expect(held?.key).toBeTruthy()
  const sent = (await writes(page, '/decision')).length
  await listRefusedOnTryAgain(page)
  await contextHidden(page)
  await page.waitForTimeout(1000)
  expect((await kept(page))?.decision).toEqual(held)
  expect(await writes(page, '/decision')).toHaveLength(sent)
  await page.evaluate(() => window.fixture?.refuseConversations(false))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await expect(status).toHaveText('Not confirmed: Accepted: Map first, list second. Try again')
  await status.getByRole('button', { name: 'Try again' }).click()
  await expect(status).toHaveText('Accepted: Map first, list second')
  const all = await writes(page, '/decision')
  expect(all).toHaveLength(sent + 1)
  expect((await kept(page))?.decision ?? null).toBeNull()
})

// Every reader of the project's context, not the pane alone (PR #199 r4239851727, CX-0088): the New conversation form's
// «Start from what’s still open» and a message's «Proposed» line show what the context held only from a read set out
// since the latest refusal, whatever refused: the list, a thread, the context's own read.
const form = (page: Page) => page.getByRole('form', { name: 'New conversation' })
const starters = (page: Page) => form(page).getByRole('group', { name: 'Start from what’s still open' })
const draft = (page: Page) => form(page).getByRole('textbox', { name: 'Context, if it helps' })
const DRAFT = 'SYNTHETIC-DRAFT-CONTEXT'
const briefsServed = async (page: Page) => (await served(page)).filter((s) => s.startsWith('mission:')).length

/** The form open, a draft in it, offering what is still open. */
async function formOpen(page: Page) {
  await list(page).getByRole('button', { name: 'New conversation' }).click()
  await draft(page).fill(DRAFT)
  await expect(starters(page).getByRole('button', { name: PENDING })).toBeVisible()
}

/** Back in the form: the draft as it was, and none of what the context read before the refusal offered meanwhile. */
async function formOffersNothing(page: Page) {
  await expect(form(page)).toBeVisible()
  await expect(draft(page)).toHaveValue(DRAFT)
  await page.waitForTimeout(500)
  await expect(starters(page)).toHaveCount(0)
  await expect(form(page)).not.toContainText(PENDING)
}

test('context fence · the New conversation form across a list refusal: what’s still open is offered only once the brief’s read since answers', async ({
  page,
}) => {
  await enter(page)
  await formOpen(page)
  await listRefusedOnTryAgain(page)
  await expect(form(page)).toHaveCount(0)
  // Given the project back, the brief's read since held: the form is back with its draft, offering nothing meanwhile.
  await page.evaluate(() => window.fixture?.holdMission(true))
  await page.evaluate(() => window.fixture?.refuseConversations(false))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await expect(context(page)).toContainText('Reading the project’s context again…')
  await formOffersNothing(page)
  // The read since answers (200): offered again.
  await page.evaluate(() => window.fixture?.holdMission(false))
  await expect(starters(page).getByRole('button', { name: PENDING })).toBeVisible()
  await expect(draft(page)).toHaveValue(DRAFT)
})

test('context fence · the New conversation form across a list refusal, the brief’s read since failing: nothing it read before is offered', async ({
  page,
}) => {
  await enter(page)
  await formOpen(page)
  await listRefusedOnTryAgain(page)
  await page.evaluate(() => window.fixture?.failMission(true))
  await page.evaluate(() => window.fixture?.refuseConversations(false))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await expect(context(page)).toContainText('The project’s context can’t be read now.')
  await formOffersNothing(page)
  await page.waitForTimeout(1500)
  await expect(starters(page)).toHaveCount(0)
  // Read again, and answered: offered again.
  await page.evaluate(() => window.fixture?.failMission(false))
  await context(page).getByRole('button', { name: 'Try again' }).click()
  await expect(starters(page).getByRole('button', { name: PENDING })).toBeVisible()
})

test('context fence · the New conversation form: a read of the brief set out before the refusal, answering after the fence lifts, offers nothing', async ({
  page,
}) => {
  await enter(page)
  await formOpen(page)
  // The brief's read as the feed moves is held; the list then refused; the project given back.
  await page.evaluate(() => window.fixture?.holdMission(true))
  await listRefusedOnTryAgain(page)
  await page.evaluate(() => window.fixture?.refuseConversations(false))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await expect(form(page)).toBeVisible()
  // The held read answers now (200), and the next one is held: that older answer offers nothing.
  const before = await briefsServed(page)
  await page.evaluate(() => {
    window.fixture?.holdMission(false)
    window.fixture?.holdMission(true)
  })
  await expect.poll(() => briefsServed(page)).toBeGreaterThan(before)
  await formOffersNothing(page)
  await expect(context(page)).toContainText('Reading the project’s context again…')
  await page.evaluate(() => window.fixture?.holdMission(false))
  await expect(starters(page).getByRole('button', { name: PENDING })).toBeVisible()
})

test('context fence · a thread’s read refused (403): New conversation, opened once the project is back, offers only from the brief’s read since', async ({
  page,
}) => {
  await enter(page)
  // The open thread read again (to another view and back), and refused; the list's reads fail meanwhile.
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate((c) => window.fixture?.refuseMessageReads(c), '00000000-0000-4000-8000-0000000000c1')
  const views = page.getByRole('navigation', { name: 'Project views' })
  await views.getByRole('link', { name: 'Goals' }).click()
  await expect(page.getByRole('heading', { name: 'Goals', level: 2 })).toBeVisible()
  await views.getByRole('link', { name: 'Conversations' }).click()
  await expect.poll(async () => (await served(page)).includes('messages-refused:c1')).toBe(true)
  await expect(list(page)).toContainText(FENCED)
  await contextHidden(page)
  // Given the project back, the brief's read since held: the form opened now offers nothing it read before.
  await page.evaluate(() => window.fixture?.holdMission(true))
  await page.evaluate(() => window.fixture?.refuseMessageReads(null))
  await page.evaluate(() => window.fixture?.failConversations(false))
  const again = list(page).getByRole('button', { name: 'Try again' })
  if (await again.isVisible()) await again.click()
  await expect(rows(page)).not.toHaveCount(0)
  await list(page).getByRole('button', { name: 'New conversation' }).click()
  await draft(page).fill(DRAFT)
  await formOffersNothing(page)
  await page.evaluate(() => window.fixture?.holdMission(false))
  await expect(starters(page).getByRole('button', { name: PENDING })).toBeVisible()
})

test('context fence · the context’s own read refused (403) with the form open: offered from a 503 before it, then only from a read since', async ({
  page,
}) => {
  await enter(page)
  await formOpen(page)
  // A 503 first, with no refusal: what was read is still offered.
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate(() => window.fixture?.failMission(true))
  await page.evaluate(() => window.fixture?.listMore(true))
  await expect(context(page)).toContainText('This may be out of date.')
  await expect(starters(page).getByRole('button', { name: PENDING })).toBeVisible()
  // The brief refused on the context's own Try again: the whole view is fenced, the form with it.
  await page.evaluate(() => window.fixture?.failMission(false))
  await page.evaluate(() => window.fixture?.refuseMission(true))
  await context(page).getByRole('button', { name: 'Try again' }).click()
  await expect(list(page)).toContainText(FENCED)
  await expect(form(page)).toHaveCount(0)
  // Given the project back, the brief's read since held: nothing read before is offered.
  await page.evaluate(() => window.fixture?.refuseMission(false))
  await page.evaluate(() => window.fixture?.holdMission(true))
  await page.evaluate(() => window.fixture?.failConversations(false))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await formOffersNothing(page)
  await page.evaluate(() => window.fixture?.holdMission(false))
  await expect(starters(page).getByRole('button', { name: PENDING })).toBeVisible()
})

test('context fence · a message’s «Proposed» line across a list refusal: where its proposal stands is said only from the brief’s read since', async ({
  page,
}) => {
  await enter(page)
  await list(page)
    .getByRole('button', { name: /Short or long briefs/ })
    .click()
  const marco = open(page).locator('.conv-messages > li').filter({ hasText: 'Anything longer, nobody reads.' })
  await marco.hover()
  await marco.getByRole('button', { name: 'Propose as decision' }).click()
  await open(page).getByRole('textbox', { name: 'Decision to propose' }).fill('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  const line = marco.getByRole('status')
  await expect(line).toHaveText('Proposed · it’s in Still open')
  await listRefusedOnTryAgain(page)
  await expect(open(page)).toHaveCount(0)
  // Given the project back, the brief's read since held: the thread is back, and its line doesn't say it waits.
  await page.evaluate(() => window.fixture?.holdMission(true))
  await page.evaluate(() => window.fixture?.refuseConversations(false))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await expect(line).toBeVisible()
  await page.waitForTimeout(500)
  await expect(line).not.toHaveText('Proposed · it’s in Still open')
  await page.evaluate(() => window.fixture?.holdMission(false))
  await expect(line).toHaveText('Proposed · it’s in Still open')
  expect(await writes(page, '/mission/proposals')).toEqual([
    { kind: 'constraint', statement: 'Briefs stay on one page' },
  ])
})

test('context fence · @phone: the New conversation form across a list refusal, the brief’s read since failing: nothing it read before is offered', async ({
  page,
}) => {
  await page.goto(PAGE)
  await formOpen(page)
  await page.evaluate(() => window.fixture?.refuseConversations(true))
  await page.evaluate(() => window.fixture?.listMore(true))
  await expect(list(page).getByText(FENCED)).toBeVisible()
  await expect(form(page)).toHaveCount(0)
  // Given the project back, the brief's read since failing: the form is back with its draft, offering nothing.
  await page.evaluate(() => window.fixture?.failMission(true))
  await page.evaluate(() => window.fixture?.refuseConversations(false))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await formOffersNothing(page)
  await page.waitForTimeout(1500)
  await expect(starters(page)).toHaveCount(0)
})
