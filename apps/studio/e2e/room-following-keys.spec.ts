import { expect, test, type Page } from '@playwright/test'

// Following across calls (Codex on #130): the stage's own useFollowing on its fixture page (fixtures/following-keys.tsx),
// its call switched as leaving and joining again switches it. Every word is synthetic.

const said = (page: Page) => page.getByRole('status', { name: 'This call' })
const press = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click()

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.goto('/following-keys.html')
  await expect(said(page)).toHaveText('Call A · not following')
})

test('following keys · a fresh call follows nothing, and never keeps the last call’s choice as its own', async ({
  page,
}) => {
  await press(page, 'Follow')
  await expect(said(page)).toHaveText('Call A · following')
  await press(page, 'Call B')
  await expect(said(page)).toHaveText('Call B · not following')
  await press(page, 'Call C')
  await press(page, 'Call B')
  await expect(said(page)).toHaveText('Call B · not following')
})

test('following keys · back to a call, what it followed is followed again', async ({ page }) => {
  await press(page, 'Follow')
  await press(page, 'Call B')
  await expect(said(page)).toHaveText('Call B · not following')
  await press(page, 'Call A')
  await expect(said(page)).toHaveText('Call A · following')
})

test('following keys · a Stop following owes its focus to that call only', async ({ page }) => {
  await press(page, 'Follow')
  await press(page, 'Stop following')
  await expect(said(page)).toHaveText('Call A · not following · focus owed to Follow')
  await press(page, 'Call C')
  await expect(said(page)).toHaveText('Call C · not following')
})
