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
