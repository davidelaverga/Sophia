// Invite opens where you are (docs/plans/invite-members.md): an admin out of a call on Members, with each role said in
// one line; in a call, or for an editor, on Guests. The demo answers an invitation as the API does.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const openInvite = async (page: Page) => {
  await page.getByRole('button', { name: 'Invite' }).first().click()
  return page.getByRole('tablist', { name: 'Invite' })
}

test('invite · an admin in the demo opens on Members, reads the role, and an invitation is listed', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  const tabs = await openInvite(page)
  await expect(tabs.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true')
  const members = page.getByRole('tabpanel', { name: 'Members' })
  await expect(members).toContainText('Editors work on the goals and tasks, and invite and let in guests.')
  await members.getByLabel('Role', { exact: true }).selectOption('viewer')
  await expect(members).toContainText('Viewers read the project and change nothing.')
  await members.getByLabel('Role', { exact: true }).selectOption('editor')
  await members.getByRole('textbox', { name: 'Email' }).fill('ana@example.test')
  await members.getByRole('button', { name: 'Send invitation' }).click()
  await expect(members).not.toContainText('That didn’t go through')
  await expect(members).toContainText('ana@example.test')
  await expect(members).toContainText('editor')
  await expect(members.getByRole('textbox', { name: 'Email' })).toHaveValue('')
})

test('invite · in a call, Invite opens on Guests', async ({ page }) => {
  await page.goto('/room.html?demo=1&call=on&people=2')
  const tabs = await openInvite(page)
  await expect(tabs.getByRole('tab', { name: 'Guests' })).toHaveAttribute('aria-selected', 'true')
})

test('invite · an editor, who adds no members, opens on Guests', async ({ page }) => {
  await page.goto('/room.html?demo=1&role=editor')
  await drawn(page, DRAWN.room)
  const tabs = await openInvite(page)
  await expect(tabs.getByRole('tab', { name: 'Guests' })).toHaveAttribute('aria-selected', 'true')
})
