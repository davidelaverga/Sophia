import { expect, test, type Page } from '@playwright/test'

// LFE-00's preservation checks (BASE-01 … BASE-03): the Studio's own ProjectShell, with its feed, query cache and
// room controller, on the labelled fixture page; only the API and LiveKit are faked. A request to any other origin is
// aborted, and each check ends by asking the page whether anything reached for the API beyond what it answers.

/** Joining on opening, with Sophia's conversation open and this viewer holding the floor: the message bar is there. */
const IN_CALL = '/room.html?call=on&exchange=open'

/** What the room's connection was asked, what the API answered and what it didn't expect (fixtures/room.tsx). */
const fixture = (page: Page) =>
  page.evaluate(() => {
    const view = window.fixture
    if (!view) throw new Error('the fixture page did not start')
    return { asked: [...view.asked], served: [...view.served], unexpected: [...view.unexpected] }
  })
const asked = async (page: Page) => (await fixture(page)).asked
/** A background update: an event on the project's stream, then a new snapshot and brief behind it. */
const update = (page: Page) => page.evaluate(() => window.fixture?.update())
/** Another member writes in the room's discussion. */
const say = (page: Page, text: string) => page.evaluate((t) => window.fixture?.say(t), text)

const toggle = (page: Page, name: 'Chat' | 'Brief') => page.getByRole('button', { name, exact: true })
const tab = (page: Page, name: 'Chat' | 'Brief') => page.getByRole('tab', { name, exact: true })
const messageBar = (page: Page) => page.getByRole('textbox', { name: 'Message Sophia', exact: true })
const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })

/** Opens the page and waits for the call: connected, and the microphone arrived. */
async function enter(page: Page, url: string) {
  await page.goto(url)
  await expect(leave(page)).toBeVisible()
  await expect.poll(() => asked(page)).toContain('microphone:on')
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect((await fixture(page)).unexpected, 'requests the fixture did not expect').toEqual([])
})

test('BASE-01 · unsent words and a brief edit survive switching, a background update, closing and reopening', async ({
  page,
}) => {
  await enter(page, IN_CALL)
  await toggle(page, 'Chat').click()
  await messageBar(page).fill('Words not sent yet')
  await tab(page, 'Brief').click()
  await page.getByRole('button', { name: 'Edit direction' }).click()
  await page.getByLabel('Direction').fill('A direction of my own, being written')

  await update(page) // the project and its brief move on while the person writes
  await expect
    .poll(async () => (await fixture(page)).served, { message: 'the update reached the page' })
    .toEqual(expect.arrayContaining(['snapshot:2', 'mission:2']))
  await expect(page.getByLabel('Direction')).toHaveValue('A direction of my own, being written')
  await tab(page, 'Chat').click()
  await expect(messageBar(page)).toHaveValue('Words not sent yet')

  await page.getByRole('button', { name: 'Close' }).click()
  await toggle(page, 'Brief').click()
  await expect(page.getByLabel('Direction')).toHaveValue('A direction of my own, being written')
  await tab(page, 'Chat').click()
  await expect(messageBar(page)).toHaveValue('Words not sent yet')
})

test('BASE-01 · a message that arrives out of view marks Chat until it is seen, and only then', async ({ page }) => {
  await enter(page, IN_CALL)
  const marked = page.getByRole('button', { name: 'Chat, something new', exact: true })
  await say(page, 'Seen as it arrives') // the panel is closed: this one is unread
  await expect(marked).toBeVisible()
  await marked.click()
  await expect(page.getByText('Seen as it arrives')).toBeVisible()
  await expect(toggle(page, 'Chat')).toBeVisible() // read: the mark is gone

  await say(page, 'Read while the chat is open') // in view: nothing to mark
  await expect(page.getByText('Read while the chat is open')).toBeVisible()
  await tab(page, 'Brief').click()
  await expect(toggle(page, 'Chat')).toBeVisible()
  await say(page, 'Written while the brief is open') // the chat is out of view again
  await expect(marked).toBeVisible()
  await tab(page, 'Chat').click()
  await expect(toggle(page, 'Chat')).toBeVisible()
})

test('BASE-02 · letters typed on a panel tab or with the focus nowhere reach the message bar; nothing turns on', async ({
  page,
}) => {
  await enter(page, IN_CALL)
  const before = await asked(page)
  // d, e and j are the microphone, camera and join keys with the command key: alone they are only letters. With the
  // panel closed no message bar is on screen, so nothing takes them as text either.
  await page.keyboard.type('dej')
  expect(await asked(page), 'what the room was asked').toEqual(before)
  await toggle(page, 'Chat').click()
  await tab(page, 'Chat').focus()
  await page.keyboard.type('dej ')
  await expect(messageBar(page)).toHaveValue('dej ')
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await page.keyboard.type('made')
  await expect(messageBar(page)).toHaveValue('dej made')
  expect(await asked(page), 'what the room was asked').toEqual(before)
})

test('BASE-02 · leaving text mode turns it off once and hands the focus to the microphone beside it', async ({
  page,
}) => {
  await enter(page, IN_CALL)
  await toggle(page, 'Chat').click()
  await messageBar(page).fill('A question, typed')
  await messageBar(page).press('Enter') // typing to Sophia puts the call in text mode
  const textMode = page.getByRole('button', { name: /^Text mode/ })
  await expect(textMode).toHaveAttribute('aria-pressed', 'true')
  expect(await asked(page)).toEqual(expect.arrayContaining(['text:on', 'chat']))

  const before = (await asked(page)).length
  await textMode.click()
  await expect(textMode).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Microphone' })).toBeFocused()
  expect((await asked(page)).slice(before)).toEqual(['text:off'])
})

test('BASE-03 @phone · in a call with the panel open, mute, sending and a refused device stay in reach', async ({
  page,
}) => {
  await enter(page, `${IN_CALL}&refuse=camera`)
  await page.getByRole('button', { name: 'Camera' }).click() // from the dock; the browser refuses it
  await toggle(page, 'Chat').click()
  const panel = page.getByRole('complementary', { name: 'Chat' })
  await expect(panel.getByText('Camera blocked. Allow it in the address bar.')).toBeInViewport()
  const mute = panel.getByRole('button', { name: 'Microphone' })
  await expect(mute).toBeInViewport()
  await expect(mute).toHaveAttribute('aria-pressed', 'true') // sending: the microphone is on
  await mute.click() // a tap reaches it: nothing covers it
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  expect((await asked(page)).slice(-2)).toEqual(['camera:on', 'microphone:off'])
})

test('BASE-03 @phone · leaving, a lost connection and the way back stay in reach', async ({ page }) => {
  await enter(page, IN_CALL)
  await toggle(page, 'Chat').click()
  await page.getByRole('complementary', { name: 'Chat' }).getByRole('button', { name: 'Close' }).click()
  await expect(leave(page)).toBeInViewport()
  await leave(page).click()
  const back = page.getByRole('button', { name: /^Join the room/ })
  await expect(back).toBeInViewport()
  await back.click()
  await expect(leave(page)).toBeInViewport()

  // The panel covers the room on a phone: wherever it is open, the lost call is said and the way back is in reach.
  await toggle(page, 'Chat').click()
  const panel = page.getByRole('complementary', { name: 'Chat' })
  await page.evaluate(() => window.fixture?.drop()) // the connection is lost
  const lost = 'You were disconnected from the room.'
  const foot = panel.locator('.composer .outcome') // the chat's foot says it while the chat is in view
  await expect(foot).toHaveText(lost)
  await expect(foot).toBeInViewport()
  await expect(panel.getByRole('button', { name: /^Chat with Sophia/ })).toBeInViewport()
  await tab(page, 'Brief').click()
  const line = page.getByRole('complementary', { name: 'Brief' }).locator('.side-panel-note') // the panel's own line
  await expect(line).toHaveText(lost)
  await expect(line).toBeInViewport()

  await page.getByRole('complementary', { name: 'Brief' }).getByRole('button', { name: 'Close' }).click()
  const retry = page.getByRole('button', { name: /^Try again/ })
  await expect(retry).toBeInViewport()
  await retry.click()
  await expect(leave(page)).toBeInViewport()
  const calls = (await asked(page)).filter((a) => a === 'connect' || a === 'leave')
  expect(calls, 'joined, left, joined again, lost, and joined once more').toEqual([
    'connect',
    'leave',
    'connect',
    'connect',
  ])
})

test('BASE-03 @phone · after a lost call, Chat with Sophia in the open panel brings the call back, in text', async ({
  page,
}) => {
  await enter(page, IN_CALL)
  await toggle(page, 'Chat').click()
  const panel = page.getByRole('complementary', { name: 'Chat' })
  await page.evaluate(() => window.fixture?.drop()) // the connection is lost while the panel covers the room
  const before = (await asked(page)).length
  await panel.getByRole('button', { name: /^Chat with Sophia/ }).tap()
  await expect(panel.getByRole('button', { name: 'Microphone' })).toHaveAttribute('aria-pressed', 'false')
  await expect(panel.getByRole('button', { name: /^Text mode/ })).toBeInViewport()
  await expect(panel.locator('.composer .outcome')).toHaveCount(0) // the lost call is no longer said
  const since = (await asked(page)).slice(before)
  // Out of the call, text mode is remembered; the join applies it as it connects, before any microphone arrives.
  expect(since.slice(0, 2)).toEqual(['connect', 'text:on'])
  expect(since, 'no microphone turns on').not.toContain('microphone:on')
})
