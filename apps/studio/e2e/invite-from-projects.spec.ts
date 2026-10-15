import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// Invite people from your other projects (docs/plans/invite-from-projects.md, A26): the Members tab lists the people an
// admin already shares a project with, each with a checkbox; one role for the choice, and «Invite N» sends each the
// same invitation a typed email does. Every address is synthetic.

async function members(page: Page, query = '') {
  await page.goto(`/room.html?demo=1${query}`)
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).first().click()
  return page.getByRole('tabpanel', { name: 'Members' })
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('from projects · an admin picks two people and invites them with one role; they leave the list', async ({
  page,
}) => {
  const tab = await members(page)
  const from = tab.getByRole('group', { name: 'From your projects' })
  await expect(from.getByRole('checkbox')).toHaveCount(3)
  await from.getByRole('checkbox', { name: 'marco@example.test' }).check()
  await from.getByRole('checkbox', { name: 'noor@example.test' }).check()
  await from.getByLabel('Role').selectOption('viewer')
  await from.getByRole('button', { name: 'Invite 2' }).click()
  await expect(from.getByRole('status')).toHaveText('Invited 2')
  await expect(from.getByRole('checkbox')).toHaveCount(1)
  await expect(from.getByRole('checkbox', { name: 'lucia@example.test' })).toBeVisible()
  // Listed as the typed ones are: one email each, the role chosen.
  const listed = tab.locator('.invitation-list li', { hasText: 'marco@example.test' })
  await expect(listed).toContainText('viewer')
  await expect(tab.locator('.invitation-list li', { hasText: 'noor@example.test' })).toContainText('viewer')
})

test('from projects · with nobody to offer, the section isn’t there and the email field is', async ({ page }) => {
  const tab = await members(page, '&invitable=none')
  await expect(tab.getByRole('group', { name: 'From your projects' })).toHaveCount(0)
  await expect(tab.getByRole('textbox', { name: 'Email' })).toBeVisible()
})

test('from projects · one that fails is named and stays chosen; the other goes', async ({ page }) => {
  const tab = await members(page)
  await page.evaluate(() => window.fixture?.failInvite('noor@example.test'))
  const from = tab.getByRole('group', { name: 'From your projects' })
  await from.getByRole('checkbox', { name: 'marco@example.test' }).check()
  await from.getByRole('checkbox', { name: 'noor@example.test' }).check()
  await from.getByRole('button', { name: 'Invite 2' }).click()
  await expect(from.getByRole('alert')).toContainText('Couldn’t invite noor@example.test')
  await expect(from.getByRole('checkbox', { name: 'noor@example.test' })).toBeChecked()
  await expect(from.getByRole('checkbox', { name: 'marco@example.test' })).toHaveCount(0)
  await from.getByRole('button', { name: 'Invite 1' }).click()
  await expect(from.getByRole('status')).toHaveText('Invited 1')
})
