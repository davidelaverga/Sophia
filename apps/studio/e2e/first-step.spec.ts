// A new project's first step (docs/plans/first-step.md): Sophia's line says to tell her what the project is for, by
// voice («Talk it through») or in writing («Write to Sophia»); once the call begins, or anything is recorded, it goes.
import { expect, test } from '@playwright/test'

test('first step · a new project says to tell Sophia what it is for, with both ways', async ({ page }) => {
  await page.goto('/room.html?fresh=1')
  const stage = page.getByRole('region', { name: 'Project room' })
  await expect(stage).toContainText('A new project')
  await expect(stage).toContainText('Start by telling Sophia what it’s for.')
  await stage.getByRole('button', { name: 'Write to Sophia' }).click()
  await expect(page.getByRole('button', { name: 'Chat with Sophia' })).toBeVisible()
})

test('first step · «Talk it through» joins the room, and the step goes', async ({ page }) => {
  await page.goto('/room.html?fresh=1')
  const stage = page.getByRole('region', { name: 'Project room' })
  await stage.getByRole('button', { name: 'Talk it through' }).click()
  await expect(stage).not.toContainText('A new project')
  await expect(stage.getByRole('button', { name: 'Talk it through' })).toHaveCount(0)
})

test('first step · a project with records says the room is ready', async ({ page }) => {
  await page.goto('/room.html')
  const stage = page.getByRole('region', { name: 'Project room' })
  await expect(stage).toContainText('The room is ready')
  await expect(stage).not.toContainText('A new project')
})
