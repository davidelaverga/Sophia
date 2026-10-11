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
