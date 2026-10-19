import { expect, test, type Page } from '@playwright/test'

// Write to the room, not only to Sophia (docs/plans/room-discussion.md): the chat's message bar writes to the project's
// discussion always, through the contributions API (A05), and to Sophia while the person holds her conversation. Every
// message here is synthetic.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const chatToggle = (page: Page) => page.getByRole('button', { name: /^Chat/ }).first()
const bar = (page: Page) => page.locator('#converse-draft')
const target = (page: Page) => page.locator('.message-bar .bar-target')
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const view = (page: Page) =>
  page.evaluate(() => ({ asked: [...(window.fixture?.asked ?? [])], served: [...(window.fixture?.served ?? [])] }))
const toRoom = async (page: Page) => (await view(page)).served.filter((s) => s.startsWith('contribution:'))
const toSophia = async (page: Page) => (await view(page)).asked.filter((a) => a === 'chat')

async function enter(page: Page, query: string) {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
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

test('discussion · out of Sophia’s conversation, the bar writes to the room, and the message shows for everyone', async ({
  page,
}) => {
  await enter(page, 'people=2&floor=1')
  await expect(page.getByRole('button', { name: 'Chat with Sophia' })).toBeVisible()
  await expect(target(page)).toHaveText('To the room')
  await expect(bar(page)).toHaveAttribute('placeholder', 'Message the room…')
  await bar(page).fill('The deck is in Resources.')
  await bar(page).press('Enter')
  await expect(discussion(page).getByText('The deck is in Resources.')).toBeVisible()
  await expect(discussion(page).locator('.contribution').last()).toContainText('You')
  await expect(bar(page)).toHaveValue('')
  expect(await toRoom(page)).toEqual(['contribution:discuss'])
  expect(await toSophia(page)).toEqual([])
})

test('discussion · holding the floor with Sophia, the switch says where each message goes, and it goes only there', async ({
  page,
}) => {
  await enter(page, 'exchange=open')
  await expect(target(page)).toHaveText(/^To Sophia/)
  await bar(page).fill('A question for Sophia.')
  await bar(page).press('Enter')
  await expect.poll(() => toSophia(page)).toEqual(['chat'])
  await target(page).click()
  await expect(target(page)).toHaveText(/^To the room/)
  await expect(bar(page)).toHaveAttribute('placeholder', 'Message the room…')
  await bar(page).fill('A note for the others.')
  await bar(page).press('Enter')
  await expect(discussion(page).getByText('A note for the others.')).toBeVisible()
  expect(await toRoom(page)).toEqual(['contribution:discuss'])
  expect(await toSophia(page)).toEqual(['chat'])
})

test('discussion · a message whose reply is lost says so; Try again sends the same message: recorded once', async ({
  page,
}) => {
  await enter(page, 'people=2&floor=1')
  await page.evaluate(() => window.fixture?.loseNextContributionReply())
  await bar(page).fill('Once only.')
  await bar(page).press('Enter')
  await expect(page.getByText('Not confirmed: “Once only.”')).toBeVisible()
  await expect(bar(page)).toHaveValue('Once only.')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(bar(page)).toHaveValue('')
  await expect(page.getByText('Not confirmed: “')).toHaveCount(0)
  await expect(discussion(page).getByText('Once only.')).toHaveCount(1)
  expect(await toRoom(page)).toEqual(['contribution:discuss'])
})

test('discussion · offline, the bar says so before any press and sends nothing; back online, one message', async ({
  page,
  context,
}) => {
  await enter(page, 'people=2&floor=1')
  await bar(page).fill('From the train.')
  await context.setOffline(true)
  const line = page.locator('.composer .outcome')
  await expect(line).toHaveText('You’re offline, so this wasn’t sent. It waits here; send it once you’re back.')
  await expect(line.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await bar(page).press('Enter')
  await page.waitForTimeout(600) // a send let through would have gone by now
  expect(await toRoom(page)).toEqual([])
  await expect(page.getByText('Not confirmed')).toHaveCount(0)
  await expect(bar(page)).toHaveValue('From the train.')
  // Back online, the line goes and does not come back with the next press.
  await context.setOffline(false)
  await expect(line).toHaveCount(0)
  await bar(page).press('Enter')
  await expect(discussion(page).getByText('From the train.')).toHaveCount(1)
  await expect(line).toHaveCount(0)
  expect(await toRoom(page)).toEqual(['contribution:discuss'])
})

test('discussion · Shift+Enter starts a new line; Enter sends', async ({ page }) => {
  await enter(page, 'people=2&floor=1')
  await bar(page).fill('First line')
  await bar(page).press('Shift+Enter')
  await bar(page).pressSequentially('second line')
  await expect(bar(page)).toHaveValue('First line\nsecond line')
  expect(await toRoom(page)).toEqual([])
  await bar(page).press('Enter')
  await expect.poll(() => toRoom(page)).toEqual(['contribution:discuss'])
})

test('discussion · a message begun for Sophia is held when she can’t take it, never moved to the room on its own', async ({
  page,
}) => {
  await enter(page, 'exchange=open')
  await expect(target(page)).toHaveText(/^To Sophia/)
  await bar(page).fill('A question meant only for Sophia.')
  await page.evaluate(() => window.fixture?.drop())
  await expect(page.getByText('Sophia can’t take this message now. Send it to the room instead?')).toBeVisible()
  await expect(target(page)).toHaveText(/^To Sophia/)
  await bar(page).press('Enter')
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  expect(await toRoom(page)).toEqual([])
  expect(await toSophia(page)).toEqual([])
  // Only the person's own press moves it.
  await page.getByRole('button', { name: 'Move it to the room' }).click()
  await expect(target(page)).toHaveText(/^To the room/)
  await expect(bar(page)).toBeFocused()
  await bar(page).press('Enter')
  await expect(discussion(page).getByText('A question meant only for Sophia.')).toBeVisible()
  expect(await toRoom(page)).toEqual(['contribution:discuss'])
})

test('discussion · two Enters in a row post the message once', async ({ page }) => {
  await enter(page, 'people=2&floor=1')
  await bar(page).fill('Just once.')
  await bar(page).press('Enter')
  await bar(page).press('Enter')
  await expect(discussion(page).getByText('Just once.')).toHaveCount(1)
  expect(await toRoom(page)).toEqual(['contribution:discuss'])
})

test('discussion · after no reply, Try again sends the message it names; what was written since stays', async ({
  page,
}) => {
  await enter(page, 'people=2&floor=1')
  await page.evaluate(() => window.fixture?.loseNextContributionReply())
  await bar(page).fill('First message.')
  await bar(page).press('Enter')
  await expect(page.getByText('Not confirmed: “First message.”')).toBeVisible()
  await bar(page).fill('A second thought.')
  // Pressed twice, it still resends the one message it names, once; the words written since are not sent.
  await page.getByRole('button', { name: 'Try again' }).dblclick()
  await expect
    .poll(async () => (await view(page)).served.filter((s) => s === 'replayed:contribution'))
    .toEqual(['replayed:contribution'])
  await expect(page.getByText('Not confirmed: “')).toHaveCount(0)
  await expect(bar(page)).toHaveValue('A second thought.')
  await expect(discussion(page).getByText('First message.')).toHaveCount(1)
  expect(await toRoom(page)).toEqual(['contribution:discuss'])
})

test('discussion · back in Sophia’s conversation, the bar is hers again; an empty bar holds nothing', async ({
  page,
}) => {
  await enter(page, 'exchange=open')
  await target(page).click()
  await expect(target(page)).toHaveText(/^To the room/)
  await target(page).click()
  await expect(target(page)).toHaveText(/^To Sophia/)
  await page.evaluate(() => window.fixture?.drop())
  // Nothing written: nothing is held, and the bar writes to the room meanwhile.
  await expect(target(page)).toHaveText(/^To the room/)
  await expect(page.getByText('Sophia can’t take this message now.', { exact: false })).toHaveCount(0)
  await page.getByRole('button', { name: 'Chat with Sophia' }).click()
  await expect(target(page)).toHaveText(/^To Sophia/)
})

test('discussion · a message moved to the room, then Sophia’s conversation again: the bar is hers again', async ({
  page,
}) => {
  await enter(page, 'exchange=open')
  await bar(page).fill('Meant for Sophia, sent to the room.')
  await page.evaluate(() => window.fixture?.drop())
  await page.getByRole('button', { name: 'Move it to the room' }).click()
  await bar(page).press('Enter')
  await expect(discussion(page).getByText('Meant for Sophia, sent to the room.')).toBeVisible()
  await page.getByRole('button', { name: 'Chat with Sophia' }).click()
  await expect(target(page)).toHaveText(/^To Sophia/)
})

// Nothing written is cut (docs/plans/room-message-length.md): past the most a message holds, the count says how far
// over and Send waits. The room takes 4000 characters (A05); Sophia's typed turn, a chat packet of 2000.
const count = (page: Page) => page.locator('#bar-count')
const send = (page: Page) => page.locator('.message-bar').getByRole('button', { name: 'Send', exact: true })

test('discussion · a long message for the room is never cut: the count says how far over, and Send waits', async ({
  page,
}) => {
  await enter(page, 'people=2&floor=1')
  await bar(page).focus()
  await page.keyboard.insertText('a'.repeat(4100))
  await expect(bar(page)).toHaveValue('a'.repeat(4100))
  await expect(count(page)).toHaveText('4,100 / 4,000 · 100 over')
  await expect(send(page)).toBeDisabled()
  await bar(page).press('Enter')
  expect(await toRoom(page)).toEqual([])
  await bar(page).fill('a'.repeat(4000))
  await expect(count(page)).toHaveText('4,000 / 4,000 · the most one message holds')
  await bar(page).press('Enter')
  await expect.poll(() => toRoom(page)).toEqual(['contribution:discuss'])
})

test('discussion · to Sophia the most is 2000; switched to the room, the same words fit', async ({ page }) => {
  await enter(page, 'exchange=open')
  await expect(target(page)).toHaveText(/^To Sophia/)
  await bar(page).focus()
  await page.keyboard.insertText('a'.repeat(2100))
  await expect(count(page)).toHaveText('2,100 / 2,000 · 100 over')
  await expect(send(page)).toBeDisabled()
  await target(page).click()
  await expect(target(page)).toHaveText(/^To the room/)
  await expect(count(page)).toHaveCount(0)
  await expect(send(page)).toBeEnabled()
})
