import { expect, test, type Page } from '@playwright/test'

// Personal: the demo's Sophia remembers what you told her (docs/plans/spaces-companion.md). On the fixture page; her
// words are the fixture's, the bar the runtime will meet.

const PAGE = '/personal.html?demo=1'
const field = (page: Page) => page.locator('#c-input')
const lastAnswer = (page: Page) => page.locator('.msg.sophia .body').last()

async function say(page: Page, words: string) {
  const answers = await page.locator('.msg.sophia .body').count()
  await field(page).fill(words)
  await field(page).press('Enter')
  await expect(page.locator('.msg.sophia .body')).toHaveCount(answers + 1)
}

test('companion · a name said before brings back what you said about them', async ({ page }) => {
  await page.goto(PAGE)
  await say(page, 'I think I should apologise to Davide first.')
  await expect(lastAnswer(page)).toContainText(
    'You told me “I promised a date I couldn’t keep, and Davide was quiet the whole time.”',
  )
  await expect(lastAnswer(page)).toContainText('how it landed on Davide?')
})

test('companion · someone else apologising, or a question why, is not your apology; a name inside another word is no one', async ({
  page,
}) => {
  await page.goto(PAGE)
  await say(page, 'I wish Davide would apologise.')
  await expect(lastAnswer(page)).toContainText('You mentioned Davide before:')
  await expect(lastAnswer(page)).not.toContainText('apologise for')
  await say(page, 'Why should I apologise to Davide?')
  await expect(lastAnswer(page)).not.toContainText('apologise for')
  await say(page, 'Mr Davidek moved the launch again.')
  await expect(lastAnswer(page)).not.toContainText('Davide')
})

test('companion · a weight named before is asked about again, and a day is no person', async ({ page }) => {
  await page.goto(PAGE)
  await say(page, 'The deck is still not done for Friday.')
  await expect(lastAnswer(page)).toHaveText(
    'It comes back to the deck again. Last time you said “I have a pitch on Friday and I keep putting off the deck.” Is it the same weight, or a new one?',
  )
})

test('companion · without the demo, her answer is the checks’ one line', async ({ page }) => {
  await page.goto('/personal.html')
  await say(page, 'I think I should apologise to Davide first.')
  await expect(lastAnswer(page)).toHaveText('I’m here. Tell me more about that.')
})
