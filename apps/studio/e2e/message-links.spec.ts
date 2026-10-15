import { expect, test, type Locator, type Page } from '@playwright/test'

// A web address in a message is a link (docs/plans/message-links.md): in the room's chat, in Conversations and in
// Personal it opens in a new tab, with nothing of this page handed to it; what Find marks inside one stays marked and
// the link stays whole. Every message and address here is synthetic.

const URL = 'https://example.com/deck?v=2'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

/** The link, as it should be: the address, a new tab, no opener and no referrer. */
async function isLink(link: Locator) {
  await expect(link).toHaveAttribute('href', URL)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(link).toHaveText(URL)
}

test('links · in the room’s chat, an address in a message is a link', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1')
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await page.getByRole('button', { name: /^Chat/ }).first().click()
  const bar = page.locator('#converse-draft')
  await bar.fill(`The deck is at ${URL}.`)
  await bar.press('Enter')
  const discussion = page.getByRole('list', { name: 'Recent discussion' })
  await isLink(discussion.getByRole('link', { name: URL }))
  await expect(discussion.locator('.contribution').last()).toContainText(`The deck is at ${URL}.`)
})

test('links · in Conversations, an address in a message is a link', async ({ page }) => {
  await page.goto('/room.html?place=conversations&conversations=1')
  const open = page.getByRole('region', { name: 'Open conversation' })
  const field = open.getByRole('textbox', { name: 'Continue this question with the team' })
  await field.fill(`Here: ${URL}`)
  await field.press('Enter')
  await isLink(open.getByRole('link', { name: URL }).last())
})

async function personalLink(page: Page) {
  await page.goto('/personal.html')
  await page.locator('#c-input').fill(`Saved it at ${URL}`)
  await page.keyboard.press('Enter')
  const link = page.locator('.msg.me .body').getByRole('link', { name: URL })
  await isLink(link)
  return link
}

test('links · in Personal, an address in a message is a link', async ({ page }) => {
  await personalLink(page)
})

test('links · in Personal, what Find marks inside a link stays marked, and the link stays whole', async ({ page }) => {
  const link = await personalLink(page)
  await page.locator('#c-input').focus()
  await page.keyboard.press('ControlOrMeta+f')
  await page.keyboard.type('deck')
  await expect(link.locator('mark')).toHaveText(['deck'])
  await isLink(link)
})
