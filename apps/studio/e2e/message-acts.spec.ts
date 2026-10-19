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

async function enter(page: Page, query = 'acts=1') {
  await page.goto(`/room.html?call=on&discussion=mine&${query}`)
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
  // The focus the field held goes on to the message's Edit, not to the page.
  await expect(fixed.getByRole('button', { name: 'Edit' })).toBeFocused()
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
  // The focus the question held goes on to the message's place.
  await expect(discussion(page).locator('.contribution.withdrawn')).toBeFocused()

  await line(page, SHARED).getByRole('button', { name: 'Withdraw' }).click()
  const shared = page.getByRole('group', { name: 'Withdraw your message?' })
  await expect(shared).toContainText('The report or file it shared stays as it is.')
  await expect(shared).not.toContainText('AI provider')
  await shared.getByRole('button', { name: 'Cancel' }).click()
  await expect(line(page, SHARED)).toBeVisible()
})

test('acts · a correction whose reply is lost is asked again with the same key, never done twice', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.loseNextActReply())
  await line(page, MINE).getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill('Meet at eleven.')
  await page.getByRole('button', { name: 'Save' }).click()
  const ask = page.getByRole('group', { name: 'Save your edit?' })
  await expect(ask.getByRole('alert')).toHaveText('No reply from Sophia. Try again: it won’t be done twice.')
  await ask.getByRole('button', { name: 'Try again' }).click()
  await expect(ask).toHaveCount(0)
  await expect(line(page, 'Meet at eleven.')).toBeVisible()
  const answers = await served(page)
  expect(answers.filter((s) => s === 'act:correct')).toHaveLength(1)
  expect(answers).toContain('act-replayed:correct')
})

test('acts · a withdrawal whose reply is lost still shows once the chat reads it: done once, never twice', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.loseNextActReply())
  await line(page, MINE).getByRole('button', { name: 'Withdraw' }).click()
  await page
    .getByRole('group', { name: 'Withdraw your message?' })
    .getByRole('button', { name: 'Withdraw message' })
    .click()
  // It landed: the next read of the chat shows the message's place, and the question goes with the message.
  await expect(discussion(page).getByText('You withdrew this message.')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Withdraw your message?' })).toHaveCount(0)
  await expect(page.getByText(MINE)).toHaveCount(0)
  expect((await served(page)).filter((s) => s === 'act:withdraw')).toHaveLength(1)
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
  // Escape spent on the edit leaves the chat open.
  await expect(line(page, MINE).getByRole('button', { name: 'Edit' })).toBeFocused()
  await line(page, MINE).getByRole('button', { name: 'Withdraw' }).click()
  await expect(
    page.getByRole('group', { name: 'Withdraw your message?' }).getByRole('button', { name: 'Withdraw message' }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: 'Withdraw your message?' })).toHaveCount(0)
  await expect(line(page, MINE)).toBeVisible()
})

test('acts · work that started reading the words since the preview makes it stale; the next preview says so', async ({
  page,
}) => {
  await enter(page)
  await line(page, MINE).getByRole('button', { name: 'Withdraw' }).click()
  const ask = page.getByRole('group', { name: 'Withdraw your message?' })
  await expect(ask).not.toContainText('research task')
  // A research task starts reading the message while the member decides.
  await page.evaluate(() => window.fixture?.reachNextPreview(1))
  await ask.getByRole('button', { name: 'Withdraw message' }).click()
  await expect(line(page, MINE).getByRole('alert')).toHaveText(
    'This message changed since you opened it. Check it and try again.',
  )
  await expect(line(page, MINE)).toContainText(MINE)
  await line(page, MINE).getByRole('button', { name: 'Withdraw' }).click()
  const again = page.getByRole('group', { name: 'Withdraw your message?' })
  await expect(again).toContainText('One research task that read them will stop and start again without them.')
  await again.getByRole('button', { name: 'Withdraw message' }).click()
  await expect(discussion(page).getByText('You withdrew this message.')).toBeVisible()
  expect(await served(page)).toEqual(expect.arrayContaining(['act-stale:withdraw', 'act:withdraw']))
})

test('acts · a viewer acts on their own messages, never on another member’s', async ({ page }) => {
  await enter(page, 'acts=1&role=viewer')
  await expect(line(page, MINE).getByRole('button', { name: 'Edit' })).toBeVisible()
  await expect(line(page, 'Sounds good to me.').getByRole('button', { name: /Edit|Withdraw/ })).toHaveCount(0)
  await line(page, MINE).getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill('A viewer’s corrected words.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(line(page, 'A viewer’s corrected words.')).toBeVisible()
})

test('acts · without the acts the chat is as it was: no Edit, no Withdraw, every message in its words', async ({
  page,
}) => {
  await enter(page, 'role=admin')
  await expect(discussion(page).locator('.contribution-text')).toHaveText([MINE, 'Sounds good to me.', SHARED])
  await expect(discussion(page).getByRole('button', { name: /^(Edit|Withdraw)$/ })).toHaveCount(0)
  await expect(discussion(page).getByText('Edited')).toHaveCount(0)
})

test('acts · a correction under way can’t be cancelled: Cancel and Escape wait for its answer, which then shows', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.holdActs())
  await line(page, MINE).getByRole('button', { name: 'Edit' }).click()
  const field = page.getByRole('textbox', { name: 'Edit your message' })
  await field.fill('Meet at one.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeVisible()
  await expect.poll(() => served(page)).toContain('act:correct')
  // Sent: neither Cancel nor Escape pretends to call it back, and the chat stays open.
  const cancel = page.getByRole('button', { name: 'Cancel' })
  await expect(cancel).toHaveAttribute('aria-disabled', 'true')
  // Pressed anyway (a disabled control still takes a click): nothing is undone.
  await cancel.click({ force: true })
  await field.press('Escape')
  await expect(field).toHaveValue('Meet at one.')
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeVisible()
  await page.evaluate(() => window.fixture?.releaseActs())
  await expect(field).toHaveCount(0)
  await expect(line(page, 'Meet at one.')).toBeVisible()
  expect((await served(page)).filter((s) => s === 'act:correct')).toHaveLength(1)
})

test('acts · a lost answer can only be asked again: no Cancel, and Escape keeps the question', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => {
    window.fixture?.reachNextPreview(1)
    window.fixture?.loseNextActReply()
  })
  await line(page, MINE).getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill('Meet at two.')
  await page.getByRole('button', { name: 'Save' }).click()
  const ask = page.getByRole('group', { name: 'Save your edit?' })
  await ask.getByRole('button', { name: 'Save anyway' }).click()
  await expect(ask.getByRole('alert')).toHaveText('No reply from Sophia. Try again: it won’t be done twice.')
  await expect(ask.getByRole('button', { name: /Keep editing|Cancel/ })).toHaveCount(0)
  await ask.getByRole('button', { name: 'Try again' }).focus()
  await page.keyboard.press('Escape')
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'Try again' }).click()
  await expect(ask).toHaveCount(0)
  expect((await served(page)).filter((s) => s === 'act:correct')).toHaveLength(1)
})

// Codex P2 on #409 (r4312346262): an act's answer that arrives after the person has gone on to another control leaves
// the focus where they put it; the act still shows its result.
test('acts · a correction answered after the focus went elsewhere leaves it there; the correction shows', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.holdActs())
  await line(page, MINE).getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill('Meet at two.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => served(page)).toContain('act:correct')
  const elsewhere = line(page, SHARED).getByRole('button', { name: 'Withdraw' })
  await elsewhere.focus()
  await page.evaluate(() => window.fixture?.releaseActs())
  await expect(line(page, 'Meet at two.').getByText('Edited')).toBeVisible()
  await expect(elsewhere).toBeFocused()
})

test('acts · a withdrawal answered after the focus went elsewhere leaves it there; the message’s place shows', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.holdActs())
  await line(page, MINE).getByRole('button', { name: 'Withdraw' }).click()
  await page
    .getByRole('group', { name: 'Withdraw your message?' })
    .getByRole('button', { name: 'Withdraw message' })
    .click()
  await expect.poll(() => served(page)).toContain('act:withdraw')
  const elsewhere = line(page, SHARED).getByRole('button', { name: 'Withdraw' })
  await elsewhere.focus()
  await page.evaluate(() => window.fixture?.releaseActs())
  await expect(discussion(page).getByText('You withdrew this message.')).toBeVisible()
  await expect(elsewhere).toBeFocused()
})

test('acts · a correction answered while the chat is closed never takes the focus when it opens again', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.holdActs())
  await line(page, MINE).getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill('Meet at three.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => served(page)).toContain('act:correct')
  await chatToggle(page).click()
  await expect(discussion(page)).toBeHidden()
  await page.evaluate(() => window.fixture?.releaseActs())
  await chatToggle(page).click()
  const fixed = line(page, 'Meet at three.')
  await expect(fixed.getByText('Edited')).toBeVisible()
  await expect(fixed.getByRole('button', { name: 'Edit' })).not.toBeFocused()
})
