import { expect, test, type Page } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

// Project conversations, the writes (docs/plans/project-conversation-writes.md, Davide's chapter 2): continuing one,
// with or without Sophia, and starting one. Behind the vision flag the fixture pages set; every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const rows = (page: Page) => list(page).getByRole('listitem').getByRole('button')
const titles = (page: Page) => rows(page).locator('.conv-title')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const messages = (page: Page) => open(page).getByRole('listitem')
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })
const send = (page: Page) => open(page).getByRole('button', { name: 'Send' })
const form = (page: Page) => page.getByRole('form', { name: 'New conversation' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const written = async (page: Page, kind: string) => (await served(page)).filter((s) => s.startsWith(`${kind}:`))

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** Opens the second conversation (Marco and Lucía's, no Sophia), whose messages fit a page. */
async function openBriefs(page: Page, query = '') {
  await page.goto(`${PAGE}${query}`)
  await rows(page).nth(1).click()
  await expect(messages(page)).toHaveCount(2)
}

test('writes · a message sent is listed last as You, once, the conversation goes to the top, and the field clears', async ({
  page,
}) => {
  await openBriefs(page)
  await open(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await field(page).fill('One page, then a link to the sources.')
  await send(page).click()
  await expect(messages(page)).toHaveCount(3)
  await expect(messages(page).last()).toContainText('You')
  await expect(messages(page).last()).toContainText('One page, then a link to the sources.')
  await expect(field(page)).toHaveValue('')
  await expect(titles(page).first()).toHaveText('Short or long briefs?')
  // Not asked: no answer is waited for.
  await expect(open(page)).not.toContainText('Sophia is answering…')
  expect(await written(page, 'conversation-message')).toEqual([
    'conversation-message:One page, then a link to the sources.:no',
  ])
})

test('writes · asked, Sophia is answering until her answer is listed, after the feed moves', async ({ page }) => {
  await openBriefs(page)
  await expect(open(page).getByRole('checkbox', { name: 'Ask Sophia' })).toBeChecked()
  await field(page).fill('Sophia, which do readers finish?')
  await send(page).click()
  await expect(open(page)).toContainText('Sophia is answering…')
  await expect(messages(page)).toHaveCount(4)
  await expect(messages(page).last()).toContainText('Sophia')
  await expect(open(page)).not.toContainText('Sophia is answering…')
  // Her answer counts her in.
  await expect(open(page)).toContainText('Contributors: Marco, Lucía, You · Sophia')
  expect(await written(page, 'conversation-message')).toEqual([
    'conversation-message:Sophia, which do readers finish?:yes',
  ])
})

test('writes · Send is unavailable with nothing written; Enter sends, Shift+Enter starts a line', async ({ page }) => {
  await openBriefs(page)
  await expect(send(page)).toHaveAttribute('aria-disabled', 'true')
  await send(page).click()
  expect(await written(page, 'conversation-message')).toEqual([])
  await field(page).fill('First line')
  await field(page).press('Shift+Enter')
  await field(page).pressSequentially('second line')
  await expect(field(page)).toHaveValue('First line\nsecond line')
  await field(page).press('Enter')
  await expect(messages(page).last()).toContainText('First line')
  expect(await written(page, 'conversation-message')).toHaveLength(1)
})

test('writes · a lost reply says Not confirmed, and Send sends it again under its key: one message', async ({
  page,
}) => {
  await openBriefs(page, '&send=lost')
  await open(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await field(page).fill('Did this one land?')
  await send(page).click()
  await expect(open(page)).toContainText('Not confirmed: “Did this one land?”')
  await expect(field(page)).toHaveValue('Did this one land?')
  await send(page).click()
  await expect(open(page)).not.toContainText('Not confirmed')
  await expect(messages(page).filter({ hasText: 'Did this one land?' })).toHaveCount(1)
  await expect(field(page)).toHaveValue('')
  expect(await written(page, 'conversation-message')).toHaveLength(1)
})

test('writes · a refusal says why and keeps the words', async ({ page }) => {
  await openBriefs(page, '&send=refused')
  await field(page).fill('Refused words')
  await send(page).click()
  await expect(open(page)).toContainText('That isn’t yours to write here.')
  await expect(field(page)).toHaveValue('Refused words')
  await expect(messages(page)).toHaveCount(2)
})

test('writes · a draft is kept when another conversation is opened and this one again', async ({ page }) => {
  await openBriefs(page)
  await field(page).fill('Half a thought')
  await rows(page).nth(0).click()
  await expect(field(page)).toHaveValue('')
  await rows(page).nth(1).click()
  await expect(field(page)).toHaveValue('Half a thought')
})

test('writes · New conversation: Start waits for both fields; started, it opens at the top; Cancel returns the focus', async ({
  page,
}) => {
  await page.goto(PAGE)
  const start = list(page).getByRole('button', { name: 'New conversation' })
  await start.click()
  await expect(form(page)).toBeVisible()
  await expect(form(page).getByRole('textbox', { name: 'Question' })).toBeFocused()
  await form(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(form(page)).toHaveCount(0)
  await expect(start).toBeFocused()

  await start.click()
  const go = form(page).getByRole('button', { name: 'Start' })
  await expect(go).toHaveAttribute('aria-disabled', 'true')
  await form(page).getByRole('textbox', { name: 'Question' }).fill('Who checks the March figures?')
  await expect(go).toHaveAttribute('aria-disabled', 'true')
  await form(page).getByRole('textbox', { name: 'First message' }).fill('Finance or us?')
  await form(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await go.click()
  await expect(form(page)).toHaveCount(0)
  await expect(titles(page).first()).toHaveText('Who checks the March figures?')
  await expect(rows(page).first()).toHaveAttribute('aria-pressed', 'true')
  await expect(open(page).getByRole('heading', { level: 3 })).toHaveText('Who checks the March figures?')
  await expect(messages(page)).toHaveCount(1)
  await expect(messages(page).first()).toContainText('Finance or us?')
  expect(await written(page, 'conversation-start')).toEqual(['conversation-start:Who checks the March figures?:no'])
})

test('writes · a viewer has no field and no New conversation, and is told why', async ({ page }) => {
  await page.goto(`${PAGE}&role=viewer`)
  await expect(messages(page)).toHaveCount(6)
  await expect(field(page)).toHaveCount(0)
  await expect(list(page).getByRole('button', { name: 'New conversation' })).toHaveCount(0)
  await expect(open(page)).toContainText('Viewers read conversations; members write in them.')
})

test('writes · controls are at least 24 px, and the text keeps to the scale with the form open', async ({ page }) => {
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  await list(page).getByRole('button', { name: 'New conversation' }).click()
  for (const state of ['form', 'composer']) {
    if (state === 'composer') {
      await form(page).getByRole('button', { name: 'Cancel' }).click()
      await expect(field(page)).toBeVisible()
    }
    const short = await page
      .locator(
        '.conversations button:visible, .conversations input:not([type=checkbox]):visible, .conversations textarea:visible',
      )
      .evaluateAll((all) =>
        all
          .map((el) => ({ name: el.textContent.trim().slice(0, 20), h: el.getBoundingClientRect().height }))
          .filter((c) => c.h < 23.5),
      )
    expect(short, state).toEqual([])
    const sizes = await typeSizes(page, '.conversations')
    expect(
      sizes.filter((s) => !['10.5px', '12px', '13px', '14px', '18px'].includes(s)),
      sizes.join(' '),
    ).toEqual([])
  }
})
