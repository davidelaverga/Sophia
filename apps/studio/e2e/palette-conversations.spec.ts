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
