// A question asks Sophia too (docs/plans/question-asks.md): words ending in «?» with «Ask Sophia» off show the key cap
// «Tab»; Tab turns her on, the words and the focus kept.
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/room.html?place=conversations&conversations=1'
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })
const sophia = (page: Page) => open(page).getByRole('checkbox', { name: 'Ask Sophia' })
const hint = (page: Page) => open(page).locator('.next-ask')
const messages = (page: Page) => open(page).locator('.conv-messages > li')

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** The conversation open, «Ask Sophia» off, the field focused. */
async function quiet(page: Page) {
  await page.goto(PAGE)
  await sophia(page).uncheck()
  await expect(sophia(page)).not.toBeChecked()
  await field(page).focus()
}

test('question · «?» with Sophia off: the key cap stands, Tab asks her too, the words and the focus kept; Enter sends', async ({
  page,
}) => {
  await quiet(page)
  await page.keyboard.type('What should we cut first?')
  await expect(hint(page)).toBeVisible()
  const described = await field(page).evaluate((el) => {
    const id = el.getAttribute('aria-describedby') ?? ''
    return id ? (document.getElementById(id)?.textContent ?? '') : ''
  })
  expect(described).toContain('Tab asks Sophia')
  await page.keyboard.press('Tab')
  await expect(sophia(page)).toBeChecked()
  await expect(field(page)).toHaveValue('What should we cut first?')
  await expect(field(page)).toBeFocused()
  await expect(hint(page)).toHaveCount(0)
  await expect(open(page).getByText('Sophia will answer')).toBeVisible()
  await page.keyboard.press('Enter')
  // Her answer comes after the question: the newest message is hers.
  await expect
    .poll(
      () =>
        messages(page).evaluateAll((items) => {
          const [asked, answer] = items.slice(-2)
          return (
            !!asked?.textContent.includes('What should we cut first?') &&
            !!answer?.querySelector('.conv-msg.sophia, .sophia')
          )
        }),
      { timeout: 15_000 },
    )
    .toBe(true)
})

test('question · without a question mark there is no key cap, and Tab leaves the field', async ({ page }) => {
  await quiet(page)
  await page.keyboard.type('We cut the intro.')
  await expect(hint(page)).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(field(page)).not.toBeFocused()
  await expect(sophia(page)).not.toBeChecked()
})

test('question · with Sophia asked already, a question shows no key cap', async ({ page }) => {
  await page.goto(PAGE)
  await sophia(page).check()
  await field(page).fill('What should we cut first?')
  await expect(hint(page)).toHaveCount(0)
})
