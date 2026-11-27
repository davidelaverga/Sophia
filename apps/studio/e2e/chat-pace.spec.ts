import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// The chat at the pace of a person (docs/plans/chat-pace.md): a message to the room is drawn at once and never twice; a
// new message beside a closed chat is peeked at and opens it; one author's run in a minute shows one name; a link the
// browser won't copy is handed over to copy by hand. Every message is synthetic.

const bar = (page: Page) => page.locator('#converse-draft')
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const pending = (page: Page) => page.getByRole('list', { name: 'Your message on its way' }).locator('.contribution')
const chatToggle = (page: Page) => page.locator('.panel-toggles [data-panel="chat"]')

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('pace · a message to the room is drawn at once, dimmed while it goes, then once in the discussion', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1')
  await chatToggle(page).click()
  // The send takes 2 s before it reaches the service (the fixture's fetch, slowed in the page).
  await page.evaluate(() => {
    const answer = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input
      if (init?.method === 'POST' && url.endsWith('/contributions')) await new Promise((r) => setTimeout(r, 2000))
      return answer(input, init)
    }
  })
  await bar(page).fill('The deck is in Resources.')
  await bar(page).press('Enter')
  await expect(pending(page)).toContainText('The deck is in Resources.')
  await expect(pending(page)).toContainText('Sending…')
  await expect(pending(page)).toHaveAttribute('aria-busy', 'true')
  await expect(bar(page)).toHaveValue('')
  // Never drawn twice: the row gives way the moment the discussion holds it.
  await expect(discussion(page).getByText('The deck is in Resources.')).toHaveCount(1)
  await expect(pending(page)).toHaveCount(0)
  await expect(page.getByText('The deck is in Resources.')).toHaveCount(1)
})

test('pace · a new message beside the closed chat names its author and first line, and opens the chat', async ({
  page,
}) => {
  await page.goto('/room.html?people=2')
  await drawn(page, DRAWN.room)
  await page.evaluate(() => window.fixture?.say('Can we move the review to Thursday?\nI’m out Wednesday.'))
  const peek = page.locator('.chat-peek')
  await expect(peek).toContainText('Can we move the review to Thursday?')
  await expect(peek).not.toContainText('Wednesday')
  // Said politely, from a line mounted all along: only what arrives is read.
  await expect(page.locator('.chat-peek-line')).toHaveAttribute('role', 'status')
  await peek.click()
  await expect(chatToggle(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(peek).toHaveCount(0)
  // With the chat open, nothing peeks.
  await page.evaluate(() => window.fixture?.say('One more.'))
  await expect(discussion(page).getByText('One more.')).toBeVisible()
  await expect(page.locator('.chat-peek')).toHaveCount(0)
})

test('pace · one author’s messages in a minute show one name and time; the next author starts again', async ({
  page,
}) => {
  await page.goto('/room.html?people=2')
  await chatToggle(page).click()
  await page.evaluate(() => {
    window.fixture?.say('First.')
    window.fixture?.say('Second.')
  })
  const lines = discussion(page).locator('.contribution')
  await expect(lines).toHaveCount(2)
  await expect(lines.nth(0)).not.toHaveAttribute('data-goes-on')
  await expect(lines.nth(1)).toHaveAttribute('data-goes-on', 'true')
  // Its name is still read: hidden from the eye only.
  await expect(lines.nth(1).locator('.contribution-author')).toHaveClass(/sr-only/)
})

test('pace · a member’s invitation link the browser won’t copy is handed over, selected (Invite)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) },
    })
  })
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).first().click()
  const members = page.getByRole('tabpanel', { name: 'Members' })
  await members.getByRole('textbox', { name: 'Email' }).fill('ana@example.test')
  await members.getByRole('button', { name: 'Send invitation' }).click()
  await expect(members).toContainText('ana@example.test')
  await members.getByRole('button', { name: 'Copy link' }).first().click()
  const field = members.getByRole('textbox', { name: 'Link' })
  await expect(field).toHaveAccessibleDescription('Couldn’t copy here. Your browser blocked the clipboard.')
  await expect(field).toBeFocused()
  expect(await field.inputValue()).toMatch(/^https?:\/\//)
  expect(await field.evaluate((el) => el instanceof HTMLInputElement && el.selectionEnd === el.value.length)).toBe(true)
})

/** The page's fetch, with each message to the room first held `ms`, and the first `refuse` of them refused for good. */
const slowSends = (page: Page, hold: number, refusals = 0) =>
  page.evaluate(
    ({ ms, refuse }) => {
      const answer = window.fetch.bind(window)
      let left = refuse
      window.fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input
        if (init?.method !== 'POST' || !url.endsWith('/contributions')) return answer(input, init)
        await new Promise((r) => setTimeout(r, ms))
        if (left-- <= 0) return answer(input, init)
        const body = { code: 'invalid_request', message: 'Not accepted', requestId: '0', retry: 'never' }
        return new Response(JSON.stringify(body), { status: 422, headers: { 'content-type': 'application/json' } })
      }
    },
    { ms: hold, refuse: refusals },
  )

test('pace · new words like the ones on their way stay in the bar when the first lands (Codex P2 on #546)', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1')
  await chatToggle(page).click()
  await slowSends(page, 1500)
  await bar(page).fill('Yes')
  await bar(page).press('Enter')
  await expect(bar(page)).toHaveValue('')
  await bar(page).fill('Yes')
  await expect(discussion(page).getByText('Yes', { exact: true })).toHaveCount(1)
  await expect(pending(page)).toHaveCount(0)
  await expect(bar(page)).toHaveValue('Yes')
})

test('pace · a refused row sent again whose reply is lost goes once it lands: never «Not sent» after (Codex P2 on #546)', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1')
  await chatToggle(page).click()
  await slowSends(page, 800, 1)
  await bar(page).fill('The first word')
  await bar(page).press('Enter')
  // The bar holds new words when the refusal comes: the refused message keeps a row of its own.
  await bar(page).fill('Still writing')
  const notSent = pending(page).filter({ hasText: 'Not sent.' })
  await expect(notSent).toContainText('The first word')
  await page.evaluate(() => window.fixture?.loseNextContributionReply())
  await notSent.getByRole('button', { name: 'Try again' }).click()
  const unknown = pending(page).filter({ hasText: 'Not confirmed.' })
  await expect(unknown).toContainText('The first word')
  await unknown.getByRole('button', { name: 'Try again' }).click()
  await expect(discussion(page).getByText('The first word')).toHaveCount(1)
  await expect(pending(page)).toHaveCount(0)
  await expect(bar(page)).toHaveValue('Still writing')
})
