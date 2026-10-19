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
  // Leaving opens what the meeting left (room-recap.spec.ts); put away, the way back is in reach.
  await page.getByRole('dialog', { name: 'This meeting' }).getByRole('button', { name: 'Close', exact: true }).click()
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

test('BASE-03 · offline, a lost call says so; Try again waits for the network, then rejoins (costuras seam #8)', async ({
  page,
  context,
}) => {
  await enter(page, '/room.html?call=on')
  await context.setOffline(true)
  await page.evaluate(() => window.fixture?.drop()) // the connection is lost with the network
  const note = page.locator('.dock-wrap .dock-note')
  const offline = 'You’re offline, so the call ended here. Join again once you’re back.'
  await expect(note).toHaveText(offline)
  await expect(note).toHaveAttribute('role', 'status')
  const before = (await asked(page)).length
  await page.getByRole('button', { name: /^Try again/ }).click()
  await page.waitForTimeout(600) // a join let through would have connected by now
  expect((await asked(page)).slice(before), 'nothing is asked offline').toEqual([])
  await expect(note).toHaveText(offline)
  await expect(page.getByText('The room isn’t available')).toHaveCount(0)
  await context.setOffline(false)
  await expect(note).toHaveText('You’re back online. Try again rejoins the call.')
  await page.getByRole('button', { name: /^Try again/ }).click()
  await expect(leave(page)).toBeVisible()
  await expect(note).toHaveCount(0)
  expect((await asked(page)).slice(before).filter((a) => a === 'connect')).toEqual(['connect'])
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
  await expect(note).toHaveText(offline)
  await context.setOffline(false)
  await expect(note).toHaveText('You’re back online. Try again rejoins the call.')
  // Online, the rejoin fails as the room's own trouble, and says so.
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
  const offline = 'You’re offline, so the call ended here. Join again once you’re back.'
  await expect(page.locator('.dock-wrap > p[data-before]')).toHaveText(offline)
  await expect(page.locator('.dock-wrap [role="alert"]')).toHaveCount(0)
  await context.setOffline(false)
  await expect(page.locator('.dock-wrap > p[data-before]')).toHaveText(
    'You’re back online. Try again rejoins the call.',
  )
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
  await expect(dock.locator('.dock-notes > p[data-before]')).toHaveText(
    'You’re offline, so the call ended here. Join again once you’re back.',
  )
  await expect(dock.locator('.dock-notes [role="alert"]')).toHaveCount(0)
})

/** The room tokens asked for: the fixture records each one (fixtures/fixture-api.ts). */
const tokens = async (page: Page) => (await fixture(page)).served.filter((s) => s === 'room-token')
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
