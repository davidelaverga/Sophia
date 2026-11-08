import { expect, test, type Page } from '@playwright/test'

// Ask off (CON-01 C1): while Sophia doesn't answer here, the form for a new conversation says so before Start, as the
// open conversation's composer does, and «Ask Sophia» stays a checkbox that records the request. Each says why, from
// the list's `askReason` (docs/plans/conversation-ask-reason.md): «yet» only where it is true.

const PAGE = '/room.html?place=conversations&demo=1'
const form = (page: Page) => page.getByRole('form', { name: 'New conversation' })
const unanswered = 'Sophia doesn’t answer here yet: the question goes to the team.'
const off = 'Sophia’s answers are off for this project now'
const away = 'Sophia can’t be reached right now'
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })

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

test('ask off · where the allowance ran out, the composer and the form say her answers are off, never «yet»', async ({
  page,
}) => {
  await page.goto(`${PAGE}&ask=calls_exhausted`)
  const ask = open(page).getByRole('checkbox', { name: 'Ask Sophia' })
  await ask.check()
  const hint = open(page).locator('.conv-compose-hint')
  await expect(hint).toContainText(off)
  await expect(hint).not.toContainText('yet')
  const f = await openForm(page, `${PAGE}&ask=calls_exhausted`)
  const line = `${off}: the question goes to the team.`
  await expect(f.getByText(line)).toBeVisible()
  await expect(f.getByRole('checkbox', { name: 'Ask Sophia' })).toHaveAccessibleDescription(line)
  await expect(f.getByText(unanswered)).toHaveCount(0)
})

test('ask off · where her runtime is away, the form says she can’t be reached right now', async ({ page }) => {
  const f = await openForm(page, `${PAGE}&ask=runtime_unavailable`)
  await expect(f.getByText(`${away}: the question goes to the team.`)).toBeVisible()
  await expect(f.getByText(unanswered)).toHaveCount(0)
})
