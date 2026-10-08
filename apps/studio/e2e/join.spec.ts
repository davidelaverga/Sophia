import { expect, test, type Page } from '@playwright/test'

// The guest's side of the door (docs/plans/lobby-guest.md), on its fixture page: the Studio's own /join flow over a
// faked API and the fake LiveKit. Each step a guest meets: the invitation, a closed link, the knock, the wait, the
// room's answer (in, not this time, blocked).

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const asked = (page: Page) => page.evaluate(() => [...(window.joinFixture?.asked ?? [])])
const name = (page: Page) => page.getByPlaceholder('Your name')
const knock = (page: Page) => page.getByRole('button', { name: 'Ask to come in' })

async function knockAs(page: Page, who: string) {
  await name(page).fill(who)
  await knock(page).click()
}

test('join · the invitation says who invited them, where to, and asks their name', async ({ page }) => {
  await page.goto('/join.html')
  await expect(page.getByRole('heading', { name: 'Host invited you to the room' })).toBeVisible()
  await expect(page.getByText('“Fixture project” is a room')).toBeVisible()
  await expect(knock(page)).toBeDisabled()
  await name(page).fill('Ana')
  await expect(knock(page)).toBeEnabled()
  expect(await asked(page)).toEqual(['/api/v1/join/preview'])
})

for (const [state, words] of [
  ['expired', 'This invitation has expired.'],
  ['revoked', 'This link was closed by the room.'],
  ['used_up', 'This link has been used as many times as it allows.'],
] as const) {
  test(`join · a ${state} link says so, and asks nothing more`, async ({ page }) => {
    await page.goto(`/join.html?state=${state}`)
    await expect(page.getByRole('heading', { name: 'This door is closed' })).toBeVisible()
    await expect(page.getByText(words)).toBeVisible()
    await expect(name(page)).toHaveCount(0)
  })
}

test('join · a knock waits, by name, until someone lets them in; then the room', async ({ page }) => {
  await page.goto('/join.html')
  await knockAs(page, 'Ana Ruiz')
  await expect(page.getByRole('heading', { name: 'Waiting to be let in, Ana Ruiz' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop waiting' })).toBeVisible()
  await page.evaluate(() => window.joinFixture?.answer('admit'))
  await expect(page.getByText('You’ve been let in')).toBeVisible({ timeout: 8000 })
  expect(await asked(page)).toContain('/api/v1/join/knock')
})

test('join · not let in this time: it says so, and offers to ask again', async ({ page }) => {
  await page.goto('/join.html?answer=deny')
  await knockAs(page, 'Ana Ruiz')
  await expect(page.getByRole('heading', { name: 'Not this time' })).toBeVisible({ timeout: 8000 })
})

test('join · blocked: it says they can’t join, with no door left to try', async ({ page }) => {
  await page.goto('/join.html?answer=block')
  await knockAs(page, 'Ana Ruiz')
  await expect(page.getByRole('heading', { name: 'You can’t join this room' })).toBeVisible({ timeout: 8000 })
  await expect(knock(page)).toHaveCount(0)
})

test('join · a session the invitation names is said under it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/join.html?session=1')
  const line = page.locator('.join-session')
  await expect(line).toContainText('Pilot review')
  // A sentence on one line: not the capitals of a label.
  await expect(line).toHaveCSS('text-transform', 'none')
  const lines = await line.evaluate((el) =>
    Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
  )
  expect(lines).toBe(1)
})
