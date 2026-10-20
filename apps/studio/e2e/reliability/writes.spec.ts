import { expect, test, type Locator, type Page } from '@playwright/test'
import { arm, pressed, record, withProbe, type Timed } from './measure.ts'

// M1 and M2 (docs/plans/reliability-measure.md, the baseline's §4): how long a keyed write takes from the press to a
// definitive answer on screen while its reply is held, and whether a write whose reply was lost resolves when it is
// sent again under its key, written once; and M2r, the same across a reload (reliability-held-on-reload.md), the
// synthetic service outliving it (`server=kept`). Measured in the page; the checks assert only that each scenario ran.

const BAR = '#converse-draft'
const CONVERSATION_FIELD = 'textarea[aria-label="Continue this question with the team"]'
const START_FIELD = 'form[aria-label="New conversation"] input'
const UNCONFIRMED = 'Not confirmed'
/** How long the reply is held after the press, in ms: at once, quick, a second, slow. */
const HOLDS = [0, 250, 1000, 2500]
const ROUNDS = 3

const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const written = async (page: Page, kind: string) => (await served(page)).filter((s) => s.startsWith(`${kind}:`)).length
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await withProbe(page)
})

/** In the room with two people, the chat open: the bar writes to the room (contributions, keyed). */
async function inRoom(page: Page, query = '') {
  await page.goto(`/room.html?call=on&people=2&floor=1${query}`)
  await chatOpen(page)
}

/** Back in the call, the chat open. */
async function chatOpen(page: Page) {
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await page.getByRole('button', { name: /^Chat/ }).first().click()
  await expect(page.locator(BAR)).toBeVisible()
}

/** Briefs, the conversation without Sophia whose messages fit a page, with Ask Sophia off. */
async function inConversation(page: Page, query: string) {
  await page.goto(`/room.html?place=conversations&conversations=1${query}`)
  await page.getByRole('region', { name: 'All conversations' }).getByRole('listitem').getByRole('button').nth(1).click()
  await open(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
}

test('M1 · a message to the room: press to recorded, its reply held 0 to 2.5 s @reliability', async ({ page }) => {
  test.setTimeout(120_000)
  await inRoom(page)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) {
    for (const hold of HOLDS) {
      const text = `Held ${hold} ms, round ${round + 1}.`
      await page.evaluate(() => window.fixture?.holdMessages(true))
      await page.locator(BAR).fill(text)
      const press = { on: 'keydown', field: BAR, listed: text, unconfirmed: UNCONFIRMED, holdFor: hold } as const
      await arm(page, { ...press, failOnUnconfirmed: true, timeoutMs: 15_000 })
      await page.locator(BAR).press('Enter')
      const timed: Timed = await pressed(page)
      samples.push({ kind: 'room-message', delayMs: hold, totalMs: timed.ms, definitive: timed.definitive })
    }
  }
  await record(test.info(), 'M1', samples)
  expect(samples).toHaveLength(ROUNDS * HOLDS.length)
})

test('M1 · a message in a project conversation: press to listed, its reply 1.5 s on @reliability', async ({ page }) => {
  await inConversation(page, '&send=slow')
  const field = open(page).getByRole('textbox', { name: 'Continue this question with the team' })
  const samples = []
  for (let round = 0; round < ROUNDS; round++) {
    const text = `Slow reply, round ${round + 1}.`
    await field.fill(text)
    const press = { on: 'keydown', field: CONVERSATION_FIELD, listed: text, unconfirmed: UNCONFIRMED } as const
    await arm(page, { ...press, failOnUnconfirmed: true, timeoutMs: 15_000 })
    await field.press('Enter')
    const timed = await pressed(page)
    samples.push({ kind: 'conversation-message', delayMs: 1500, totalMs: timed.ms, definitive: timed.definitive })
  }
  await record(test.info(), 'M1', samples)
  expect(samples).toHaveLength(ROUNDS)
})

test('M2 · a message to the room whose reply is lost, sent again under its key @reliability', async ({ page }) => {
  await inRoom(page)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) {
    const text = `Lost reply, round ${round + 1}.`
    const before = await written(page, 'contribution')
    await page.evaluate(() => window.fixture?.loseNextContributionReply())
    await page.locator(BAR).fill(text)
    await page.locator(BAR).press('Enter')
    await expect(page.getByText(`${UNCONFIRMED}: “${text}”`)).toBeVisible()
    await arm(page, {
      on: 'click',
      target: '.composer .outcome button',
      field: BAR,
      unconfirmed: UNCONFIRMED,
      failOnUnconfirmed: false,
      timeoutMs: 10_000,
    })
    await page.getByRole('button', { name: 'Try again' }).click()
    const timed = await pressed(page)
    const shown = await page.locator('.contribution').filter({ hasText: text }).count()
    const writes = (await written(page, 'contribution')) - before
    samples.push({ kind: 'room-message', resolved: timed.definitive && shown === 1, writes, resendMs: timed.ms })
  }
  await record(test.info(), 'M2', samples)
  expect(samples).toHaveLength(ROUNDS)
})

test('M2 · a conversation message whose reply is lost, sent again under its key @reliability', async ({ page }) => {
  await inConversation(page, '&send=lost')
  const field = open(page).getByRole('textbox', { name: 'Continue this question with the team' })
  const text = 'Did this one land?'
  await field.fill(text)
  await field.press('Enter')
  await expect(open(page)).toContainText(`${UNCONFIRMED}: “${text}”`)
  await arm(page, {
    on: 'keydown',
    field: CONVERSATION_FIELD,
    unconfirmed: UNCONFIRMED,
    failOnUnconfirmed: false,
    timeoutMs: 10_000,
  })
  await field.press('Enter')
  const timed = await pressed(page)
  const shown = await open(page).locator('.conv-messages > li').filter({ hasText: text }).count()
  const writes = await written(page, 'conversation-message')
  const sample = { kind: 'conversation-message', resolved: timed.definitive && shown === 1, writes, resendMs: timed.ms }
  await record(test.info(), 'M2', [sample])
  expect(sample.kind).toBe('conversation-message')
})

test('M2 · a conversation started whose reply is lost, started again under its key @reliability', async ({ page }) => {
  await page.goto('/room.html?place=conversations&conversations=1&start=lost')
  const question = 'Who checks the March figures?'
  await page
    .getByRole('region', { name: 'All conversations' })
    .getByRole('button', { name: 'New conversation' })
    .click()
  const form = page.getByRole('form', { name: 'New conversation' })
  await form.getByRole('textbox', { name: 'Question' }).fill(question)
  await form.getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await form.getByRole('button', { name: 'Start' }).click()
  await expect(form).toContainText(`${UNCONFIRMED}: “${question}”`)
  await arm(page, {
    on: 'click',
    target: 'form[aria-label="New conversation"] button',
    field: START_FIELD,
    unconfirmed: UNCONFIRMED,
    failOnUnconfirmed: false,
    timeoutMs: 10_000,
  })
  await form.getByRole('button', { name: 'Start' }).click()
  const timed = await pressed(page)
  const listed = await page.locator('.conv-title').filter({ hasText: question }).count()
  const writes = await written(page, 'conversation-start')
  const sample = { kind: 'conversation-start', resolved: timed.definitive && listed === 1, writes, resendMs: timed.ms }
  await record(test.info(), 'M2', [sample])
  expect(sample.kind).toBe('conversation-start')
})

/** The keys each try of a message reached the synthetic service with (`server=kept`'s journal), the first try first. */
const keysOf = (page: Page, text: string) =>
  page.evaluate((words) => {
    const journal: unknown = JSON.parse(sessionStorage.getItem('fixture.server.journal') ?? '[]')
    return (Array.isArray(journal) ? journal : []).flatMap((w: unknown) =>
      typeof w === 'object' && w !== null && String(Reflect.get(w, 'body')).includes(words)
        ? [String(Reflect.get(w, 'key'))]
        : [],
    )
  }, text)

/** Whether `line` shows within 5 s: a held message offered again after the reload, or not. */
const offered = (line: Locator) =>
  expect(line)
    .toBeVisible({ timeout: 5000 })
    .then(
      () => true,
      () => false,
    )

/** A round on a fresh service: last round's journal and held message go with the tab's storage, as in a new tab. */
async function freshTab(page: Page, round: number) {
  if (round > 0) await page.evaluate(() => sessionStorage.clear())
}

/**
 * A reload's sample: offered again, the tries and keys that reached the service, how many times it was recorded, and
 * the press after the reload to the answer (none when nothing was offered to press).
 */
const reloaded = (
  kind: string,
  r: { shown: boolean; keys: string[]; writes: number; timed: Timed; listed: number },
) => ({
  kind,
  offered: r.shown,
  tries: r.keys.length,
  keys: new Set(r.keys).size,
  writes: r.writes,
  resolved: r.timed.definitive && r.listed === 1,
  resendMs: r.timed.ms,
})

const NONE: Timed = { ms: null, definitive: false }

test('M2r · a message to the room whose reply is lost, kept across a reload and sent again @reliability', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) {
    await freshTab(page, round)
    await inRoom(page, '&server=kept')
    const text = `Kept through a reload, round ${round + 1}.`
    await page.evaluate(() => window.fixture?.loseNextContributionReply())
    await page.locator(BAR).fill(text)
    await page.locator(BAR).press('Enter')
    await expect(page.getByText(`${UNCONFIRMED}: “${text}”`)).toBeVisible()
    await page.reload()
    await chatOpen(page)
    const shown = await offered(page.getByText(`${UNCONFIRMED}: “${text}”`))
    let timed = NONE
    if (shown) {
      await arm(page, {
        on: 'click',
        target: '.composer .outcome button',
        field: BAR,
        unconfirmed: UNCONFIRMED,
        failOnUnconfirmed: false,
        timeoutMs: 10_000,
      })
      await page.getByRole('button', { name: 'Try again' }).click()
      timed = await pressed(page)
    }
    const listed = await page.locator('.contribution').filter({ hasText: text }).count()
    // The page reloaded: what the service recorded is what it holds again, replayed as it loaded.
    const writes = await written(page, 'contribution')
    samples.push(reloaded('room-message', { shown, keys: await keysOf(page, text), writes, timed, listed }))
  }
  await record(test.info(), 'M2r', samples)
  expect(samples).toHaveLength(ROUNDS)
})

test('M2r · a conversation message whose reply is lost, kept across a reload and sent again @reliability', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) {
    await freshTab(page, round)
    await inConversation(page, '&send=lost&server=kept')
    const field = open(page).getByRole('textbox', { name: 'Continue this question with the team' })
    const text = `Kept through a reload, round ${round + 1}.`
    await field.fill(text)
    await field.press('Enter')
    await expect(open(page)).toContainText(`${UNCONFIRMED}: “${text}”`)
    await page.reload()
    // By its title: the message the service holds again moved Briefs to the top of the list.
    await page.locator('.conv-title').filter({ hasText: 'Short or long briefs?' }).click()
    await expect(open(page).getByRole('heading', { level: 3 })).toHaveText('Short or long briefs?')
    const shown = await offered(open(page).getByText(`${UNCONFIRMED}: “${text}”`))
    let timed = NONE
    if (shown) {
      // The field is empty after the reload: Enter sends the message held, under its key.
      await arm(page, {
        on: 'keydown',
        field: CONVERSATION_FIELD,
        unconfirmed: UNCONFIRMED,
        failOnUnconfirmed: false,
        timeoutMs: 10_000,
      })
      await field.press('Enter')
      timed = await pressed(page)
    }
    const listed = await open(page).locator('.conv-messages > li').filter({ hasText: text }).count()
    const writes = await written(page, 'conversation-message')
    samples.push(reloaded('conversation-message', { shown, keys: await keysOf(page, text), writes, timed, listed }))
  }
  await record(test.info(), 'M2r', samples)
  expect(samples).toHaveLength(ROUNDS)
})
