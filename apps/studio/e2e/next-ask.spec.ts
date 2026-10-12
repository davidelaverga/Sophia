// The next ask (docs/plans/next-ask.md): once Sophia has answered, the field proposes what comes next as its
// placeholder, with a key cap «Tab»; Tab puts the words in the field with «Ask Sophia» on, Esc puts it away, and the
// quick asks stop offering what was just asked.
import { expect, test, type Page } from '@playwright/test'

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const DEFAULT = 'Continue this question with the team'
const PROPOSAL_ASK = 'Should we go with “Map first, list second”?'
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const messages = (page: Page) => open(page).locator('.conv-messages > li')
const field = (page: Page) => open(page).getByRole('textbox', { name: DEFAULT })
const hint = (page: Page) => open(page).locator('.next-ask')
const quick = (page: Page) => open(page).getByRole('group', { name: 'Ask Sophia in one press' }).getByRole('button')

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** The thread's last two messages: who wrote each (its class) and its words. The list shows a window of the newest. */
const lastTwo = (page: Page) =>
  messages(page).evaluateAll((items) =>
    items.slice(-2).map((li) => ({
      sophia: li.querySelector('.conv-msg.sophia') !== null || li.classList.contains('sophia'),
      text: li.textContent,
    })),
  )

/** Words sent, and Sophia's answer in: the words the next-to-last message, the last hers. */
async function answered(page: Page, words: string) {
  await expect
    .poll(
      async () => {
        const [asked, answer] = await lastTwo(page)
        return !!asked && !!answer && asked.text.includes(words) && answer.sophia
      },
      { timeout: 15_000 },
    )
    .toBe(true)
}

/** A quick ask pressed, and Sophia's answer in. */
async function askAndWait(page: Page, words: string) {
  await quick(page).filter({ hasText: words }).click()
  await answered(page, words)
}

test('next ask · nothing is proposed while the newest message is the viewer’s', async ({ page }) => {
  await page.goto(PAGE)
  await expect.poll(async () => (await lastTwo(page)).at(-1)?.sophia).toBe(false)
  await expect(field(page)).toHaveAttribute('placeholder', DEFAULT)
  await expect(hint(page)).toHaveCount(0)
  await expect(quick(page)).toHaveText(['Sum it up', 'What’s still open?', 'What did we decide?'])
})

test('next ask · «Sum it up» answered: the field proposes the proposal waiting, Tab stands, the row drops what was asked', async ({
  page,
}) => {
  await page.goto(PAGE)
  await askAndWait(page, 'Sum it up')
  await expect(field(page)).toHaveAttribute('placeholder', PROPOSAL_ASK)
  await expect(hint(page)).toBeVisible()
  await expect(hint(page).locator('kbd')).toHaveText('Tab')
  // Described for a screen reader: the suggestion and what Tab does.
  const described = await field(page).evaluate((el) => {
    const id = el.getAttribute('aria-describedby') ?? ''
    return id ? (document.getElementById(id)?.textContent ?? '') : ''
  })
  expect(described).toContain(PROPOSAL_ASK)
  expect(described).toContain('Tab')
  // «Sum it up» asked, and its summary says what was decided: of the three, only «What’s still open?» is left.
  await expect(quick(page)).toHaveText(['What’s still open?'])
})

test('next ask · Tab puts the words in the field with «Ask Sophia» on, the focus kept; Enter sends them', async ({
  page,
}) => {
  await page.goto(PAGE)
  await askAndWait(page, 'Sum it up')
  await open(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await field(page).focus()
  await page.keyboard.press('Tab')
  await expect(field(page)).toHaveValue(PROPOSAL_ASK)
  await expect(field(page)).toBeFocused()
  await expect(open(page).getByRole('checkbox', { name: 'Ask Sophia' })).toBeChecked()
  await expect(hint(page)).toHaveCount(0)
  await page.keyboard.press('Enter')
  await answered(page, PROPOSAL_ASK)
})

test('next ask · Esc puts it away: quiet until her next answer, and it does not come back', async ({ page }) => {
  await page.goto(PAGE)
  await askAndWait(page, 'Sum it up')
  await field(page).focus()
  await page.keyboard.press('Escape')
  await expect(field(page)).toHaveAttribute('placeholder', DEFAULT)
  await expect(hint(page)).toHaveCount(0)
  // Another answer in: the proposal's ask, first in order, stays away.
  await askAndWait(page, 'What’s still open?')
  await expect(field(page)).not.toHaveAttribute('placeholder', PROPOSAL_ASK)
})

test('next ask · with words written, Tab is Tab: the field keeps them and the focus moves on', async ({ page }) => {
  await page.goto(PAGE)
  await askAndWait(page, 'Sum it up')
  await field(page).fill('a')
  await expect(hint(page)).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(field(page)).toHaveValue('a')
  await expect(field(page)).not.toBeFocused()
})
