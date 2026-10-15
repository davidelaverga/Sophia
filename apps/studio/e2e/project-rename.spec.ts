import { expect, test, type Page } from '@playwright/test'

// Renaming a project (docs/plans/project-rename.md): an admin presses the project's title in the header, and Rename…
// opens a sheet whose title, saved, is the project's for everyone. A member who isn't an admin sees the title alone.

const header = (page: Page) => page.locator('header.topbar')
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

test('rename · an admin renames the project from its title: the sheet saves, and the header says the new name', async ({
  page,
}) => {
  await page.goto('/room.html')
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await page.getByRole('menu', { name: 'Project' }).getByRole('menuitem', { name: 'Rename…' }).click()
  const sheet = page.getByRole('dialog', { name: 'Rename project' })
  const field = sheet.getByRole('textbox', { name: 'Project name' })
  await expect(field).toHaveValue('Fixture project')
  await expect(field).toBeFocused()
  // A name of spaces alone isn't offered to save.
  await field.fill('   ')
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled()
  await field.fill('Launch plan, v2')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(header(page).getByRole('button', { name: 'Launch plan, v2' })).toBeVisible()
  expect(await served(page)).toContain('rename:Launch plan, v2')
})

test('rename · at 1280 an admin’s long title gives way before the views do, its press whole', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/room.html')
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await page.getByRole('menu', { name: 'Project' }).getByRole('menuitem', { name: 'Rename…' }).click()
  const long = 'Quarterly onboarding pilot review with the regional partners and the platform team'
  await page.getByRole('dialog', { name: 'Rename project' }).getByRole('textbox', { name: 'Project name' }).fill(long)
  await page.getByRole('dialog', { name: 'Rename project' }).getByRole('button', { name: 'Save' }).click()
  const press = header(page).getByRole('button', { name: long })
  await expect(press).toBeVisible()
  const measured = await page.evaluate(() => {
    const nav = document.querySelector('.view-nav')
    const words = document.querySelector('.project-name-text')
    const chevron = document.querySelector('.project-name-open svg')?.getBoundingClientRect()
    const title = document.querySelector('.project-name')?.getBoundingClientRect()
    return {
      navFits: !!nav && nav.scrollWidth <= nav.clientWidth,
      wordsCut: !!words && words.scrollWidth > words.clientWidth,
      chevronInside: !!chevron && !!title && chevron.right <= title.right + 6 && chevron.width > 0,
    }
  })
  expect(measured).toEqual({ navFits: true, wordsCut: true, chevronInside: true })
})

test('rename · an editor sees the project’s title alone, nothing to press', async ({ page }) => {
  await page.goto('/room.html?role=editor')
  await expect(header(page).locator('.project-name')).toHaveText('Fixture project')
  await expect(header(page).getByRole('button', { name: 'Fixture project' })).toHaveCount(0)
})
