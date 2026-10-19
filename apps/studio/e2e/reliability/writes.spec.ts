import { expect, test, type Page } from '@playwright/test'
import { arm, pressed, record, withProbe, type Timed } from './measure.ts'

// M1 and M2 (docs/plans/reliability-measure.md, the baseline's §4): how long a keyed write takes from the press to a
// definitive answer on screen while its reply is held, and whether a write whose reply was lost resolves when it is
// sent again under its key, written once. Measured in the page; the checks assert only that each scenario ran.

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
async function inRoom(page: Page) {
  await page.goto('/room.html?call=on&people=2&floor=1')
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
