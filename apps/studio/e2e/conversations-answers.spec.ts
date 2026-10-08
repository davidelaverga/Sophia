import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// Conversations: Sophia answers for real (docs/plans/conversations-answers.md, C6). The three presses under the field
// are answered with what the conversation and the project hold, in Sophia's light text. On the fixture page; only the
// API is faked.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&demo=1'
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const lastSophia = (page: Page) => open(page).locator('.conv-messages > li.sophia').last()

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

async function ask(page: Page, conversation: string, press: string) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(PAGE)
  await page
    .getByRole('region', { name: 'All conversations' })
    .getByRole('button', { name: new RegExp(conversation) })
    .click()
  await expect(open(page).getByRole('heading', { name: conversation })).toBeVisible()
  const before = await open(page).locator('.conv-messages > li.sophia').count()
  await open(page).getByRole('group', { name: 'Ask Sophia in one press' }).getByRole('button', { name: press }).click()
  await expect(open(page).locator('.conv-messages > li.sophia')).toHaveCount(before + 1)
  return lastSophia(page)
}

test('answers · «Sum it up» says each person’s point, who said it, and what the project already decided', async ({
  page,
}) => {
  const answer = await ask(page, 'Short or long briefs?', 'Sum it up')
  await expect(answer.locator('.sophia-lead').first()).toHaveText('Where it stands:')
  const items = answer.locator('.sophia-list li')
  await expect(items).toHaveCount(2)
  await expect(items.nth(0).locator('.sophia-who')).toHaveText('Marco:')
  // The colon is text: copied, the line reads as it shows.
  await expect(items.nth(0)).toHaveText('Marco: One page. Anything longer, nobody reads.')
  await expect(items.nth(1).locator('.sophia-who')).toHaveText('Lucía:')
  await expect(answer).toContainText('Already decided on Oct 5: “Keep the brief to one page”')
  await expect(answer).toContainText('Nothing in this conversation is decided yet.')
  await expect(answer).not.toContainText('I’ll keep that with the question')
  // Its row says it in one line, without the marks her words are drawn with.
  const row = page.getByRole('region', { name: 'All conversations' }).locator('.conv-gist').first()
  await expect(row).toHaveText(/^Sophia: Where it stands: Marco: One page\./)
  await expect(row).not.toContainText(' - ')
})

test('answers · «What’s still open?» lists the project’s proposals waiting, not a question already answered', async ({
  page,
}) => {
  const answer = await ask(page, 'Who owns setup when an admin changes?', 'What’s still open?')
  await expect(answer.locator('.sophia-lead').first()).toHaveText('Still open:')
  await expect(answer.locator('.sophia-list')).toContainText('Map first, list second · proposed, not decided')
  // Asked, then answered by Sophia: no longer open.
  await expect(answer.locator('.sophia-list')).not.toContainText('Who picks up setup then?')
})

test('answers · asked twice, Sophia reads what members said, never the presses nor her own answers', async ({
  page,
}) => {
  await ask(page, 'Short or long briefs?', 'What did we decide?')
  await open(page)
    .getByRole('group', { name: 'Ask Sophia in one press' })
    .getByRole('button', { name: 'Sum it up' })
    .click()
  await expect(open(page).locator('.conv-messages > li.sophia')).toHaveCount(2)
  const answer = lastSophia(page)
  await expect(answer.locator('.sophia-list li')).toHaveCount(2)
  await expect(answer).not.toContainText('What did we decide?')
  // Her earlier answer named all five decisions: the summary names only those the members' words touch.
  await expect(answer).toContainText('“Keep the brief to one page”')
  await expect(answer).not.toContainText('“No payments in the first release”')
})

test('answers · «What did we decide?» lists the project’s accepted decisions with their days', async ({ page }) => {
  const answer = await ask(page, 'Short or long briefs?', 'What did we decide?')
  await expect(answer.locator('.sophia-lead').first()).toHaveText('Decided in this project:')
  await expect(answer.locator('.sophia-list li')).toHaveCount(5)
  await expect(answer.locator('.sophia-list')).toContainText('Keep the brief to one page · Oct 5')
  await expect(answer).toContainText('Nothing was decided in this conversation itself.')
})

test('answers · Sophia’s answer keeps to the app’s sizes and reads at 4.5:1; a member’s line stays as written', async ({
  page,
}) => {
  const answer = await ask(page, 'Short or long briefs?', 'Sum it up')
  expect(await lowContrast(page, '.conv-messages')).toEqual([])
  const sizes = await typeSizes(page, '.conv-messages')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px'], sizes.join(' ')).toContain(s)
  await expect(answer.locator('.sophia-list')).toBeVisible()
  // The press itself is a member's line: plain, never read as a list.
  await expect(open(page).locator('.conv-messages > li:not(.sophia)').last().locator('.sophia-list')).toHaveCount(0)
})
