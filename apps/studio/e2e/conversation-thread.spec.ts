import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// The open conversation as a conversation (docs/plans/conversation-thread.md, C1): faces, runs, Sophia's words on a
// quiet plane, the field in reach, «Ask Sophia» as a chip. On the fixture page; only the API is faked, and each check
// ends by asking the page whether anything reached for the API beyond what it answers.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const messages = (page: Page) => open(page).getByRole('listitem')
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })
const ask = (page: Page) => open(page).getByRole('checkbox', { name: 'Ask Sophia' })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** Sends a note to the team only (Sophia not asked), and waits for it in the thread. */
async function note(page: Page, text: string) {
  if (await ask(page).isChecked()) await ask(page).uncheck()
  await field(page).fill(text)
  await field(page).press('Enter')
  await expect(messages(page).filter({ hasText: text })).toHaveCount(1)
}

test('thread · a person is named once a run, in a bubble; Sophia has no bubble, her mark lit', async ({ page }) => {
  await page.goto(PAGE)
  const lucia = messages(page).filter({ hasText: 'And every claim keeps its source' })
  await expect(lucia.locator('.conv-msg-by')).toBeVisible()
  await expect(lucia.locator('.conv-msg-by')).toContainText('Lucía')
  const sophia = messages(page).filter({ hasText: 'I can keep both versions apart' })
  await expect(sophia.locator('.conv-glyph .umbral')).toBeVisible()
  const ground = (text: string) =>
    messages(page)
      .filter({ hasText: text })
      .locator('.conv-msg-body')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
  // People speak in bubbles; Sophia speaks in light: no bubble at all.
  expect(await ground('I can keep both versions apart')).toBe('rgba(0, 0, 0, 0)')
  expect(await ground('And every claim keeps its source')).not.toBe('rgba(0, 0, 0, 0)')
})

test('thread · a message that continues a run hides its byline from sight, not from a reader', async ({ page }) => {
  await page.goto(PAGE)
  // Your last message starts a run (Sophia wrote before it); a note a minute later goes on from it.
  await note(page, 'Goes on from mine.')
  const second = messages(page).filter({ hasText: 'Goes on from mine.' })
  await expect(second).toHaveAttribute('data-run', 'on')
  expect(await second.locator('.conv-msg-by').evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
  expect(await second.ariaSnapshot()).toContain('You')
  // Your byline is never drawn, so a teammate's shows what a run does: named at rest, unnamed once it goes on a run.
  const lucia = messages(page).filter({ hasText: 'The short one still needs the March figures.' })
  const by = lucia.locator('.conv-msg-by')
  expect(await by.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(1)
  await lucia.evaluate((el) => el.setAttribute('data-run', 'on'))
  expect(await by.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
})

test('thread · each time waits under the pointer; the day is said once', async ({ page }) => {
  await page.goto(PAGE)
  const lucia = messages(page).filter({ hasText: 'And every claim keeps its source' })
  const at = lucia.locator('.conv-msg-at')
  expect(await at.evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
  await lucia.locator('.conv-msg-body').hover()
  await expect.poll(() => at.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  // Every message in sight is of one day: one line names it, before the first.
  await expect(open(page).locator('.conv-day')).toHaveCount(1)
  await expect(messages(page).first().locator('.conv-day')).toHaveCount(1)
})

test('thread · the panes are told apart by tone, not lines; the field takes no handle', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await page.goto(PAGE)
  const width = (selector: string, side: string) =>
    page.locator(selector).evaluate((el, s) => getComputedStyle(el).getPropertyValue(`border-${s}-width`), side)
  expect(await width('.conv-list', 'right')).toBe('0px')
  expect(await width('.conv-context', 'left')).toBe('0px')
  expect(await field(page).evaluate((el) => getComputedStyle(el).resize)).toBe('none')
})

test('thread · «Ask Sophia» is a checkbox shown as a chip with her mark, pressed by its label', async ({ page }) => {
  await page.goto(PAGE)
  const chip = open(page).locator('label.conv-ask')
  await expect(chip.locator('.umbral')).toBeVisible()
  const box = await chip.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(28)
  await expect(ask(page)).toBeChecked()
  // On is said by more than a colour: a tick in its box (forced colours keep a border's shape).
  const tick = () => chip.locator('.conv-ask-box').evaluate((el) => getComputedStyle(el, '::after').content)
  expect(await tick()).not.toBe('none')
  await chip.click()
  await expect(ask(page)).not.toBeChecked()
  expect(await tick()).toBe('none')
})

test('thread · a new conversation’s «Ask Sophia» is the same chip, with her mark and its box', async ({ page }) => {
  await page.goto(PAGE)
  await page.getByRole('button', { name: 'New conversation' }).click()
  const chip = page.getByRole('form', { name: 'New conversation' }).locator('label.conv-ask')
  await expect(chip.locator('.umbral')).toBeVisible()
  await expect(chip.locator('.conv-ask-box')).toBeVisible()
  await expect(chip.getByRole('checkbox', { name: 'Ask Sophia' })).toBeChecked()
})

test('thread · what the conversation made opens from its head, before the messages', async ({ page }) => {
  await page.goto(PAGE)
  const made = open(page).locator('.conv-output')
  await expect(made).toBeVisible()
  const [m, first] = await Promise.all([made.boundingBox(), messages(page).first().boundingBox()])
  expect(m && first && m.y < first.y, 'what it made above the first message').toBe(true)
})

test('thread · every word reads at 4.5:1, on the app’s type sizes', async ({ page }) => {
  await page.goto(PAGE)
  await expect(messages(page).first()).toBeVisible()
  // A control that can't be used yet (Send, with nothing written) is exempt (WCAG 1.4.3).
  expect(await lowContrast(page, '.conv-open', '[aria-disabled="true"]')).toEqual([])
  const sizes = await typeSizes(page, '.conv-open')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px', '18px'], sizes.join(' ')).toContain(s)
})
