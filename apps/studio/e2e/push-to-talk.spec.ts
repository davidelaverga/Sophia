import { expect, test, type Page } from '@playwright/test'

// Push to talk (docs/plans/push-to-talk.md): muted, holding Space from nowhere turns the microphone on until it is let
// go. A field keeps its Space; the microphone already on is left as it is. Every name is synthetic.

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const mic = (page: Page) => dock(page).getByRole('button', { name: 'Microphone', exact: true })
const talking = (page: Page) => page.getByRole('status').filter({ hasText: 'Talking' })
const nowhere = (page: Page) =>
  page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
const micAsks = (page: Page) =>
  page.evaluate(() => (window.fixture?.asked ?? []).filter((a) => a.startsWith('microphone:')))
/** What the release's microtasks asked is read after them: a late turn-off is only true for a moment. */
const settled = (page: Page) => page.evaluate(() => new Promise((done) => setTimeout(done, 0)))

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.goto('/room.html?call=on&people=2')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'true')
})

test('talk · muted, holding Space turns the microphone on and says so; letting go mutes again', async ({ page }) => {
  await mic(page).click()
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
  await nowhere(page)
  await page.keyboard.down('Space')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(talking(page)).toHaveText('Talking. Let go of Space to mute again.')
  await page.keyboard.up('Space')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(talking(page)).toHaveCount(0)
})

test('talk · in the chat’s field, Space types and the microphone stays off', async ({ page }) => {
  await mic(page).click()
  await page.getByRole('button', { name: /^Chat/ }).last().click()
  const field = page.locator('#converse-draft')
  await field.click()
  await page.keyboard.type('a b')
  await expect(field).toHaveValue('a b')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
})

test('talk · with the microphone on, Space changes nothing', async ({ page }) => {
  // What the room was asked from here on: joining asked for the microphone already.
  const asked = () => page.evaluate(() => [...(window.fixture?.asked ?? [])].filter((a) => a.startsWith('microphone')))
  const before = (await asked()).length
  await nowhere(page)
  await page.keyboard.down('Space')
  await page.keyboard.up('Space')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'true')
  expect((await asked()).slice(before)).toEqual([])
})

test('talk · the window losing focus while Space is held mutes again', async ({ page }) => {
  await mic(page).click()
  await nowhere(page)
  await page.keyboard.down('Space')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
})

test('talk · the page hidden while Space is held mutes again, with no keyup or blur (Codex P1 on #381)', async ({
  page,
}) => {
  await mic(page).click()
  await nowhere(page)
  await page.keyboard.down('Space')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'true')
  // A phone's app switch or a screen lock: the page goes hidden, and neither the key's release nor a blur comes.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
})

test('talk · a project kept out of sight takes no Space (Codex P1 on #381)', async ({ page }) => {
  await mic(page).click()
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
  const asked = () => page.evaluate(() => [...(window.fixture?.asked ?? [])].filter((a) => a.startsWith('microphone')))
  const before = (await asked()).length
  await page.evaluate(() => window.fixture?.away())
  await nowhere(page)
  await page.keyboard.down('Space')
  await page.keyboard.up('Space')
  expect((await asked()).slice(before)).toEqual([])
})

// The browser still asking for the microphone when Space is let go (Codex P1 on #381): LiveKit publishes a late enable
// even after a turn-off stopped waiting for it, so the microphone that arrives then must go off again.
test('talk · a microphone that arrives after Space was let go goes off again', async ({ page }) => {
  await mic(page).click()
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.fixture?.holdMicrophone())
  await nowhere(page)
  await page.keyboard.down('Space')
  await page.keyboard.up('Space')
  await page.evaluate(() => window.fixture?.releaseMicrophone())
  const microphone = () =>
    page.evaluate(() => (window.fixture?.asked ?? []).filter((a) => a.startsWith('microphone:')).slice(-3))
  await expect.poll(microphone).toEqual(['microphone:on', 'microphone:off', 'microphone:off'])
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(talking(page)).toHaveCount(0)
})

test('talk · pressed again before a slow microphone arrives, it stays on while Space is held, then mutes', async ({
  page,
}) => {
  await mic(page).click()
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.fixture?.holdMicrophone())
  await nowhere(page)
  await page.keyboard.down('Space')
  await page.keyboard.up('Space')
  await page.keyboard.down('Space')
  await page.evaluate(() => window.fixture?.releaseMicrophone())
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(talking(page)).toHaveText('Talking. Let go of Space to mute again.')
  await page.keyboard.up('Space')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
})

// A late microphone's turn-off answers to push to talk's own turn-off being the last choice in the same call (Codex P2
// on #381): a choice made since, or another call, keeps what it chose.
test('talk · the microphone turned on from the dock while a slow one arrives stays on (Codex P2 on #381)', async ({
  page,
}) => {
  await mic(page).click()
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.fixture?.holdMicrophone())
  await nowhere(page)
  await page.keyboard.down('Space')
  await page.keyboard.up('Space')
  await mic(page).click() // still off on screen: this asks for on, and waits as the first did
  await page.evaluate(() => window.fixture?.releaseMicrophone())
  await settled(page)
  expect((await micAsks(page)).slice(-3)).toEqual(['microphone:on', 'microphone:off', 'microphone:on'])
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'true')
})

test('talk · a slow microphone from before leaving doesn’t mute the call joined again (Codex P2 on #381)', async ({
  page,
}) => {
  await mic(page).click()
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.fixture?.holdMicrophone())
  await nowhere(page)
  await page.keyboard.down('Space')
  await page.keyboard.up('Space')
  await page.getByRole('button', { name: 'Leave the room' }).first().click()
  await page.keyboard.press('Escape') // the recap goes
  await expect(page.getByRole('dialog', { name: 'This meeting' })).toHaveCount(0)
  // The person joins with the microphone on, as the door's switch keeps it.
  await page.evaluate(() => localStorage.setItem('sophia.mic.v1', 'on'))
  await page.getByRole('button', { name: 'Join the room' }).first().click()
  await expect(mic(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.releaseMicrophone())
  await settled(page)
  expect((await micAsks(page)).at(-1)).toBe('microphone:on')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('sophia.mic.v1'))).toBe('on')
})

test('talk · pressed again while its own mute is still settling, it talks again (Codex P2 on #381)', async ({
  page,
}) => {
  await mic(page).click()
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
  await nowhere(page)
  await page.keyboard.down('Space')
  await expect(talking(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.holdMute())
  await page.keyboard.up('Space')
  await expect(talking(page)).toHaveCount(0)
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'true') // the mute is still on its way
  await page.keyboard.down('Space')
  await page.evaluate(() => window.fixture?.releaseMute())
  await expect
    .poll(async () => (await micAsks(page)).slice(-3))
    .toEqual(['microphone:on', 'microphone:off', 'microphone:on'])
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(talking(page)).toHaveText('Talking. Let go of Space to mute again.')
  await page.keyboard.up('Space')
  await expect(mic(page)).toHaveAttribute('aria-pressed', 'false')
})
