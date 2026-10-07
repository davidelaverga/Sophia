import { expect, test, type Page } from '@playwright/test'

// The meeting so far, for whoever joins late (docs/plans/room-so-far.md): A13's `so-far` digest, behind the vision
// flag the fixture pages set. `meeting=earlier` begins the running meeting 12 minutes before the page. Every word is
// synthetic.

const card = (page: Page) => page.getByRole('group', { name: 'The meeting so far' })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'The meeting so far' })
const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' }).first()
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('so far · joining 12 minutes in: Catch up shows what was decided, by whom; closed, it is done', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=listening&meeting=earlier')
  await expect(card(page)).toContainText('You joined 12 min in.')
  await card(page).getByRole('button', { name: 'Catch up' }).click()
  const decided = sheet(page).getByRole('region', { name: 'Decided' })
  await expect(decided).toContainText('Pilot the fixture with fourteen teams')
  await expect(decided).toContainText('proposed by Marco, decided by you')
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(card(page)).toHaveCount(0)
  expect((await served(page)).filter((s) => s === 'so-far')).toEqual(['so-far'])
})

test('so far · Not now puts the card away', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&meeting=earlier')
  await card(page).getByRole('button', { name: 'Not now' }).click()
  await expect(card(page)).toHaveCount(0)
  // The card went with the press: the focus is on the call's own controls, not lost.
  await expect(page.getByRole('button', { name: 'Microphone' }).first()).toBeFocused()
})

test('so far · joined from another view, the card counts from the join, not from opening the room', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto('/room.html?call=on&people=2&meeting=earlier&place=work')
  await expect(page.locator('.mini-dock').getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await page.clock.fastForward(8 * 60_000)
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Studio' }).click()
  await expect(card(page)).toContainText('You joined 12 min in.')
})

test('so far · in the meeting from its start, dropping out and joining again 25 minutes on offers nothing', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto('/room.html?call=on&people=2')
  await expect(leave(page)).toBeVisible()
  await page.clock.fastForward(25 * 60_000)
  await leave(page).click()
  await page.getByRole('dialog', { name: 'This meeting' }).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Join the room' }).first().click()
  await expect(leave(page)).toBeVisible()
  await expect(page.locator('.room-stage')).toBeVisible()
  await expect(card(page)).toHaveCount(0)
  expect((await served(page)).filter((s) => s === 'so-far')).toEqual([])
})

test('so far · rejoining a meeting the person was in offers nothing more', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&meeting=earlier')
  await card(page).getByRole('button', { name: 'Not now' }).click()
  await leave(page).click()
  await page.getByRole('dialog', { name: 'This meeting' }).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Join the room' }).first().click()
  await expect(leave(page)).toBeVisible()
  await expect(page.locator('.room-stage')).toBeVisible()
  await expect(card(page)).toHaveCount(0)
  expect((await served(page)).filter((s) => s === 'so-far')).toEqual(['so-far'])
})

test('so far · read once per join: a visit to another view keeps the card, and once put away it stays away', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&meeting=earlier')
  await expect(card(page)).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Project views' })
  await nav.getByRole('link', { name: 'Knowledge' }).click()
  await nav.getByRole('link', { name: 'Studio' }).click()
  await expect(card(page)).toBeVisible()
  await card(page).getByRole('button', { name: 'Not now' }).click()
  await nav.getByRole('link', { name: 'Knowledge' }).click()
  await nav.getByRole('link', { name: 'Studio' }).click()
  await expect(page.locator('.room-stage')).toBeVisible()
  await expect(card(page)).toHaveCount(0)
  expect((await served(page)).filter((s) => s === 'so-far')).toEqual(['so-far'])
})

test('so far · a meeting that begins on joining shows nothing, and reads no digest', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=listening')
  await expect(leave(page)).toBeVisible()
  await expect(page.locator('.room-stage')).toBeVisible()
  await expect(card(page)).toHaveCount(0)
  expect((await served(page)).filter((s) => s === 'so-far')).toEqual([])
})

test('so far · leaving puts the card away', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&meeting=earlier')
  await expect(card(page)).toBeVisible()
  await leave(page).click()
  await page.getByRole('dialog', { name: 'This meeting' }).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(card(page)).toHaveCount(0)
})
