// ⌘K opens a conversation by its title (docs/plans/palette-conversations.md): in Conversations, each conversation the
// list shows is a command, offered once what is typed names it. On the fixture page.
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/room.html?place=conversations&conversations=1'
const palette = (page: Page) => page.getByRole('dialog', { name: 'Commands' })
const field = (page: Page) => page.getByRole('combobox', { name: 'Command' })
const options = (page: Page) => palette(page).getByRole('option')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('palette · a conversation by its title: none when blank, found by its words, Enter opens it', async ({ page }) => {
  await page.goto(PAGE)
  await expect(open(page).getByRole('heading').first()).toHaveText('What makes a report worth reading?')
  await page.keyboard.press('Control+k')
  await expect(field(page)).toBeFocused()
  expect((await options(page).allInnerTexts()).join('\n')).not.toMatch(/Open conversation/)
  await field(page).fill('short brie')
  await expect(options(page).first()).toHaveText(/Open conversation: Short or long briefs\?/)
  await page.keyboard.press('Enter')
  await expect(palette(page)).toHaveCount(0)
  await expect(open(page).getByRole('heading').first()).toHaveText('Short or long briefs?')
})

const BRIEFS = '00000000-0000-4000-8000-0000000000c2'
const named = async (page: Page, words: string) => {
  await page.keyboard.press('Control+k')
  await field(page).fill(words)
  const texts = (await options(page).allInnerTexts()).join('\n')
  await page.keyboard.press('Escape')
  return texts
}

test('palette · fenced after a refusal of the list, it names no conversation', async ({ page }) => {
  await page.goto(PAGE)
  await expect(open(page).getByRole('heading').first()).toHaveText('What makes a report worth reading?')
  expect(await named(page, 'short brie')).toMatch(/Open conversation: Short or long briefs\?/)
  // The list's read fails as the feed moves, then is refused when tried again (context-fence's way there).
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate(() => window.fixture?.listMore(true))
  const list = page.getByRole('region', { name: 'All conversations' })
  await expect(list.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.evaluate(() => window.fixture?.failConversations(false))
  await page.evaluate(() => window.fixture?.refuseConversations(true))
  await list.getByRole('button', { name: 'Try again' }).click()
  await expect(list).toContainText('This project refused a read of its conversations.')
  expect(await named(page, 'short brie')).not.toMatch(/Open conversation/)
})

test('palette · a conversation erased elsewhere leaves the palette with the list', async ({ page }) => {
  await page.goto(PAGE)
  await expect(open(page).getByRole('heading').first()).toHaveText('What makes a report worth reading?')
  expect(await named(page, 'short brie')).toMatch(/Open conversation: Short or long briefs\?/)
  await page.evaluate((c) => window.fixture?.eraseElsewhere(c), BRIEFS)
  await expect(page.getByRole('region', { name: 'All conversations' })).not.toContainText('Short or long briefs?')
  expect(await named(page, 'short brie')).not.toMatch(/Open conversation/)
})
