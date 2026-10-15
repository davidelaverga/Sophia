import { expect, test, type Page } from '@playwright/test'

// Archiving a project (docs/plans/archive-project.md, A30): an admin archives it from the project's menu, after a
// question; it leaves the lists, stays readable, says so inside, and an admin brings it back. Every name is synthetic.

const header = (page: Page) => page.locator('header').first()
const menu = (page: Page) => page.getByRole('menu', { name: 'Project' })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Archive project' })
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

test('archive · an admin archives from the project’s menu, after a question, and goes to Work', async ({ page }) => {
  await page.goto('/room.html')
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    'Rename…',
    'Activity',
    'Archive project…',
    'Leave project…',
  ])
  await menu(page).getByRole('menuitem', { name: 'Archive project…' }).click()
  await expect(sheet(page)).toContainText('leaves everyone’s list')
  await expect(sheet(page).getByRole('button', { name: 'Cancel' })).toBeFocused()
  await sheet(page).getByRole('button', { name: 'Archive' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect.poll(() => served(page)).toEqual(expect.arrayContaining(['archive:true', 'went:work']))
})

test('archive · an editor is offered no Archive', async ({ page }) => {
  await page.goto('/room.html?role=editor')
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText(['Leave project…'])
})

test('archive · inside an archived project a line says so, and Unarchive brings it back', async ({ page }) => {
  await page.goto('/room.html?archived=1')
  const line = page.getByRole('status').filter({ hasText: 'This project is archived' })
  await expect(line).toBeVisible()
  await line.getByRole('button', { name: 'Unarchive' }).click()
  await expect.poll(() => served(page)).toContain('archive:false')
  await expect(page.getByText('This project is archived')).toHaveCount(0)
})

test('archive · a viewer reads the line, with nothing to press', async ({ page }) => {
  await page.goto('/room.html?archived=1&role=viewer')
  const line = page.getByRole('status').filter({ hasText: 'This project is archived' })
  await expect(line).toBeVisible()
  await expect(line.getByRole('button')).toHaveCount(0)
})
