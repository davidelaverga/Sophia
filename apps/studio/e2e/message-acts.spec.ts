import { expect, test, type Page } from '@playwright/test'

// A member corrects or withdraws their own message in the room's chat (docs/plans/message-acts.md, A36; the message
// acts flag's): Edit and Withdraw on their own messages only, Withdraw only on one that shares a report; what an act
// would do said before it goes when work read the words; a withdrawn message's place, never its words; a lost reply
// asked again with the same key; a message changed elsewhere read again with the draft kept. Every word is synthetic.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const chatToggle = (page: Page) => page.getByRole('button', { name: /^Chat/ }).first()
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const line = (page: Page, words: string | RegExp) =>
  discussion(page).locator('.contribution').filter({ hasText: words })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const MINE = 'Meet at nine by the north door.'
const SHARED = 'The pilot report, version 2.'

async function enter(page: Page) {
  await page.goto('/room.html?call=on&discussion=mine&acts=1')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await expect(line(page, MINE)).toBeVisible()
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

test('acts · only the reader’s own messages offer them: a written one Edit and Withdraw, a shared report Withdraw', async ({
  page,
}) => {
  await enter(page)
  const mine = line(page, MINE)
  await expect(mine.getByRole('button', { name: 'Edit' })).toBeVisible()
  await expect(mine.getByRole('button', { name: 'Withdraw' })).toBeVisible()
  const theirs = line(page, 'Sounds good to me.')
  await expect(theirs.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await expect(theirs.getByRole('button', { name: 'Withdraw' })).toHaveCount(0)
  const shared = line(page, SHARED)
  await expect(shared.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await expect(shared.getByRole('button', { name: 'Withdraw' })).toBeVisible()
})

test('acts · a correction keeps the message’s place and says it was edited; the same words send nothing', async ({
  page,
}) => {
  await enter(page)
  await line(page, MINE).getByRole('button', { name: 'Edit' }).click()
  const field = page.getByRole('textbox', { name: 'Edit your message' })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue(MINE)
  // Unchanged words: nothing is asked.
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(field).toHaveCount(0)
  expect(await served(page)).not.toContain('act-preview:correct')

  await line(page, MINE).getByRole('button', { name: 'Edit' }).click()
  await field.fill('Meet at ten by the north door.')
  await page.getByRole('button', { name: 'Save' }).click()
  const fixed = line(page, 'Meet at ten by the north door.')
  await expect(fixed).toBeVisible()
  await expect(fixed.getByText('Edited')).toBeVisible()
  await expect(discussion(page).locator('.contribution').first()).toContainText('Meet at ten')
  await expect(page.getByText(MINE)).toHaveCount(0)
  expect(await served(page)).toEqual(expect.arrayContaining(['act-preview:correct', 'act:correct']))
})

test('acts · when work read the words, the correction says so first: it stops, starts again, and sent words stay sent', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.reachNextPreview(1))
  await line(page, MINE).getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill('Meet at noon.')
  await page.getByRole('button', { name: 'Save' }).click()
  const ask = page.getByRole('group', { name: 'Save your edit?' })
  await expect(ask).toContainText('One research task that read them will stop and start again without them.')
  await expect(ask).toContainText('Words already sent to an AI provider can’t be called back.')
  await expect(ask.getByRole('button', { name: 'Save anyway' })).toBeFocused()
  expect(await served(page)).not.toContain('act:correct')
  await ask.getByRole('button', { name: 'Save anyway' }).click()
  await expect(line(page, 'Meet at noon.')).toBeVisible()
})

test('acts · a withdrawal asks first, then leaves only the message’s place; a shared report’s says the report stays', async ({
  page,
}) => {
  await enter(page)
  await line(page, MINE).getByRole('button', { name: 'Withdraw' }).click()
  const ask = page.getByRole('group', { name: 'Withdraw your message?' })
  await expect(ask).toContainText('Your words are erased.')
  await ask.getByRole('button', { name: 'Withdraw message' }).click()
  await expect(discussion(page).getByText('You withdrew this message.')).toBeVisible()
  await expect(page.getByText(MINE)).toHaveCount(0)

  await line(page, SHARED).getByRole('button', { name: 'Withdraw' }).click()
  const shared = page.getByRole('group', { name: 'Withdraw your message?' })
  await expect(shared).toContainText('The report or file it shared stays as it is.')
  await expect(shared).not.toContainText('AI provider')
  await shared.getByRole('button', { name: 'Cancel' }).click()
  await expect(line(page, SHARED)).toBeVisible()
})

test('acts · a reply lost on the way is asked again with the same key, never done twice', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.loseNextActReply())
  await line(page, MINE).getByRole('button', { name: 'Withdraw' }).click()
  const ask = page.getByRole('group', { name: 'Withdraw your message?' })
  await ask.getByRole('button', { name: 'Withdraw message' }).click()
  await expect(ask.getByRole('alert')).toHaveText('No reply from Sophia. Try again: it won’t be done twice.')
  await ask.getByRole('button', { name: 'Try again' }).click()
  await expect(discussion(page).getByText('You withdrew this message.')).toBeVisible()
  const answers = await served(page)
  expect(answers.filter((s) => s === 'act:withdraw')).toHaveLength(1)
  expect(answers).toContain('act-replayed:withdraw')
})

test('acts · a message changed elsewhere is read again; the draft stays, and saving again goes', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.staleNextAct())
  await line(page, MINE).getByRole('button', { name: 'Edit' }).click()
  const field = page.getByRole('textbox', { name: 'Edit your message' })
  await field.fill('My own new words.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alert')).toHaveText('This message changed since you opened it. Check it and try again.')
  await expect(field).toHaveValue('My own new words.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(line(page, 'My own new words.')).toBeVisible()
  await expect(field).toHaveCount(0)
})

test('acts · a failure says so without a code, nothing changes, and the act can be tried again', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.failNextAct())
  await line(page, MINE).getByRole('button', { name: 'Withdraw' }).click()
  await page
    .getByRole('group', { name: 'Withdraw your message?' })
    .getByRole('button', { name: 'Withdraw message' })
    .click()
  await expect(line(page, MINE).getByRole('alert')).toHaveText('The change didn’t go through. Try again.')
  await expect(line(page, MINE)).toContainText(MINE)
  await line(page, MINE).getByRole('button', { name: 'Withdraw' }).click()
  await page
    .getByRole('group', { name: 'Withdraw your message?' })
    .getByRole('button', { name: 'Withdraw message' })
    .click()
  await expect(discussion(page).getByText('You withdrew this message.')).toBeVisible()
})

test('acts · Escape leaves the field and puts the focus back on Edit', async ({ page }) => {
  await enter(page)
  await line(page, MINE).getByRole('button', { name: 'Edit' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: 'Edit your message' })).toHaveCount(0)
  await expect(line(page, MINE).getByRole('button', { name: 'Edit' })).toBeFocused()
})
