import { expect, test, type Page } from '@playwright/test'

// LFE-00's preservation checks (BASE-01 … BASE-03): the merged room, its Chat and Brief side panel and its dock, on the
// labelled fixture page. A request to any other origin is aborted, and each check ends by asking the page whether
// anything reached for the API beyond the brief it answers.

/** In a call, with Sophia's conversation open and this viewer holding the floor: the chat's message bar is there. */
const IN_CALL = '/room.html?call=on&exchange=open'

/** What the page was asked to do and which requests it didn't expect (fixtures/room.tsx's `window.fixture`). */
const fixture = (page: Page) =>
  page.evaluate(() => {
    const view = window.fixture
    if (!view) throw new Error('the fixture page did not start')
    return { asked: [...view.asked], unexpected: [...view.unexpected] }
  })
/** A background update: the project and its brief move one revision. */
const update = (page: Page) => page.evaluate(() => window.fixture?.update())

const toggle = (page: Page, name: 'Chat' | 'Brief') => page.getByRole('button', { name, exact: true })
const tab = (page: Page, name: 'Chat' | 'Brief') => page.getByRole('tab', { name, exact: true })
const messageBar = (page: Page) => page.getByRole('textbox', { name: 'Message Sophia', exact: true })

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
  await page.goto(IN_CALL)
  await toggle(page, 'Chat').click()
  await messageBar(page).fill('Words not sent yet')
  await tab(page, 'Brief').click()
  await page.getByRole('button', { name: 'Edit direction' }).click()
  await page.getByLabel('Direction').fill('A direction of my own, being written')

  await update(page) // the project and its brief move on while the person writes
  await expect(page.getByLabel('Direction')).toHaveValue('A direction of my own, being written')
  await tab(page, 'Chat').click()
  await expect(messageBar(page)).toHaveValue('Words not sent yet')

  await page.getByRole('button', { name: 'Close' }).click()
  await toggle(page, 'Brief').click()
  await expect(page.getByLabel('Direction')).toHaveValue('A direction of my own, being written')
  await tab(page, 'Chat').click()
  await expect(messageBar(page)).toHaveValue('Words not sent yet')
})

test('BASE-02 · letters typed on a panel tab or with the focus nowhere reach the message bar; nothing turns on', async ({
  page,
}) => {
  await page.goto(IN_CALL)
  // d, e and j are the microphone, camera and join keys with the command key: alone they are only letters. With the
  // panel closed no message bar is on screen, so nothing takes them as text either.
  await page.keyboard.type('dej')
  expect((await fixture(page)).asked, 'what the room was asked to do').toEqual([])
  await toggle(page, 'Chat').click()
  await tab(page, 'Chat').focus()
  await page.keyboard.type('dej ')
  await expect(messageBar(page)).toHaveValue('dej ')
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await page.keyboard.type('made')
  await expect(messageBar(page)).toHaveValue('dej made')
  expect((await fixture(page)).asked, 'what the room was asked to do').toEqual([])
})

test('BASE-03 @phone · in a call with the panel open, mute, sending, errors and the way back stay in reach', async ({
  page,
}) => {
  const errors = 'error=The%20room%20lost%20its%20connection&media=Microphone%20blocked'
  await page.goto(`${IN_CALL}&${errors}`)
  await toggle(page, 'Chat').click()
  const panel = page.getByRole('complementary', { name: 'Chat' })
  const mute = panel.getByRole('button', { name: 'Microphone' })
  await expect(mute).toBeInViewport()
  await expect(mute).toHaveAttribute('aria-pressed', 'true') // sending: the microphone is on
  await expect(panel.getByText('Microphone blocked')).toBeInViewport()
  await expect(panel.getByText('The room lost its connection')).toBeInViewport()
  await mute.click() // a tap reaches it: nothing covers it
  await expect(mute).toHaveAttribute('aria-pressed', 'false')

  await panel.getByRole('button', { name: 'Close' }).click()
  const leave = page.getByRole('button', { name: 'Leave the room' })
  await expect(leave).toBeInViewport()
  await leave.click()
  const back = page.getByRole('button', { name: /^Join the room/ }) // the way back into the call
  await expect(back).toBeInViewport()
  await back.click()
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeInViewport()
  expect((await fixture(page)).asked).toEqual(['microphone:off', 'leave', 'join'])
})
