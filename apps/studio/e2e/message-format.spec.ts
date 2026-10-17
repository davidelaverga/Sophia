import { expect, test } from '@playwright/test'

// Bold, code and quotes in messages (docs/plans/message-format.md): drawn as elements, never as HTML; an address stays
// a link. Every message is synthetic.

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('format · in the room’s chat, **bold**, `code` and an address read as such', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1')
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await page.getByRole('button', { name: /^Chat/ }).first().click()
  const bar = page.locator('#converse-draft')
  await bar.fill('Ship **Friday**, run `pnpm check`, see https://example.com/plan <b>x</b>')
  await bar.press('Enter')
  const last = page.getByRole('list', { name: 'Recent discussion' }).locator('.contribution').last()
  await expect(last.locator('strong')).toHaveText('Friday')
  await expect(last.locator('code.msg-code')).toHaveText('pnpm check')
  await expect(last.getByRole('link', { name: 'https://example.com/plan' })).toBeVisible()
  // Markup typed stays words.
  await expect(last).toContainText('<b>x</b>')
  await expect(last.locator('b')).toHaveCount(0)
})

test('format · in Conversations, Quote’s «> » line shows as a quote', async ({ page }) => {
  await page.goto('/room.html?place=conversations&conversations=1')
  const open = page.getByRole('region', { name: 'Open conversation' })
  const field = open.getByRole('textbox', { name: 'Continue this question with the team' })
  await field.fill('> Lucía: one page is enough\nAgreed, one page.')
  await field.press('Enter')
  const quote = open.locator('.conv-msg').last().locator('.msg-quote')
  await expect(quote).toHaveText('Lucía: one page is enough')
  await expect(open.locator('.conv-msg').last()).not.toContainText('> Lucía')
})
