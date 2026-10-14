// The newcomer's welcome (docs/plans/newcomer-welcome.md): a project just joined says who brought you and as what, what
// it is for and its goals, once; «See the goals» opens Goals, «Got it» ends it, and it never comes back.
import { expect, test } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

test('welcome · a project just joined says who brought you, what it is for, and opens its goals', async ({ page }) => {
  await page.goto('/room.html?demo=1&welcome=1')
  await drawn(page, DRAWN.room)
  const band = page.getByRole('region', { name: 'Welcome' })
  await expect(band).toContainText('Welcome to “Onboarding pilot”')
  await expect(band).toContainText('Lucia invited you as an editor.')
  await expect(band).toContainText('3 goals')
  await band.getByRole('button', { name: 'See the goals' }).click()
  await expect(page.getByRole('heading', { name: 'Goals', level: 2 })).toBeVisible()
  await expect(band).toHaveCount(0)
  // Ended, it stays ended: the page opened again says nothing (the fixture keeps the welcome only on its first load).
  await page.evaluate(() => {
    window.history.replaceState(null, '', window.location.pathname + '?demo=1')
  })
  await page.reload()
  await drawn(page, DRAWN.room)
  await expect(page.getByRole('region', { name: 'Welcome' })).toHaveCount(0)
})

test('welcome · «Got it» ends it where it stands', async ({ page }) => {
  await page.goto('/room.html?demo=1&welcome=1')
  const band = page.getByRole('region', { name: 'Welcome' })
  await band.getByRole('button', { name: 'Got it' }).click()
  await expect(band).toHaveCount(0)
})

test('welcome · a project not just joined says nothing', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await expect(page.getByRole('region', { name: 'Welcome' })).toHaveCount(0)
})
