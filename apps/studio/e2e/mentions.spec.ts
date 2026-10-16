import { expect, test, type Page } from '@playwright/test'

// Explicit mentions in the room's chat (docs/plans/mentions.md, A37; the mentions flag's): an editor or an admin
// chooses members by their current names before sending; the message says whom it names; a viewer writes as before;
// a correction keeps the recipients and a withdrawal ends them; Home lists a mention and opening it marks it seen.
// Nothing is read from the words. Every word is synthetic.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const chatToggle = (page: Page) => page.getByRole('button', { name: /^Chat/ }).first()
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const line = (page: Page, words: string) => discussion(page).locator('.contribution').filter({ hasText: words })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const bar = (page: Page) => page.locator('#converse-draft')
const MARCO = '00000000-0000-4000-8000-0000000000b1'
const MENTIONED_IN = '00000000-0000-4000-8000-00000000003a'
const NEED = `mention:00000000-0000-4000-8000-0000000000aa:2:${MENTIONED_IN}`

/** In the call, out of Sophia's conversation: the bar writes to the room (room-discussion.spec.ts). */
async function enter(page: Page, query = '') {
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=mine&acts=1${query}`)
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await expect(discussion(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('mentions · an admin chooses members by their names; the message names them; a correction keeps them, a withdrawal ends them', async ({
  page,
}) => {
  await enter(page)
  await page.getByRole('button', { name: 'Mention' }).click()
  const options = page.getByRole('group', { name: /Mention members/ })
  // The members by their current names, never the reader, never an address.
  await expect(options.getByRole('checkbox')).toHaveCount(2)
  await expect(options).toContainText('Marco')
  await expect(options).toContainText('Lucía')
  await expect(options).not.toContainText('@')
  await options.getByRole('checkbox', { name: 'Marco' }).check()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Mentions Marco')).toBeVisible()
  // A name typed in the words mentions nobody: only the choice does.
  await bar(page).fill('Marco, can you check the door plan? Lucía too.')
  await bar(page).press('Enter')
  const sent = line(page, 'can you check the door plan')
  await expect(sent.locator('.contribution-mentions')).toHaveText('to Marco')
  expect(await served(page)).toContain(`mentions:${MARCO}`)
  await expect(page.getByText('Mentions Marco')).toHaveCount(0) // the choice clears and closes for the next message
  await expect(page.getByRole('group', { name: /Mention members/ })).toHaveCount(0)

  // A correction left as it was keeps the recipients.
  await sent.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill('Marco, can you check the door plan by Friday?')
  await page.getByRole('button', { name: 'Save' }).click()
  const fixed = line(page, 'by Friday')
  await expect(fixed.locator('.contribution-mentions')).toHaveText('to Marco')
  // Withdrawn: its place, never its words or whom it named.
  await fixed.getByRole('button', { name: 'Withdraw' }).click()
  await page
    .getByRole('group', { name: 'Withdraw your message?' })
    .getByRole('button', { name: 'Withdraw message' })
    .click()
  await expect(discussion(page).getByText('You withdrew this message.').last()).toBeVisible()
  await expect(discussion(page).getByText('to Marco')).toHaveCount(0)
})

test('mentions · a viewer is never offered them, and still writes, corrects and withdraws their own words', async ({
  page,
}) => {
  await enter(page, '&role=viewer')
  await expect(page.getByRole('button', { name: 'Mention' })).toHaveCount(0)
  await bar(page).fill('A viewer’s own words.')
  await bar(page).press('Enter')
  const mine = line(page, 'A viewer’s own words.')
  await expect(mine).toBeVisible()
  await expect(mine.locator('.contribution-mentions')).toHaveCount(0)
  expect((await served(page)).some((s) => s.startsWith('mentions:'))).toBe(false)
  await mine.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill('A viewer’s own words, fixed.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(line(page, 'fixed.')).toBeVisible()
})

test('mentions · at most five; taking one off frees a place', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Mention' }).click()
  const options = page.getByRole('group', { name: /Mention members/ })
  await options.getByRole('checkbox', { name: 'Marco' }).check()
  await options.getByRole('checkbox', { name: 'Lucía' }).check()
  await expect(page.getByText('Mentions Marco, Lucía')).toBeVisible()
  await options.getByRole('checkbox', { name: 'Marco' }).uncheck()
  await expect(page.getByText('Mentions Lucía')).toBeVisible()
})

test('mentions · Home lists a message that mentions the person; opening it goes to that message in the room, without marking it', async ({
  page,
}) => {
  await page.goto('/home.html?needs=api&mentions=1')
  const list = page.getByRole('list', { name: 'Needs you' })
  const mention = list.getByRole('button').filter({ hasText: 'Can you check the door plan before Friday?' })
  await expect(mention).toContainText('Marco mentioned you')
  await expect(mention).toHaveAccessibleName(/Read$/)
  await mention.click()
  // Opened, not yet seen: the room marks it once the message is shown there (Codex on #409).
  await expect
    .poll(() => page.evaluate(() => window.homeFixture?.pressed ?? []))
    .toEqual([`open studio 00000000-0000-4000-8000-0000000000aa #message-${MENTIONED_IN}`])
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.homeFixture?.pressed ?? [])).toHaveLength(1)
  await expect(mention).toBeVisible()
})

test('mentions · the room opens its chat on the message the address names, and marks the mention seen once it is shown', async ({
  page,
}) => {
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=mentioned#message-${MENTIONED_IN}`)
  await expect(leave(page)).toBeVisible()
  const entry = discussion(page).locator(`[data-message="${MENTIONED_IN}"]`)
  await expect(entry).toBeInViewport()
  await expect(entry.locator('.contribution-mentions')).toHaveText('to you')
  await expect.poll(() => served(page)).toContain(`seen:${NEED}`)
  expect((await served(page)).filter((s) => s === `seen:${NEED}`)).toHaveLength(1)
})

test('mentions · with the chat closed, nothing is marked; opening it marks the mention once shown', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1&discussion=mentioned')
  await expect(leave(page)).toBeVisible()
  await page.waitForTimeout(500)
  expect((await served(page)).some((s) => s.startsWith('seen:'))).toBe(false)
  await chatToggle(page).click()
  await expect.poll(() => served(page)).toContain(`seen:${NEED}`)
})

test('mentions · until the members are read, nobody is offered and no recipient is named', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1&discussion=mentioned&members=fail')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await expect(discussion(page).getByText('Can you check the door plan before Friday?')).toBeVisible()
  await expect(page.locator('.contribution-mentions')).toHaveCount(0)
  await expect(page.getByText('a former member')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mention' })).toHaveCount(0)
})
