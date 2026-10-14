// An invitation waiting in the app (docs/plans/pending-invitations-studio.md): Home says who invited you to what, as
// what, and Accept opens the project; nothing shows when nothing waits.
import { expect, test } from '@playwright/test'

test('home · an invitation waiting for you says who, to what and as what; Accept opens the project', async ({
  page,
}) => {
  await page.goto('/home.html?invited=1')
  const band = page.getByRole('region', { name: 'Invitations' })
  await expect(band).toContainText('Luis invited you to “Onboarding pilot” as an editor')
  await band.getByRole('button', { name: 'Accept' }).click()
  await expect
    .poll(() => page.evaluate(() => window.homeFixture?.pressed ?? []))
    .toContain('open 00000000-0000-4000-8000-0000000000b1')
  await expect
    .poll(() => page.evaluate(() => window.homeFixture?.pressed ?? []))
    .toContain('accept 00000000-0000-4000-8000-0000000000a1')
})

test('home · with nothing waiting, no invitations band', async ({ page }) => {
  await page.goto('/home.html')
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Invitations' })).toHaveCount(0)
})
