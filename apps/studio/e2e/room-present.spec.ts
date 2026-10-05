import { expect, test, type Page } from '@playwright/test'

// A report shown to everyone, as Meet shows a screen (docs/plans/room-present.md): the snapshot's sharedFocus is
// followed by choice, and «Show everyone» (the A14 writer proposed in issue #105, behind the vision flag the fixture
// pages set) puts it there. Every person and word is synthetic.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const V1 = '00000000-0000-4000-8000-0000000000d1'

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const card = (page: Page) => page.locator('.stage-showing')
const presented = (page: Page) => page.getByRole('region', { name: /^Fixture report, shown by/ })
const strip = (page: Page) => page.getByRole('list', { name: 'In the room' })
const made = (page: Page) => page.getByRole('group', { name: 'Made by Sophia' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const shows = async (page: Page) => (await served(page)).filter((s) => s.startsWith('focus:'))

async function enter(page: Page, query = 'people=2&floor=1&sophia=listening') {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(leave(page)).toBeVisible()
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

test('present · another member shows a report: the card says so, and only Follow puts it on my stage', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.show(1))
  await expect(card(page)).toContainText('Marco is showing Fixture report · v1')
  // Following is deliberate: nothing moved yet.
  await expect(presented(page)).toHaveCount(0)
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect(presented(page)).toBeVisible()
  await expect(presented(page).getByText('The fixture holds.')).toBeVisible()
  await expect(strip(page)).toContainText('Sophia')
  await expect(strip(page)).toContainText('Marco')
  await presented(page).getByRole('button', { name: 'Stop following' }).click()
  await expect(presented(page)).toHaveCount(0)
  await expect(card(page)).toBeVisible()
})

test('present · when nothing is shown any more, every stage goes back, following ends', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect(presented(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.show(null))
  await expect(presented(page)).toHaveCount(0)
  await expect(card(page)).toHaveCount(0)
  // Shown again later: not followed until asked.
  await page.evaluate(() => window.fixture?.show(1))
  await expect(card(page)).toBeVisible()
  await expect(presented(page)).toHaveCount(0)
})

test('present · a shared screen keeps the stage: the report waits as the card, with nothing to press', async ({
  page,
}) => {
  await enter(page, 'people=2&floor=1&sophia=listening&video=screen')
  await page.evaluate(() => window.fixture?.show(1))
  await expect(page.locator('.screen-main')).toBeVisible()
  await expect(card(page)).toContainText('Marco is showing Fixture report · v1')
  await expect(card(page).getByRole('button')).toHaveCount(0)
})

test('present · Show everyone from the made card shows it to the room, and Stop showing ends it', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.notice())
  await made(page).getByRole('button', { name: 'Show everyone' }).click()
  await expect(presented(page)).toBeVisible()
  await expect(presented(page)).toContainText('Shown by you')
  expect(await shows(page)).toEqual([`focus:${V1}`])
  await expect(card(page)).toHaveCount(0) // mine: the stage shows it, no card asks me to follow
  await expect(presented(page)).toBeFocused() // shown from here: the report has the focus as it arrives
  await presented(page).getByRole('button', { name: 'Stop showing' }).click()
  await expect(presented(page)).toHaveCount(0)
  expect(await shows(page)).toEqual([`focus:${V1}`, 'focus:none'])
  // The button left with the report: the focus is on Chat, which stays.
  await expect(page.locator('.panel-toggles [data-panel="chat"]')).toBeFocused()
})

test('present · Show everyone from the open report: the pane gives the report to the stage', async ({ page }) => {
  await page.goto(`/room.html?call=on&people=2&floor=1&sophia=listening&report=${REPORT}`)
  const pane = page.getByRole('complementary', { name: 'Fixture report' })
  await expect(pane.getByText('The fixture holds.')).toBeVisible()
  await pane.getByRole('button', { name: 'Show everyone' }).click()
  await expect(pane).toHaveCount(0)
  await expect(presented(page)).toBeVisible()
  await expect(presented(page).getByText('The fixture holds.')).toBeVisible()
})

test('present · against a room that moved, Show says so; pressed again, it shows', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => {
    window.fixture?.notice()
    window.fixture?.moveRoom()
  })
  await made(page).getByRole('button', { name: 'Show everyone' }).click()
  await expect(made(page)).toContainText('The room changed. Show it again.')
  expect(await shows(page)).toEqual([])
  await made(page).getByRole('button', { name: 'Show everyone' }).click()
  await expect(presented(page)).toBeVisible()
})

test('present · a show whose reply is lost is known from the room itself: shown once, nothing left unconfirmed', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => {
    window.fixture?.notice()
    window.fixture?.loseNextFocusReply()
  })
  await made(page).getByRole('button', { name: 'Show everyone' }).click()
  // It landed: the room's feed says it is shown, so the stage presents it, as the API holds it.
  await expect(presented(page)).toBeVisible()
  await expect(presented(page)).toContainText('Shown by you')
  expect(await shows(page)).toEqual([`focus:${V1}`])
})

test('present · someone else showing asks again: my view doesn’t move without my press', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect(presented(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.show(2))
  await expect(presented(page)).toHaveCount(0)
  await expect(card(page)).toContainText('Lucía is showing Fixture report · v1')
})

test('present · Stop following puts the focus on Follow, where the way back in is', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect(presented(page)).toBeFocused()
  await presented(page).getByRole('button', { name: 'Stop following' }).click()
  await expect(card(page).getByRole('button', { name: 'Follow' })).toBeFocused()
})

test('present · an earlier version open in the pane isn’t offered to everyone: the room shows what is current', async ({
  page,
}) => {
  await page.goto(`/room.html?call=on&people=2&floor=1&sophia=listening&versions=2&report=${REPORT}&version=${V1}`)
  const pane = page.getByRole('complementary', { name: 'Fixture report' })
  await expect(pane.getByText('The first version of a labelled fixture report.')).toBeVisible()
  await expect(pane.locator('.report-current')).toBeVisible()
  await expect(pane.getByRole('button', { name: 'Show everyone' })).toHaveCount(0)
})

test('present · my own show while a screen is shared: my card says so, and Stop showing ends it', async ({ page }) => {
  await enter(page, 'people=2&floor=1&sophia=listening&video=screen')
  await page.evaluate(() => window.fixture?.show('me'))
  await expect(card(page)).toContainText('You are showing Fixture report · v1')
  await card(page).getByRole('button', { name: 'Stop showing' }).click()
  await expect(card(page)).toHaveCount(0)
  expect(await shows(page)).toEqual(['focus:none'])
})

test('present · from the pane, a show whose reply is lost says so; Try again sends the same request', async ({
  page,
}) => {
  await page.goto(`/room.html?call=on&people=2&floor=1&sophia=listening&report=${REPORT}`)
  const pane = page.getByRole('complementary', { name: 'Fixture report' })
  await expect(pane.getByText('The fixture holds.')).toBeVisible()
  await page.evaluate(() => window.fixture?.loseNextFocusReply())
  await pane.getByRole('button', { name: 'Show everyone' }).click()
  await expect(pane).toContainText('Not confirmed.')
  // The same key, the same request: the API replays its receipt, and the pane gives the report to the stage.
  await pane.getByRole('button', { name: 'Try again' }).click()
  await expect(pane).toHaveCount(0)
  await expect(presented(page)).toBeVisible()
  expect(await shows(page)).toEqual([`focus:${V1}`])
})

test('present · shown from the pane, the report takes the focus as it arrives, though the pane gave it back to Chat', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.notice())
  await made(page).getByRole('button', { name: 'Open', exact: true }).click()
  const pane = page.getByRole('complementary', { name: 'Fixture report' })
  await expect(pane.getByText('The fixture holds.')).toBeVisible()
  await pane.getByRole('button', { name: 'Show everyone' }).click()
  await expect(pane).toHaveCount(0)
  await expect(presented(page)).toBeFocused()
})
