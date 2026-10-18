import { expect, test, type Page } from '@playwright/test'

// Ask off (CON-01 C1): while Sophia doesn't answer here, the form for a new conversation says so before Start, as the
// open conversation's composer does, and «Ask Sophia» stays a checkbox that records the request.

const PAGE = '/room.html?place=conversations&demo=1'
const form = (page: Page) => page.getByRole('form', { name: 'New conversation' })
const unanswered = 'Sophia doesn’t answer here yet: the question goes to the team.'

async function openForm(page: Page, url: string) {
  await page.goto(url)
  await page
    .getByRole('region', { name: 'All conversations' })
    .getByRole('button', { name: 'New conversation' })
    .click()
  return form(page)
}

test('ask off · the new conversation says Sophia doesn’t answer yet whenever Ask Sophia is checked', async ({
  page,
}) => {
  const f = await openForm(page, `${PAGE}&ask=off`)
  const ask = f.getByRole('checkbox', { name: 'Ask Sophia' })
  // The form asks Sophia by default (talk-store NO_WORDS): said before anything is pressed.
  await expect(ask).toBeChecked()
  await expect(f.getByText(unanswered)).toBeVisible()
  await expect(ask).toHaveAccessibleDescription(unanswered)
  await ask.uncheck()
  await expect(f.getByText(unanswered)).toHaveCount(0)
  await ask.check()
  await expect(f.getByText(unanswered)).toBeVisible()
})

test('ask off · where Sophia answers, the form says nothing more', async ({ page }) => {
  const f = await openForm(page, PAGE)
  await expect(f.getByRole('checkbox', { name: 'Ask Sophia' })).toBeChecked()
  await expect(f.getByText(unanswered)).toHaveCount(0)
})
