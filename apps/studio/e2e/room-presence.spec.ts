import { expect, test, type Page } from '@playwright/test'

// Before this person joins, People and Join say who the server says is in the room: Home's presence, never «Nobody»
// over a meeting (docs/plans/one-truth.md). A room the server couldn't ask (`room: null`) is unknown, never nobody. In
// the call, the call's own list wins. Names are synthetic.

const list = (page: Page) => page.getByRole('list', { name: 'People in the call' })
const join = (page: Page) => page.locator('.dock').getByRole('button', { name: 'Join the room' })
const panel = (page: Page) => page.locator('#side-people')
const UNKNOWN = 'Who’s in the call shows once you join.'

async function openPeople(page: Page, query: string) {
  await page.goto(`/room.html?${query}`)
  await page.locator('.panel-toggles [data-panel="people"]').click()
  await expect(panel(page)).toBeVisible()
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

test('presence · out of the call, People and Join name who is in, as Home does', async ({ page }) => {
  await openPeople(page, 'inroom=Davide,Sophia')
  await expect(list(page).locator('.person-name')).toHaveText(['Davide'])
  await expect(join(page)).toHaveAccessibleDescription('Davide and Sophia are in the room')
  await expect(join(page).locator('.join-face')).toHaveText(['D'])
  // Its name stays the press's own: the description is beside it, not in it.
  await expect(join(page)).toHaveAccessibleName('Join the room')
  await expect(panel(page)).not.toContainText('Nobody')
})

test('presence · with nobody in, People says so and Join shows no one', async ({ page }) => {
  await openPeople(page, 'inroom=')
  await expect(panel(page)).toHaveText('Nobody is in the call yet.')
  await expect(join(page).locator('.join-face')).toHaveCount(0)
  await expect(join(page)).not.toHaveAttribute('aria-describedby')
})

test('presence · a room the server couldn’t say, or a failed read, is unknown: never «Nobody»', async ({ page }) => {
  await openPeople(page, '')
  await expect(panel(page)).toHaveText(UNKNOWN)
  await openPeople(page, 'projects=fail&inroom=Davide')
  // The fixture's query client retries a failed read three times (about 7 s) before it is a failure.
  await expect(panel(page)).toHaveText(UNKNOWN, { timeout: 15_000 })
  await expect(join(page)).not.toHaveAttribute('aria-describedby')
})

test('presence · while the server is asked, People claims nothing; its answer then shows', async ({ page }) => {
  await openPeople(page, 'projects=hold&inroom=Davide')
  await expect(join(page)).toBeVisible()
  await expect(panel(page)).toHaveText('')
  await expect(list(page)).toHaveCount(0)
  await page.evaluate(() => window.fixture?.holdProjects(false))
  await expect(list(page).locator('.person-name')).toHaveText(['Davide'])
})

test('presence · in the call, the call’s own list wins over the server’s word', async ({ page }) => {
  await openPeople(page, 'call=on&people=2&inroom=Davide')
  await expect(list(page).locator('.person-name')).toHaveText(['Fixture · you', 'Marco', 'Lucía'])
})
