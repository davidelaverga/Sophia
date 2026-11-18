import { expect, test, type Page } from '@playwright/test'

// Removed from the project mid-call (docs/plans/removed-and-stopped-said.md, textos-lote-18 item 3): the project gives
// way to «No access to this project», and the call behind it ends. When a call here was on as the door closed, or the
// server had just taken this person out of it, the notice says so, once and politely; a plain visit says nothing new.

const LINE = 'Your call here ended when you were removed from the project.'
const notice = (page: Page) => page.locator('.page.notice')
const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const asked = (page: Page) => page.evaluate(() => [...(window.fixture?.asked ?? [])])
/** Removed from the project while it is open: the next snapshot read is refused (403). */
const shutDoor = (page: Page) => page.evaluate(() => window.fixture?.shutDoor())

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('removed · in a call, the door shuts: the notice says the call here ended, politely, and the call is left', async ({
  page,
}) => {
  await page.goto('/room.html?call=on')
  await expect(leave(page).first()).toBeVisible()
  await shutDoor(page)
  await expect(notice(page).locator('h2')).toHaveText('No access to this project')
  const line = notice(page).getByRole('status')
  await expect(line).toHaveText(LINE)
  await expect(line).not.toBeFocused()
  await expect(page.getByText(LINE)).toHaveCount(1)
  await expect.poll(() => asked(page)).toContain('leave')
})

test('removed · the server takes this person out of the call first, then the door shuts: the line too', async ({
  page,
}) => {
  await page.goto('/room.html?call=on')
  await expect(leave(page).first()).toBeVisible()
  await page.evaluate(() => window.fixture?.drop('removed'))
  await expect(leave(page)).toHaveCount(0)
  await shutDoor(page)
  await expect(notice(page).locator('h2')).toHaveText('No access to this project')
  await expect(notice(page).getByRole('status')).toHaveText(LINE)
})

test('removed · out of a call, the door shuts: the plain notice, with no word of a call', async ({ page }) => {
  await page.goto('/room.html')
  await expect(page.getByRole('button', { name: /^Join the room/ }).first()).toBeVisible()
  await shutDoor(page)
  await expect(notice(page).locator('h2')).toHaveText('No access to this project')
  await expect(page.getByText(LINE)).toHaveCount(0)
})

test('removed · Leave project in another tab of this browser is no removal: tab A’s notice says nothing of one (review P2)', async ({
  page,
  context,
}) => {
  await page.goto('/room.html?call=on&role=editor')
  await expect(leave(page).first()).toBeVisible()
  const other = await context.newPage()
  await other.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await other.goto('/room.html?role=editor')
  await other.locator('header.topbar').getByRole('button', { name: 'Fixture project' }).click()
  await other.getByRole('menu', { name: 'Project' }).getByRole('menuitem', { name: 'Leave project…' }).click()
  await other.getByRole('dialog', { name: 'Leave project' }).getByRole('button', { name: 'Leave project' }).click()
  await expect
    .poll(() => other.evaluate(() => [...(window.fixture?.served ?? [])].some((s) => s.startsWith('leave'))))
    .toBe(true)
  // The API's leave takes this person out of tab A's call and out of the project: both reach tab A.
  await page.evaluate(() => window.fixture?.drop('removed'))
  await shutDoor(page)
  await expect(notice(page).locator('h2')).toHaveText('No access to this project')
  await expect(notice(page)).toContainText('isn’t a member. Ask a project admin to add you, or open another project.')
  await expect(page.getByText(LINE)).toHaveCount(0)
})
