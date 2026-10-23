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
/** The dock's own controls; the microphone shows there only in the call. */
const controls = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const microphone = (page: Page) => controls(page).getByRole('button', { name: 'Microphone' })
/** The room tokens asked for: the fixture records each one (fixtures/fixture-api.ts). */
const tokens = async (page: Page) => (await fixture(page)).served.filter((s) => s === 'room-token')
/** How many connections the room opened. */
const connects = async (page: Page) => (await asked(page)).filter((a) => a === 'connect').length
/** The connection is lost, and its one try back in fails (call-rejoin.md): the lost call stays said, with Try again. */
const dropForGood = (page: Page) =>
  page.evaluate(() => {
    window.fixture?.failToken()
    window.fixture?.drop()
  })
const OFFLINE_REJOIN = 'You’re offline, so the call ended here. Back online, you rejoin it automatically.'

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
  // Leaving opens what the meeting left (room-recap.spec.ts); put away, the way back is in reach.
  await page.getByRole('dialog', { name: 'This meeting' }).getByRole('button', { name: 'Close', exact: true }).click()
  const back = page.getByRole('button', { name: /^Join the room/ })
  await expect(back).toBeInViewport()
  await back.click()
  await expect(leave(page)).toBeInViewport()

  // The panel covers the room on a phone: wherever it is open, the lost call is said and the way back is in reach.
  await toggle(page, 'Chat').click()
  const panel = page.getByRole('complementary', { name: 'Chat' })
  await dropForGood(page) // the connection is lost, and can't be found again
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
  await dropForGood(page) // the connection is lost while the panel covers the room
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

test('BASE-03 · offline, a lost call says so and waits; back online it rejoins without a press (seam #8, call-rejoin.md)', async ({
  page,
  context,
}) => {
  await enter(page, '/room.html?call=on')
  await context.setOffline(true)
  await page.evaluate(() => window.fixture?.drop()) // the connection is lost with the network
  const note = page.locator('.dock-wrap .dock-note')
  await expect(note).toHaveText(OFFLINE_REJOIN)
  await expect(note).toHaveAttribute('role', 'status')
  const before = (await asked(page)).length
  const asking = (await tokens(page)).length
  await page.getByRole('button', { name: /^Try again/ }).click()
  await page.waitForTimeout(600) // a join let through would have connected by now
  expect((await asked(page)).slice(before), 'nothing is asked offline').toEqual([])
  expect(await tokens(page)).toHaveLength(asking)
  await expect(note).toHaveText(OFFLINE_REJOIN)
  await expect(page.getByText('The room isn’t available')).toHaveCount(0)
  await context.setOffline(false)
  await expect(microphone(page)).toBeVisible() // back in, nothing pressed
  await expect(note).toHaveText('Reconnected.')
  expect((await asked(page)).slice(before).filter((a) => a === 'connect')).toEqual(['connect'])
  expect(await tokens(page), 'one try, once online').toHaveLength(asking + 1)
})

test('BASE-03 · offline, Try again after a rejoin that failed asks for nothing and never says the room isn’t available', async ({
  page,
  context,
}) => {
  await enter(page, '/room.html?call=on')
  await context.setOffline(true)
  await page.evaluate(() => window.fixture?.drop()) // the connection is lost with the network
  const note = page.locator('.dock-wrap .dock-note')
  const offline = 'You’re offline, so the call ended here. Join again once you’re back.'
  await expect(note).toHaveText(OFFLINE_REJOIN)
  // Back online, its one try back in fails (call-rejoin.md): the lost call is said again, with Try again.
  await page.evaluate(() => window.fixture?.failToken())
  await context.setOffline(false)
  await expect(note).toHaveText('You were disconnected from the room.')
  // Online, Try again fails as the room's own trouble, and says so.
  await page.evaluate(() => window.fixture?.failToken())
  await page.getByRole('button', { name: /^Try again/ }).click()
  await expect(note).toHaveText('The room isn’t available right now. Try again in a moment.')
  // Offline again, the call is still lost: Try again could reach nothing, so it asks for nothing and says offline. A
  // token asked for now would fail as the room's (the fixture's fetch never goes offline).
  await context.setOffline(true)
  await page.evaluate(() => window.fixture?.failToken())
  await page.getByRole('button', { name: /^Try again/ }).click()
  await expect(note).toHaveText(offline)
  await expect(page.getByText('The room isn’t available')).toHaveCount(0)
  await context.setOffline(false)
  await expect(note).toHaveText('You’re back online. Try again rejoins the call.')
})

test('BASE-03 · a call lost offline is said from a polite line that was in the dock before it spoke', async ({
  page,
  context,
}) => {
  await enter(page, '/room.html?call=on')
  // A live region added with its words is often not read: the polite line is there, empty, before the call is lost.
  // The blocked-sound line (sound-blocked-others.md) is the dock's other polite line, and is not this one.
  const polite = page.locator('.dock-wrap > p[role="status"]:not(.dock-sound)')
  await expect(polite).toHaveCount(1)
  await expect(polite).toHaveText('')
  await polite.evaluate((el) => el.setAttribute('data-before', ''))
  await context.setOffline(true)
  await page.evaluate(() => window.fixture?.drop())
  await expect(page.locator('.dock-wrap > p[data-before]')).toHaveText(OFFLINE_REJOIN)
  await expect(page.locator('.dock-wrap [role="alert"]')).toHaveCount(0)
  await context.setOffline(false)
  // Back in on its own (call-rejoin.md), said once from the same line.
  await expect(page.locator('.dock-wrap > p[data-before]')).toHaveText('Reconnected.')
  await expect(page.locator('.dock-wrap [role="alert"]')).toHaveCount(0)
})

test('BASE-03 · from another view, the header dock says a call lost offline from a polite line there before', async ({
  page,
  context,
}) => {
  await page.goto('/room.html?call=on&place=work')
  const dock = page.locator('.mini-dock')
  await expect(dock.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  const polite = dock.locator('.dock-notes > p[role="status"]')
  await expect(polite).toHaveCount(1)
  await expect(polite).toHaveText('')
  await polite.evaluate((el) => el.setAttribute('data-before', ''))
  await context.setOffline(true)
  await page.evaluate(() => window.fixture?.drop())
  await expect(dock.locator('.dock-notes > p[data-before]')).toHaveText(OFFLINE_REJOIN)
  await expect(dock.locator('.dock-notes [role="alert"]')).toHaveCount(0)
  // Leave stays while the call waits to come back (call-rejoin.md).
  await expect(dock.getByRole('button', { name: 'Leave the room' })).toBeVisible()
})

test('BASE-03 · a dropped call rejoins on its own within 10 s, once, and says so politely (reliability gap #9)', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  // Said from the dock's polite line, there before it speaks.
  const polite = page.locator('.dock-wrap > p[role="status"]:not(.dock-sound)')
  await expect(polite).toHaveText('')
  await polite.evaluate((el) => el.setAttribute('data-before', ''))
  const [connected, asking] = [await connects(page), (await tokens(page)).length]
  const hellos = async () => (await asked(page)).filter((a) => a === 'text:off').length
  const said = await hellos()
  const dropped = Date.now()
  await page.evaluate(() => window.fixture?.drop())
  await expect.poll(() => connects(page), { timeout: 10_000, message: 'a new connection' }).toBe(connected + 1)
  await expect(microphone(page)).toBeVisible()
  expect(Date.now() - dropped, 'back in within 10 s, nothing pressed').toBeLessThan(10_000)
  // Back in, the new call says its mode to Sophia, as every join does (CX-0022): the bridge sends the cards again.
  await expect.poll(hellos).toBe(said + 1)
  const line = page.locator('.dock-wrap > p[data-before]')
  await expect(line).toHaveText('Reconnected.')
  await expect(page.locator('.dock-wrap [role="alert"]')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'This meeting' })).toHaveCount(0) // a drop is no Leave: no recap
  expect(await tokens(page), 'a fresh token').toHaveLength(asking + 1)
  await expect(line).toHaveText('', { timeout: 10_000 }) // said once, then gone
  expect(await tokens(page), 'one try').toHaveLength(asking + 1)
})

test('BASE-03 · while a dropped call rejoins, the dock says so and Leave stays; Leave stops it and nothing joins', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  const connected = await connects(page)
  await page.evaluate(() => {
    window.fixture?.holdToken(true)
    window.fixture?.drop()
  })
  const note = page.locator('.dock-wrap .dock-note')
  await expect(note).toHaveText('Connection lost. Rejoining the call…')
  await expect(note).toHaveAttribute('role', 'status')
  await expect(page.locator('.dock-wrap [role="alert"]')).toHaveCount(0)
  await expect(controls(page).getByRole('button', { name: /^Joining/ })).toBeDisabled()
  await controls(page).getByRole('button', { name: 'Leave the room' }).click()
  await page.evaluate(() => window.fixture?.holdToken(false))
  const join = controls(page).getByRole('button', { name: /^Join the room/ })
  await expect(join).toBeEnabled()
  await expect(join).toBeFocused()
  await expect(note).toHaveCount(0)
  await page.waitForTimeout(600) // the token let go would have connected by now
  expect(await connects(page), 'nothing joined').toBe(connected)
  await expect(page.getByRole('dialog', { name: 'This meeting' })).toHaveCount(0)
})

test('BASE-03 · a try back in that fails says the lost call as before, with Try again, and isn’t made twice', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  const asking = (await tokens(page)).length
  await dropForGood(page)
  const note = page.locator('.dock-wrap .dock-note')
  await expect(note).toHaveText('You were disconnected from the room.')
  await expect(note).toHaveAttribute('role', 'alert')
  const retry = controls(page).getByRole('button', { name: /^Try again/ })
  await expect(retry).toBeEnabled()
  expect(await tokens(page), 'one try').toHaveLength(asking + 1)
  await expect(controls(page).getByRole('button', { name: 'Leave the room' })).toHaveCount(0) // nothing waits now
  await page.waitForTimeout(1500)
  expect(await tokens(page), 'and no second').toHaveLength(asking + 1)
  await retry.click()
  await expect(microphone(page)).toBeVisible()
})

test('BASE-03 · a call that drops again right after it came back is left to the person: one try for one drop', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  const [connected, asking] = [await connects(page), (await tokens(page)).length]
  await page.evaluate(() => window.fixture?.drop())
  await expect.poll(() => connects(page)).toBe(connected + 1)
  await expect(microphone(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.drop())
  await expect(page.locator('.dock-wrap .dock-note')).toHaveText('You were disconnected from the room.')
  await expect(controls(page).getByRole('button', { name: /^Try again/ })).toBeEnabled()
  await page.waitForTimeout(600)
  expect(await tokens(page), 'the one try only').toHaveLength(asking + 1)
})

test('BASE-03 · a microphone off when the call dropped comes back off, whatever this device chose since (review P1)', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  await microphone(page).click() // muted by the dock
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false')
  // Settings, or another tab, then chose to join with the microphone on: this call's microphone stays as it was.
  await page.evaluate(() => localStorage.setItem('sophia.mic.v1', 'on'))
  const [before, connected] = [(await asked(page)).length, await connects(page)]
  await page.evaluate(() => window.fixture?.drop())
  await expect.poll(() => connects(page)).toBe(connected + 1)
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false')
  expect((await asked(page)).slice(before), 'the microphone stays off').not.toContain('microphone:on')
})

test('BASE-03 · a microphone muted while the call reconnects comes back off when the call then drops (review P1, round 2)', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => window.fixture?.linkLost(true)) // «Reconnecting…»
  await microphone(page).click()
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false')
  const [before, connected] = [(await asked(page)).length, await connects(page)]
  await page.evaluate(() => window.fixture?.drop()) // LiveKit gives up
  await expect.poll(() => connects(page)).toBe(connected + 1)
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false')
  expect((await asked(page)).slice(before), 'the microphone stays off').not.toContain('microphone:on')
})

test('BASE-03 · a try left with Leave leaves the next Join to the person’s own choice (review P2, round 2)', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => {
    window.fixture?.holdToken(true)
    window.fixture?.drop()
  })
  await controls(page).getByRole('button', { name: 'Leave the room' }).click()
  await page.evaluate(() => window.fixture?.holdToken(false)) // the abandoned try's token comes back
  const join = controls(page).getByRole('button', { name: /^Join the room/ })
  await expect(join).toBeEnabled()
  await page.evaluate(() => localStorage.setItem('sophia.mic.v1', 'off')) // Settings: join with the microphone off
  const before = (await asked(page)).length
  await join.click()
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false')
  expect((await asked(page)).slice(before), 'the microphone stays off').not.toContain('microphone:on')
})

test('BASE-03 · «join with the microphone off» chosen while a dropped call waits offline holds when it comes back (review P1, round 3)', async ({
  page,
  context,
}) => {
  await enter(page, '/room.html?call=on')
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true')
  await context.setOffline(true)
  await page.evaluate(() => window.fixture?.drop())
  await expect(page.locator('.dock-wrap .dock-note')).toHaveText(OFFLINE_REJOIN)
  await page.evaluate(() => localStorage.setItem('sophia.mic.v1', 'off')) // Settings, during the wait
  const [before, connected] = [(await asked(page)).length, await connects(page)]
  await context.setOffline(false)
  await expect.poll(() => connects(page)).toBe(connected + 1)
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false')
  expect((await asked(page)).slice(before), 'the microphone stays off').not.toContain('microphone:on')
})

test('BASE-03 · «join with the microphone off» chosen after a dropped call holds for Try again (review P1, round 3)', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true')
  await dropForGood(page)
  const retry = controls(page).getByRole('button', { name: /^Try again/ })
  await expect(retry).toBeEnabled()
  await page.evaluate(() => localStorage.setItem('sophia.mic.v1', 'off')) // Settings, minutes later
  const before = (await asked(page)).length
  await retry.click()
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false')
  expect((await asked(page)).slice(before), 'the microphone stays off').not.toContain('microphone:on')
})

test('BASE-03 · muted by an admin, a dropped call’s Try again keeps the microphone off too (review P1)', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => window.fixture?.mutedByHost()) // from the server: this device's own choice is still «on»
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false')
  const before = (await asked(page)).length
  await dropForGood(page)
  await controls(page)
    .getByRole('button', { name: /^Try again/ })
    .click()
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false')
  expect((await asked(page)).slice(before), 'the microphone stays off').not.toContain('microphone:on')
})

test('BASE-03 · a call LiveKit left itself, as the page left or froze, never rejoins on its own (review P2)', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  const asking = (await tokens(page)).length
  await page.evaluate(() => window.fixture?.drop('dropped', true))
  await expect(page.locator('.dock-wrap .dock-note')).toHaveText('You were disconnected from the room.')
  await page.waitForTimeout(600) // a try would have asked for its token by now
  expect(await tokens(page)).toHaveLength(asking)
  await expect(controls(page).getByRole('button', { name: /^Try again/ })).toBeEnabled()
})

test('BASE-03 · a try whose token comes back too late goes no further and says the lost call (review P2)', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  const connected = await connects(page)
  await page.evaluate(() => {
    window.fixture?.holdToken(true)
    window.fixture?.drop()
  })
  await expect(page.locator('.dock-wrap .dock-note')).toHaveText('Connection lost. Rejoining the call…')
  // The page froze with the token on its way and wakes ten minutes later, as a tab left in the back-forward cache.
  await page.evaluate(() => {
    const real = Date.now.bind(Date)
    Date.now = () => real() + 10 * 60_000
    window.fixture?.holdToken(false)
  })
  await expect(page.locator('.dock-wrap .dock-note')).toHaveText('You were disconnected from the room.')
  await expect(controls(page).getByRole('button', { name: /^Try again/ })).toBeEnabled()
  expect(await connects(page), 'nothing connected').toBe(connected)
})

test('BASE-03 · a dropped call never comes back on its own while another tab of this browser holds it (review P2)', async ({
  page,
  context,
}) => {
  await enter(page, '/room.html?call=on')
  // The person moved to another tab of this browser and joined there.
  const other = await context.newPage()
  await other.goto('/room.html?call=on')
  await expect(controls(other).getByRole('button', { name: 'Microphone' })).toBeVisible()
  const asking = (await tokens(page)).length
  await page.evaluate(() => window.fixture?.drop())
  await expect(page.locator('.dock-wrap .dock-note')).toHaveText('You were disconnected from the room.')
  await page.waitForTimeout(600) // a try would have asked for its token by now
  expect(await tokens(page), 'the call stays in the other tab').toHaveLength(asking)
  // Once the other tab has left, this one's next drop comes back on its own again.
  await controls(other).getByRole('button', { name: 'Leave the room' }).click()
  await controls(page)
    .getByRole('button', { name: /^Try again/ })
    .click()
  await expect(microphone(page)).toBeVisible()
  const back = (await tokens(page)).length
  await page.evaluate(() => window.fixture?.drop())
  await expect.poll(() => tokens(page).then((t) => t.length)).toBe(back + 1)
  await expect(microphone(page)).toBeVisible()
})

test('BASE-03 · Leave while a call waits offline to come back leaves the room at rest: a Join then says the rest’s line (review P3)', async ({
  page,
  context,
}) => {
  await enter(page, '/room.html?call=on')
  await context.setOffline(true)
  await page.evaluate(() => window.fixture?.drop())
  await expect(page.locator('.dock-wrap .dock-note')).toHaveText(OFFLINE_REJOIN)
  await controls(page).getByRole('button', { name: 'Leave the room' }).click()
  const join = controls(page).getByRole('button', { name: /^Join the room/ })
  await expect(join).toBeEnabled()
  await join.click()
  await expect(page.locator('.dock-wrap .dock-note')).toHaveText('You’re offline. Join once you’re back.')
})

test('BASE-03 · back in on its own with the focus on Leave, the focus stays on the dock’s Leave (review P3)', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  await page.evaluate(() => {
    window.fixture?.holdToken(true)
    window.fixture?.holdToken(true) // held twice, the token still answers once let go
    window.fixture?.drop()
  })
  const stop = controls(page).getByRole('button', { name: 'Leave the room' })
  await stop.focus()
  await expect(stop).toBeFocused()
  await page.evaluate(() => window.fixture?.holdToken(false))
  await expect(microphone(page)).toBeVisible()
  await expect(controls(page).getByRole('button', { name: 'Leave the room' })).toBeFocused()
})

test('BASE-03 · a try that fails with the focus on its Leave hands the focus to Try again (review round 2)', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  await page.evaluate(() => {
    window.fixture?.holdToken(true)
    window.fixture?.drop()
  })
  const stop = controls(page).getByRole('button', { name: 'Leave the room' })
  await stop.focus()
  await page.evaluate(() => {
    window.fixture?.failToken()
    window.fixture?.holdToken(false)
  })
  const retry = controls(page).getByRole('button', { name: /^Try again/ })
  await expect(retry).toBeEnabled()
  await expect(retry).toBeFocused()
})

test('BASE-03 · a try no longer wanted once LiveKit has connected is left quietly, and its call’s microphone kept (review round 3)', async ({
  page,
}) => {
  await enter(page, '/room.html?call=on')
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true')
  const connected = await connects(page)
  await page.evaluate(() => window.fixture?.holdConnect(true))
  const before = (await asked(page)).length
  await page.evaluate(() => window.fixture?.drop())
  await expect.poll(() => connects(page)).toBe(connected + 1) // LiveKit's connect began, and waits
  // The page froze meanwhile and wakes ten minutes later: the try is no longer wanted once its connection lands.
  await page.evaluate(() => {
    const real = Date.now.bind(Date)
    Date.now = () => real() + 10 * 60_000
    window.fixture?.holdConnect(false)
  })
  await expect(page.locator('.dock-wrap .dock-note')).toHaveText('You were disconnected from the room.')
  const retry = controls(page).getByRole('button', { name: /^Try again/ })
  await expect(retry).toBeEnabled()
  expect((await asked(page)).slice(before), 'the try’s connection was left').toContain('leave')
  // That leave was no end of the call's: Try again brings the microphone back as the call had it.
  await retry.click()
  await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true')
})

test('BASE-03 · another tab, being taken out and a closed room never rejoin on their own', async ({ page }) => {
  await enter(page, '/room.html?call=on')
  const join = controls(page).getByRole('button', { name: /^Join the room/ })
  for (const why of ['elsewhere', 'removed', 'closed'] as const) {
    const asking = (await tokens(page)).length
    await page.evaluate((w) => window.fixture?.drop(w), why)
    await expect(join).toBeEnabled()
    await page.waitForTimeout(600) // a try would have asked for its token by now
    expect(await tokens(page), why).toHaveLength(asking)
    await join.click()
    await expect(microphone(page)).toBeVisible()
  }
})

const FROM_REST = 'You’re offline. Join once you’re back.'

test('BASE-03 · offline, Join from rest asks for nothing and says so politely; back online the line goes (Luis 2026-10-19)', async ({
  page,
  context,
}) => {
  await page.goto('/room.html')
  const join = page.getByRole('navigation', { name: 'Room controls' }).getByRole('button', { name: /^Join the room/ })
  await expect(join).toBeEnabled()
  // The dock's polite line is there, empty, before it says anything; the blocked-sound line beside it is another.
  const polite = page.locator('.dock-wrap > p[role="status"]:not(.dock-sound)')
  await expect(polite).toHaveCount(1)
  await expect(polite).toHaveText('')
  await polite.evaluate((el) => el.setAttribute('data-before', ''))
  await context.setOffline(true)
  await join.click()
  await page.waitForTimeout(600) // a join let through would have asked for its token and connected by now
  expect(await tokens(page), 'no token is asked offline').toEqual([])
  expect(await asked(page), 'nothing connects').not.toContain('connect')
  const said = page.locator('.dock-wrap > p[data-before]')
  await expect(said).toHaveText(FROM_REST)
  await expect(page.locator('.dock-wrap [role="alert"]')).toHaveCount(0)
  await expect(page.getByText('The room isn’t available')).toHaveCount(0)
  await expect(join).toBeFocused() // Join keeps its words and the focus: nothing began
  await context.setOffline(false)
  await expect(said).toHaveText('')
  await page.waitForTimeout(600) // back online, nothing joins on its own
  expect(await tokens(page)).toEqual([])
  await join.click()
  await expect(leave(page)).toBeVisible()
  expect(await tokens(page), 'one token, asked online').toEqual(['room-token'])
})

test('BASE-03 · from another view, the header dock’s Join offline asks for nothing and says so from its polite line', async ({
  page,
  context,
}) => {
  await page.goto('/room.html?place=work')
  const dock = page.locator('.mini-dock')
  const join = dock.getByRole('button', { name: /^Join the room/ })
  await expect(join).toBeEnabled()
  const polite = dock.locator('.dock-notes > p[role="status"]')
  await expect(polite).toHaveCount(1)
  await expect(polite).toHaveText('')
  await polite.evaluate((el) => el.setAttribute('data-before', ''))
  await context.setOffline(true)
  await join.click()
  await page.waitForTimeout(600)
  expect(await tokens(page), 'no token is asked offline').toEqual([])
  await expect(dock.locator('.dock-notes > p[data-before]')).toHaveText(FROM_REST)
  await expect(dock.locator('.dock-notes [role="alert"]')).toHaveCount(0)
  await context.setOffline(false)
  await expect(dock.locator('.dock-notes > p[data-before]')).toHaveText('')
})

test('BASE-03 · offline, Chat with Sophia from rest asks for nothing, and the chat’s foot says offline once', async ({
  page,
  context,
}) => {
  await page.goto('/room.html')
  await toggle(page, 'Chat').click()
  const panel = page.getByRole('complementary', { name: 'Chat' })
  const start = panel.getByRole('button', { name: /^Chat with Sophia/ })
  await expect(start).toBeEnabled()
  await context.setOffline(true)
  const foot = panel.locator('.composer .outcome')
  await expect(foot).toHaveText(['You’re offline. Your words wait here.']) // the bar's own line, before any press
  await start.click()
  await page.waitForTimeout(600)
  expect(await tokens(page), 'no token is asked offline').toEqual([])
  // Said once: the room's note says offline, so the bar adds no offline line of its own.
  await expect(foot).toHaveText([FROM_REST])
  await expect(page.getByRole('button', { name: /^Text mode/ })).toHaveCount(0) // put back as it was
  await context.setOffline(false)
  await expect(foot).toHaveCount(0)
  await start.click()
  await expect(leave(page)).toBeVisible()
  expect(await tokens(page), 'one token, asked online').toEqual(['room-token'])
})

test('BASE-03 · offline in the call, Chat with Sophia is answered by the call: nothing says to join, and Leave stays', async ({
  page,
  context,
}) => {
  await enter(page, '/room.html?call=on')
  const polite = page.locator('.dock-wrap > p[role="status"]:not(.dock-sound)')
  await expect(polite).toHaveText('')
  await polite.evaluate((el) => el.setAttribute('data-before', ''))
  await toggle(page, 'Chat').click()
  const panel = page.getByRole('complementary', { name: 'Chat' })
  const before = await tokens(page)
  await context.setOffline(true)
  await panel.getByRole('button', { name: /^Chat with Sophia/ }).click()
  await page.waitForTimeout(600) // a join held offline would have said so by now
  // In the call, the join is that call: nothing tells someone who is in it to join, in the dock or the chat's foot.
  await expect(page.getByText(FROM_REST)).toHaveCount(0)
  await expect(page.locator('.dock-wrap > p[data-before]')).toHaveText('')
  expect(await tokens(page), 'no token beyond the call’s own').toEqual(before)
  const dock = page.getByRole('navigation', { name: 'Room controls' })
  await expect(dock.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  // The press goes on as it does online, into the call in text: text mode stays on. A join held here would have put it
  // back as it was (chat-start.ts), leaving the microphone silenced and the chat unstarted.
  await expect(page.getByRole('button', { name: /^Text mode/ })).toHaveAttribute('aria-pressed', 'true')
})

test('BASE-03 · offline, Work’s Join the room before the project loads says so, and nothing joins once back', async ({
  page,
  context,
}) => {
  // Opened by Work's Join the room (or a toast's Rejoin), asking to join (`call=on`), before its snapshot is read.
  await page.goto('/room.html?call=on&snapshot=hold')
  const join = page.getByRole('navigation', { name: 'Room controls' }).getByRole('button', { name: /^Join the room/ })
  await expect(join).toBeDisabled() // nothing to join until the project has loaded
  const polite = page.locator('.dock-wrap > p[role="status"]:not(.dock-sound)')
  await expect(polite).toHaveText('')
  await polite.evaluate((el) => el.setAttribute('data-before', ''))
  await context.setOffline(true)
  // Offline the project can't load, so the join asked is answered now: it asks for nothing and says so, politely.
  const said = page.locator('.dock-wrap > p[data-before]')
  await expect(said).toHaveText(FROM_REST)
  await expect(page.locator('.dock-wrap [role="alert"]')).toHaveCount(0)
  expect(await tokens(page), 'no token is asked offline').toEqual([])
  await context.setOffline(false)
  await page.evaluate(() => window.fixture?.releaseSnapshot())
  await expect(join).toBeEnabled() // the project has loaded
  await expect(said).toHaveText('')
  await page.waitForTimeout(600) // back online and loaded, a join still standing would have asked by now
  expect(await tokens(page), 'nothing joins on its own').toEqual([])
  await join.click()
  await expect(leave(page)).toBeVisible()
  expect(await tokens(page), 'one token, asked online').toEqual(['room-token'])
})
