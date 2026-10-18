import { expect, test, type Locator } from '@playwright/test'

// Bold, code and quotes in messages (docs/plans/message-format.md): drawn as elements, never as HTML; an address stays
// a link. Every message is synthetic.

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

/** How far a message's first quote starts below the words of its first line, and the message's line height. */
function quoteGap(message: Locator) {
  return message.evaluate((el) => {
    const draft = [...el.querySelectorAll('*')]
      .flatMap((n) => [...n.childNodes])
      .find((n) => n.nodeValue?.includes('My draft'))
    const range = document.createRange()
    if (draft) range.selectNodeContents(draft)
    const quote = el.querySelector('.msg-quote')
    const line = parseFloat(getComputedStyle(el).lineHeight)
    return { between: (quote?.getBoundingClientRect().top ?? 0) - range.getBoundingClientRect().bottom, line }
  })
}

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

test('format · an address whose path holds **marks** is one link; one marked around is a bold link (Codex P2 on #384)', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1')
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await page.getByRole('button', { name: /^Chat/ }).first().click()
  const bar = page.locator('#converse-draft')
  await bar.fill('see https://example.com/**draft** and **https://example.com/plan**')
  await bar.press('Enter')
  const last = page.getByRole('list', { name: 'Recent discussion' }).locator('.contribution').last()
  await expect(last.getByRole('link', { name: 'https://example.com/**draft**', exact: true })).toBeVisible()
  await expect(
    last.locator('strong').getByRole('link', { name: 'https://example.com/plan', exact: true }),
  ).toBeVisible()
})

test('format · a blank line before a quote stays, and a quote’s blank line keeps its height (Codex P2s on #384)', async ({
  page,
}) => {
  await page.goto('/room.html?place=conversations&conversations=1')
  const open = page.getByRole('region', { name: 'Open conversation' })
  const field = open.getByRole('textbox', { name: 'Continue this question with the team' })
  await field.fill('My draft\n\n> First paragraph\n> \n> Second paragraph')
  await field.press('Enter')
  const message = open.locator('.conv-msg').last()
  await expect(message.locator('.msg-quote')).toHaveCount(3)
  const gap = await quoteGap(message)
  // The blank line is a line's height between the draft and the quote, not just the quote's margin.
  expect(gap.between).toBeGreaterThan(gap.line / 2)
  const empty = await message.locator('.msg-quote').nth(1).boundingBox()
  expect(empty?.height ?? 0).toBeGreaterThan(gap.line / 2)
})

test('format · in the room’s discussion too, a blank line before a quote stays (Codex P2 on #429)', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1')
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await page.getByRole('button', { name: /^Chat/ }).first().click()
  const bar = page.locator('#converse-draft')
  await bar.fill('My draft\n\n> Quoted line')
  await bar.press('Enter')
  const last = page.getByRole('list', { name: 'Recent discussion' }).locator('.contribution').last()
  await expect(last.locator('.msg-quote')).toHaveText('Quoted line')
  const gap = await quoteGap(last)
  // As in Conversations: a line's height between the draft and the quote, not just the quote's margin.
  expect(gap.between).toBeGreaterThan(gap.line / 2)
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
