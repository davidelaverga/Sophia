import { expect, test, type Page } from '@playwright/test'

// Leaving a project (docs/plans/project-leave.md): any member opens the project's menu from its title, and «Leave
// project…» opens a sheet that says what leaving means. Left, a call in the room ends and the person goes to Work. The
// only admin is told why they can't, and stays.

const header = (page: Page) => page.locator('header.topbar')
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const menu = (page: Page) => page.getByRole('menu', { name: 'Project' })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Leave project' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('leave · an editor leaves from the project’s menu: the leave is recorded, and they go to Work', async ({
  page,
}) => {
  await page.goto('/room.html?role=editor')
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText(['Leave project…'])
  await menu(page).getByRole('menuitem', { name: 'Leave project…' }).click()
  await expect(sheet(page)).toContainText('a new invitation')
  await expect(sheet(page).getByRole('button', { name: 'Cancel' })).toBeFocused()
  await sheet(page).getByRole('button', { name: 'Leave project' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect.poll(() => served(page)).toEqual(expect.arrayContaining(['leave', 'went:work']))
})

test('leave · the only admin is told why, and stays', async ({ page }) => {
  await page.goto('/room.html?admins=1')
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    'Rename…',
    'Activity',
    'Archive project…',
    'Leave project…',
  ])
  await menu(page).getByRole('menuitem', { name: 'Leave project…' }).click()
  await sheet(page).getByRole('button', { name: 'Leave project' }).click()
  await expect(sheet(page).getByRole('alert')).toContainText('only admin')
  // And where to go: the admin role can be handed over first (member-roles.md).
  await expect(sheet(page).getByRole('alert')).toContainText('Invite › Members')
  expect(await served(page)).not.toContain('went:work')
  expect(await served(page)).not.toContain('leave')
})

test('leave · leaving during a call ends the call', async ({ page }) => {
  await page.goto('/room.html?role=editor&call=on')
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await menu(page).getByRole('menuitem', { name: 'Leave project…' }).click()
  await sheet(page).getByRole('button', { name: 'Leave project' }).click()
  await expect(page.getByRole('button', { name: 'Leave the room' })).toHaveCount(0)
  expect(await served(page)).toContain('leave')
})
