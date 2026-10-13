// The same question (docs/plans/same-question.md): starting a conversation on what one here already asks, the form says
// so and offers to open it instead.
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/room.html?place=conversations&conversations=1'
const form = (page: Page) => page.getByRole('form', { name: 'New conversation' })
const same = (page: Page) => form(page).locator('.conv-same')

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

async function newConversation(page: Page) {
  await page.goto(PAGE)
  await page.locator('.conv-list-head button').first().click()
  await expect(form(page)).toBeVisible()
}

test('same question · a question already asked here is named, and its press opens that conversation', async ({
  page,
}) => {
  await newConversation(page)
  await form(page).getByRole('textbox', { name: 'Question' }).fill('Should briefs be short or long?')
  await expect(same(page)).toBeVisible()
  await expect(same(page)).toContainText('Short or long briefs?')
  await same(page).getByRole('button').focus()
  await page.keyboard.press('Enter')
  await expect(form(page)).toHaveCount(0)
  const title = page.getByRole('region', { name: 'Open conversation' }).getByRole('heading').first()
  await expect(title).toHaveText('Short or long briefs?')
  // The focus goes with it, to the conversation's title, never to the page's body.
  await expect(title).toBeFocused()
})

test('same question · an unrelated question shows no line, and Start stays', async ({ page }) => {
  await newConversation(page)
  await form(page).getByRole('textbox', { name: 'Question' }).fill('Budget for the Q4 hiring plan')
  await expect(same(page)).toHaveCount(0)
  await expect(form(page).getByRole('button', { name: 'Start' })).toBeVisible()
})

test('same question @phone · a long title with no break wraps inside the form, its press whole (Codex on #266)', async ({
  page,
}) => {
  await newConversation(page)
  await form(page).getByRole('textbox', { name: 'Question' }).fill('Should briefs be short or long?')
  await expect(same(page)).toBeVisible()
  // A matched title holding one long token with no break in it (an id): set on the press as a title of the list would be.
  await same(page)
    .getByRole('button')
    .evaluate((b) => {
      const words = [...b.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '')
      if (words) words.textContent = `“run-${'7f3a9c2b4e1d'.repeat(8)}”`
    })
  const [press, box] = await Promise.all([same(page).getByRole('button').boundingBox(), form(page).boundingBox()])
  expect((press?.x ?? 0) + (press?.width ?? 0)).toBeLessThanOrEqual((box?.x ?? 0) + (box?.width ?? 0) + 0.5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})

test('same question · a question that turns the one asked here shows no line (Codex on #274)', async ({ page }) => {
  await newConversation(page)
  const question = form(page).getByRole('textbox', { name: 'Question' })
  // Alike in its words, but negated by «cannot» (#274's matcher): another question, so nothing is named.
  await question.fill('Briefs cannot be short or long?')
  await expect(form(page).getByRole('button', { name: 'Start' })).toBeVisible()
  await expect(same(page)).toHaveCount(0)
  // The same words without the turn: named again.
  await question.fill('Should briefs be short or long?')
  await expect(same(page)).toContainText('Short or long briefs?')
})
