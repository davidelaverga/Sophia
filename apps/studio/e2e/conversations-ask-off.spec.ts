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

test('ask off · a reason the Studio doesn’t know yet says today’s words, never that she answers', async ({ page }) => {
  const f = await openForm(page, `${PAGE}&ask=some_new_reason`)
  await expect(f.getByText(unanswered)).toBeVisible()
  await expect(f.getByRole('checkbox', { name: 'Ask Sophia' })).toHaveAccessibleDescription(unanswered)
})

test('ask off · the allowance runs out mid-session: the blocked ask reads the list again, and the hint says why', async ({
  page,
}) => {
  await page.goto('/room.html?place=conversations&conversations=1&allowance=runsOut')
  const ask = open(page).getByRole('checkbox', { name: 'Ask Sophia' })
  const hint = open(page).locator('.conv-compose-hint')
  await ask.check()
  await expect(hint).toContainText('Sophia will answer')
  const field = open(page).getByRole('textbox', { name: 'Continue this question with the team' })
  await field.fill('Can we still ask her?')
  await field.press('Enter')
  await expect(open(page).getByText('Can we still ask her?')).toBeVisible()
  await ask.check()
  await expect(hint).toContainText(off)
  await expect(hint).not.toContainText('Sophia will answer')
})

test('ask off · the composer’s «Ask Sophia» is described by why she won’t answer, on a desktop and on a phone', async ({
  page,
}) => {
  const line = 'Sophia’s answers are off for this project now'
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${PAGE}&ask=calls_exhausted`)
  const ask = open(page).getByRole('checkbox', { name: 'Ask Sophia' })
  await ask.check()
  await expect(ask).toHaveAccessibleDescription(line)
  // Off, nothing is said of her: the message goes to the team only.
  await ask.uncheck()
  await expect(ask).toHaveAccessibleDescription('')
  // Where she answers, nothing more is said either.
  await page.goto(PAGE)
  await open(page).getByRole('checkbox', { name: 'Ask Sophia' }).check()
  await expect(open(page).getByRole('checkbox', { name: 'Ask Sophia' })).toHaveAccessibleDescription('')

  // A phone hides the hint's keys, not the reason: it is said there, and describes the checkbox.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${PAGE}&ask=calls_exhausted`)
  await page
    .getByRole('region', { name: 'All conversations' })
    .getByRole('button', { name: /Short or long briefs/ })
    .click()
  const phoneAsk = open(page).getByRole('checkbox', { name: 'Ask Sophia' })
  await phoneAsk.check()
  await expect(phoneAsk).toHaveAccessibleDescription(line)
  await expect(open(page).getByText(line)).toBeVisible()
  await expect(open(page).getByText('Enter sends · Shift+Enter, a new line')).toBeHidden()
})
