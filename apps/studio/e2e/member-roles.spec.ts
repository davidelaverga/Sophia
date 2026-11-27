import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// An admin changes a member's role, and can hand the admin role over (docs/plans/member-roles.md, A27): the Invite
// sheet's Members tab lists who is in the project, with a role select for an admin; a project keeps an admin, so the
// only admin stepping down is told why. Every name is synthetic.

const MARCO = '00000000-0000-4000-8000-0000000000b1'
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])

async function inProject(page: Page, query = '') {
  await page.goto(`/room.html?demo=1${query}`)
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).first().click()
  const tab = page.getByRole('tab', { name: 'Members' })
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click()
  return page.getByRole('list', { name: 'In this project' })
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

test('roles · an admin makes a member an admin from the Members tab', async ({ page }) => {
  const list = await inProject(page)
  await expect(list.getByRole('listitem')).toHaveCount(3)
  const marco = list.getByRole('combobox', { name: 'Role of Marco' })
  await expect(marco).toHaveValue('editor')
  await marco.selectOption('admin')
  await expect.poll(() => served(page)).toContain(`role:${MARCO}:admin`)
  await expect(marco).toHaveValue('admin')
})

test('roles · the only admin stepping down is told why, and their role stays', async ({ page }) => {
  const list = await inProject(page, '&admins=1')
  const mine = list.getByRole('combobox', { name: 'Your role' })
  await mine.selectOption('editor')
  await expect(list.getByRole('alert')).toContainText('A project needs an admin')
  await expect(mine).toHaveValue('admin')
})

test('roles · a change that lands says who has which role now beside its select, then goes, and clears an earlier refusal (focus-kept.md)', async ({
  page,
}) => {
  const list = await inProject(page, '&admins=1')
  await list.getByRole('combobox', { name: 'Your role' }).selectOption('editor')
  await expect(list.getByRole('alert')).toContainText('A project needs an admin')
  const marco = list.getByRole('combobox', { name: 'Role of Marco' })
  await marco.focus()
  await marco.selectOption('viewer')
  const row = list.getByRole('listitem').filter({ hasText: 'Marco' })
  await expect(row.getByRole('status')).toHaveText('Marco is now a viewer.')
  await expect(list.getByRole('alert')).toHaveCount(0)
  // The keyboard's place is kept: the select waited as it saved, never dropping the focus to the page.
  await expect(marco).toBeFocused()
  await expect(row.getByRole('status')).toHaveCount(0, { timeout: 6_000 })
})

test('roles · an editor sees who is in the project and their roles, with nothing to change', async ({ page }) => {
  await page.goto('/room.html?demo=1&role=editor')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).first().click()
  await page.getByRole('tab', { name: 'Members' }).click()
  const list = page.getByRole('list', { name: 'In this project' })
  await expect(list.getByRole('listitem')).toHaveCount(3)
  await expect(list.getByRole('combobox')).toHaveCount(0)
  await expect(list.getByRole('listitem').filter({ hasText: 'Marco' })).toContainText('Editor')
})

// A role change whose reply was lost may have landed: the members are read again and say which
// (docs/plans/save-reply-lost.md).
test('roles · a change whose reply was lost after it landed is said as saved, with the new role', async ({ page }) => {
  const list = await inProject(page)
  const marco = list.getByRole('combobox', { name: 'Role of Marco' })
  await expect(marco).toHaveValue('editor')
  await page.evaluate(() => window.fixture?.loseNextSaveReply(true))
  await marco.selectOption('viewer')
  const row = list.getByRole('listitem').filter({ hasText: 'Marco' })
  await expect(row.getByRole('status')).toHaveText('Saved. The reply was slow, so we checked.')
  // Read at once, not waited for: the line never shows beside the old role.
  expect(await marco.inputValue()).toBe('viewer')
  await expect(list.getByRole('alert')).toHaveCount(0)
  expect(await served(page)).toContain(`role:${MARCO}:viewer`)
})

test('roles · a change whose reply was lost before it landed says the role wasn’t changed', async ({ page }) => {
  const list = await inProject(page)
  const marco = list.getByRole('combobox', { name: 'Role of Marco' })
  await expect(marco).toHaveValue('editor')
  await page.evaluate(() => window.fixture?.loseNextSaveReply(false))
  await marco.selectOption('viewer')
  const row = list.getByRole('listitem').filter({ hasText: 'Marco' })
  await expect(row.getByRole('alert')).toHaveText('The role wasn’t changed. Try again.')
  await expect(marco).toHaveValue('editor')
  expect((await served(page)).filter((s) => s.startsWith('role:'))).toEqual([])
  await marco.selectOption('viewer')
  await expect.poll(() => served(page)).toContain(`role:${MARCO}:viewer`)
  await expect(row.getByRole('alert')).toHaveCount(0)
  await expect(marco).toHaveValue('viewer')
})

test('roles · a lost change whose check can’t be read either keeps today’s words', async ({ page }) => {
  const list = await inProject(page)
  const marco = list.getByRole('combobox', { name: 'Role of Marco' })
  await expect(marco).toHaveValue('editor')
  await page.evaluate(() => window.fixture?.loseNextSaveReply(false, { failRead: true }))
  await marco.selectOption('viewer')
  const row = list.getByRole('listitem').filter({ hasText: 'Marco' })
  await expect(row.getByRole('alert')).toHaveText('Couldn’t change the role.')
  await expect(row.getByRole('status')).toHaveCount(0)
})

test('roles · one member’s change answered never frees another’s select while its change is on the way', async ({
  page,
}) => {
  const list = await inProject(page)
  const marco = list.getByRole('combobox', { name: 'Role of Marco' })
  const lucia = list.getByRole('combobox', { name: 'Role of Lucía' })
  await page.evaluate(() => window.fixture?.holdSaves(true))
  // A select whose change is on its way waits (aria-disabled), keeping the focus (focus-kept.md).
  await marco.selectOption('viewer')
  await expect(marco).toHaveAttribute('aria-disabled', 'true')
  await lucia.selectOption('editor')
  await expect(lucia).toHaveAttribute('aria-disabled', 'true')
  await expect(marco).toHaveAttribute('aria-disabled', 'true')
  await page.evaluate(() => window.fixture?.holdSaves(false))
  await expect(marco).not.toHaveAttribute('aria-disabled')
  await expect(lucia).not.toHaveAttribute('aria-disabled')
  await expect(marco).toHaveValue('viewer')
  await expect(lucia).toHaveValue('editor')
})
