// The next ask on Home and on a task's sheet (docs/plans/next-ask-places.md): the field's placeholder is the next ask,
// its key cap «Tab» while focused and empty; Tab puts it in, Esc puts it away.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

const line = (page: Page) => page.getByRole('textbox', { name: 'Say something to Sophia' })

// A session about to start (the `four` set's Standup, in 10 min): the one ask Home's line can help with.
const SOON = '/home.html?demo=1&projects=four'

test('next ask · Home: the line suggests getting ready for the session about to start; focused, Tab stands; Tab fills the line', async ({
  page,
}) => {
  await page.goto(SOON)
  await drawn(page, DRAWN.home)
  await expect(line(page)).toHaveAttribute('placeholder', /^Help me get ready for Standup in /)
  const suggested = (await line(page).getAttribute('placeholder')) ?? ''
  await line(page).focus()
  await expect(page.locator('.hw-say .next-ask kbd')).toHaveText('Tab')
  await page.keyboard.press('Tab')
  // The line takes the ask with its timing: what she reads when it is sent (Codex P2 on #268).
  await expect(line(page)).toHaveValue(`${suggested}. It starts in 10 min.`)
  await expect(line(page)).toBeFocused()
  await expect(page.locator('.hw-say .next-ask')).toHaveCount(0)
})

test('next ask · Home: a live room alone suggests nothing: the companion never sees the project (Codex P1 on #268)', async ({
  page,
}) => {
  await page.goto('/home.html?demo=1')
  await drawn(page, DRAWN.home)
  // The demo's room is live (Marco, Lucía and Sophia), with no session ahead: the line keeps its own words.
  await expect(page.locator('.hw-says')).toContainText('Marco, Lucía and Sophia')
  await expect(line(page)).toHaveAttribute('placeholder', 'Say something to Sophia')
  await line(page).focus()
  await expect(page.locator('.hw-say .next-ask')).toHaveCount(0)
})

test('next ask · Home: Esc puts the suggestion away for the visit', async ({ page }) => {
  await page.goto(SOON)
  await drawn(page, DRAWN.home)
  await line(page).focus()
  await page.keyboard.press('Escape')
  await expect(line(page)).toHaveAttribute('placeholder', 'Say something to Sophia')
  await expect(page.locator('.hw-say .next-ask')).toHaveCount(0)
})

test('next ask · Home: put away, it comes back on the next visit to Home (Codex on #268)', async ({ page }) => {
  await page.goto(`${SOON}&leave=1`)
  await drawn(page, DRAWN.home)
  const suggested = (await line(page).getAttribute('placeholder')) ?? ''
  expect(suggested).toMatch(/^Help me get ready for /)
  await line(page).focus()
  await page.keyboard.press('Escape')
  await expect(line(page)).toHaveAttribute('placeholder', 'Say something to Sophia')
  // Another place and back: Home stays mounted under a hidden place, and the visit is a new one.
  await page.getByRole('button', { name: 'Leave Home' }).click()
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(line(page)).toHaveAttribute('placeholder', suggested)
})

test('next ask · a task’s sheet: the field suggests the first question its state invites; Tab fills it', async ({
  page,
}) => {
  await page.goto('/work.html?viewer=davide')
  await page.locator('.task-tile').first().click()
  const field = page.getByRole('textbox', { name: 'Ask Sophia about this task' })
  await expect(field).toBeVisible()
  const first = (await page.locator('.ask-chips .ask-chip').first().textContent()) ?? ''
  expect(first).not.toBe('')
  await expect(field).toHaveAttribute('placeholder', first)
  await field.focus()
  await expect(page.locator('.act-guide .next-ask kbd')).toHaveText('Tab')
  await page.keyboard.press('Tab')
  await expect(field).toHaveValue(first)
})

test('next ask · a task’s sheet: Escape in its empty field puts the suggestion away and leaves the sheet open (Codex on #268)', async ({
  page,
}) => {
  await page.goto('/work.html?viewer=davide')
  await page.locator('.task-tile').first().click()
  const field = page.getByRole('textbox', { name: 'Ask Sophia about this task' })
  await expect(field).toBeVisible()
  const first = (await field.getAttribute('placeholder')) ?? ''
  await field.focus()
  await page.keyboard.press('Escape')
  await expect(page.locator('.task-sheet')).toBeVisible()
  await expect(field).not.toHaveAttribute('placeholder', first)
  // A second Escape, nothing left to put away, is the sheet's: it closes.
  await page.keyboard.press('Escape')
  await expect(page.locator('.task-sheet')).toHaveCount(0)
})

/** The words a field's description says, through its `aria-describedby`. */
const described = (field: ReturnType<Page['getByRole']>) =>
  field.evaluate((el) =>
    (el.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' '),
  )

test('next ask · both fields’ descriptions say why, for a screen reader (Codex P2 on #268)', async ({ page }) => {
  await page.goto(SOON)
  await drawn(page, DRAWN.home)
  await line(page).focus()
  expect(await described(line(page))).toContain('Because it starts in 10 min')
  await page.goto('/work.html?viewer=davide')
  await page.locator('.task-tile').first().click()
  const field = page.getByRole('textbox', { name: 'Ask Sophia about this task' })
  await field.focus()
  expect(await described(field)).toContain('The first question its state invites')
})
