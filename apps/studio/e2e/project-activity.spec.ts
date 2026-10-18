import { expect, test, type Page } from '@playwright/test'

// A project's activity, for its admins (docs/plans/project-activity.md, A28): from the project's menu, who did what,
// on whom and when, newest first; a person filter, and «Earlier» for more. Codes and names only, never content. Every
// name is synthetic.

const header = (page: Page) => page.locator('header.topbar')
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Project activity' })
const rows = (page: Page) => sheet(page).getByRole('list', { name: 'Activity' }).getByRole('listitem')

async function open(page: Page, query = '') {
  await page.goto(`/room.html${query}`)
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await page.getByRole('menu', { name: 'Project' }).getByRole('menuitem', { name: 'Activity' }).click()
  await expect(sheet(page)).toBeVisible()
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

test('activity · an admin reads who did what, on whom and when, newest first', async ({ page }) => {
  await open(page)
  await expect(rows(page)).toHaveCount(50)
  await expect(rows(page).first()).toContainText('Marco')
  await expect(rows(page).first()).toContainText('Took out of the call')
  await expect(rows(page).first()).toContainText('Lucía')
  await expect(rows(page).nth(1)).toContainText('Changed the role of')
})

test('activity · a person filter keeps what that person did', async ({ page }) => {
  await open(page)
  await sheet(page).getByLabel('Person').selectOption({ label: 'Lucía' })
  await expect(rows(page).first()).toContainText('Lucía')
  for (const text of await rows(page).locator('.activity-who').allInnerTexts()) expect(text).toBe('Lucía')
})

test('activity · «Earlier» reads the next page, down to the project’s creation', async ({ page }) => {
  await open(page)
  await sheet(page).getByRole('button', { name: 'Earlier' }).click()
  await expect(rows(page)).toHaveCount(60)
  await expect(rows(page).last()).toContainText('Project created')
  await expect(sheet(page).getByRole('button', { name: 'Earlier' })).toHaveCount(0)
})

test('activity · an editor’s project menu has no Activity', async ({ page }) => {
  await page.goto('/room.html?role=editor')
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await expect(page.getByRole('menu', { name: 'Project' }).getByRole('menuitem', { name: 'Activity' })).toHaveCount(0)
})

test('activity · a slow read says it is reading, then why it takes long (Codex P1 on #355)', async ({ page }) => {
  await page.clock.install()
  await open(page, '?hold=activity')
  const status = sheet(page).getByRole('status')
  await expect(status).toHaveText('Reading the activity…')
  // fastForward fires the note's one 6 s timer as runFor does, without running every frame and interval of the room
  // page in between: runFor(6500) took about 5 s of real time per case here, fastForward a few ms (2026-10-16).
  await page.clock.fastForward(6500)
  await expect(status).toHaveText(
    'Taking longer than usual. After a quiet spell, the first answer can take up to a minute.',
  )
})

test('activity · a long unbroken name wraps inside its row; the act and its time stay in the sheet (Codex P2 on #355)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  // Every row shares the columns: the acts start at one edge, whatever the name before them.
  const lefts = await sheet(page)
    .locator('.activity-what')
    .evaluateAll((all) => all.slice(0, 8).map((w) => Math.round(w.getBoundingClientRect().left)))
  expect(new Set(lefts).size).toBe(1)
  const row = rows(page).first()
  await row.locator('.activity-who').evaluate((w) => {
    w.textContent = `${'a'.repeat(60)}@${'example'.repeat(6)}.test`
  })
  const fits = await row.evaluate((li) => {
    const box = li.getBoundingClientRect()
    const when = li.querySelector('.activity-when')?.getBoundingClientRect()
    return li.scrollWidth <= li.clientWidth && when !== undefined && when.right <= box.right + 0.5
  })
  expect(fits).toBe(true)
})
