// Next up (docs/plans/next-up.md): once the viewer answers a decision, a line under the board's bar names what waits on
// them next and takes the focus, so the keyboard goes on; it never leaves the focus on the page's body.
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/work.html?viewer=davide&review=material'
const board = (page: Page) => page.locator('.board').first()
const line = (page: Page) => board(page).locator('.next-up')

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** Davide's decision answered from the keyboard: its first choice focused, Enter. */
async function answer(page: Page, url = PAGE) {
  await page.goto(url)
  const choice = board(page).locator('[data-decision] .plan-choice:not(:disabled)').first()
  await expect(choice).toBeVisible()
  await choice.focus()
  await page.keyboard.press('Enter')
}

test('next up · answered from the keyboard, the focus is on the line’s press, not on the page', async ({ page }) => {
  await answer(page)
  await expect(line(page)).toBeVisible()
  await expect(line(page).getByRole('button')).toBeFocused()
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
})

test('next up · it names the task that waits for the viewer, and Enter opens its sheet', async ({ page }) => {
  await answer(page)
  const press = line(page).getByRole('button')
  await expect(press).toHaveText(/^Next: “.+” waits for you/)
  const named = /“(.+)”/.exec((await press.textContent()) ?? '')?.[1] ?? ''
  expect(named).not.toBe('')
  // The line's words render before NextUp moves the focus to its press (the next animation frame): Enter goes once it has.
  await expect(press).toBeFocused()
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText(named.replace(/…$/, ''))
  await expect(line(page)).toHaveCount(0)
})

test('next up · the decisions’ pill closes the line', async ({ page }) => {
  await answer(page)
  await expect(line(page)).toBeVisible()
  await board(page).locator('.decision-pill').first().click()
  await expect(line(page)).toHaveCount(0)
})

test('next up · an answer not recorded (a conflict) moves nothing on: no line, the decision still the one to answer (Codex on #263)', async ({
  page,
}) => {
  await answer(page, `${PAGE}&conflict=1`)
  // The fixture says «conflict» after 300 ms; the line would have come at once before.
  await expect(board(page).locator('[data-decision]').first()).toContainText(/changed|conflict|not recorded|again/i)
  await expect(line(page)).toHaveCount(0)
})

test('next up · the review’s pill closes the line too (Codex on #263)', async ({ page }) => {
  await answer(page)
  await expect(line(page)).toBeVisible()
  await board(page).locator('.review-pill').click()
  await expect(line(page)).toHaveCount(0)
})

test('next up · focus moved to another decision during the write stays there (Codex P2 on #263)', async ({ page }) => {
  await page.goto(PAGE)
  await page.evaluate(() => window.workFixture?.decisionArrives?.('davide'))
  const decisions = board(page).locator('[data-decision]')
  await expect(decisions).toHaveCount(2)
  const first = decisions.nth(0).locator('.plan-choice:not(:disabled)').first()
  await first.focus()
  await page.keyboard.press('Enter')
  // While the answer is on its way (300 ms), the person moves on to the other decision.
  const other = decisions.nth(1).locator('.plan-choice:not(:disabled)').first()
  await other.focus()
  await expect(line(page)).toBeVisible()
  await expect(other).toBeFocused()
})

test('next up · answering the one it names, the line goes while the answer is on its way (Codex P2 on #263)', async ({
  page,
}) => {
  await page.goto(PAGE)
  await page.evaluate(() => window.workFixture?.decisionArrives?.('davide'))
  const decisions = board(page).locator('[data-decision]')
  await expect(decisions).toHaveCount(2)
  await decisions.nth(0).locator('.plan-choice:not(:disabled)').first().click()
  await expect(line(page)).toContainText('Next: decide')
  // The next one answered in the list itself: the line naming it goes at once, not after the write.
  await decisions.nth(1).locator('.plan-choice:not(:disabled)').first().click()
  await expect(line(page)).toHaveCount(0, { timeout: 250 })
  await expect(line(page)).toBeVisible()
  await expect(line(page)).not.toContainText('Next: decide')
})
