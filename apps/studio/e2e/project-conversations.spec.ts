import { expect, test, type Page } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

// Several conversations, one project (docs/plans/project-conversations.md, Davide's chapter 2): the project's text
// conversations, each with its own history, and the project's context beside them. Behind the vision flag the fixture
// pages set; every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const rows = (page: Page) => list(page).getByRole('listitem').getByRole('button')
const titles = (page: Page) => rows(page).locator('.conv-title')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const context = (page: Page) => page.getByRole('complementary', { name: 'Project context' })
const messages = (page: Page) => open(page).getByRole('listitem')

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('conversations · the tab lists them newest first, with who wrote there and what is open', async ({ page }) => {
  await page.goto(PAGE)
  await expect(
    page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Conversations' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(titles(page)).toHaveText([
    'What makes a report worth reading?',
    'Short or long briefs?',
    'Test data for the first release',
  ])
  // Mine is «You»; Sophia only where she answered.
  // Named by its title; the rest describes it.
  await expect(rows(page).nth(0)).toHaveAccessibleName('What makes a report worth reading?')
  await expect(rows(page).nth(0)).toContainText('Lucía, You · Sophia')
  await expect(rows(page).nth(0)).toContainText('1 open question')
  await expect(rows(page).nth(1)).toContainText('Marco, Lucía')
  await expect(rows(page).nth(1)).not.toContainText('Sophia')
  await expect(rows(page).nth(1)).toContainText('No open questions')
  await expect(rows(page).nth(2)).toContainText('2 open questions')
})

test('conversations · the first is open; pressing another opens it, its summary and messages oldest first', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(rows(page).nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(open(page).getByRole('heading', { level: 3 })).toHaveText('What makes a report worth reading?')
  await expect(open(page)).toContainText('Contributors: Lucía, You · Sophia')
  await expect(open(page).getByRole('region', { name: 'Summary' })).toContainText('Compared a short brief')
  // A page: the newest six, oldest first.
  await expect(messages(page)).toHaveCount(6)
  await expect(messages(page).first()).toContainText('And every claim keeps its source, one click away.')
  await expect(messages(page).last()).toContainText('Let’s look at it together tomorrow.')
  await expect(messages(page).last()).toContainText('You')

  await rows(page).nth(1).click()
  await expect(rows(page).nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(rows(page).nth(0)).toHaveAttribute('aria-pressed', 'false')
  await expect(open(page).getByRole('heading', { level: 3 })).toHaveText('Short or long briefs?')
  await expect(messages(page)).toHaveCount(2)
  await expect(messages(page).nth(0)).toContainText('Marco')
  await expect(messages(page).nth(0)).toContainText('One page. Anything longer, nobody reads.')
  // With no summary yet, it says so.
  await rows(page).nth(2).click()
  await expect(open(page).getByRole('region', { name: 'Summary' })).toContainText('No summary yet.')
  await expect(messages(page).nth(1)).toContainText('Sophia')
})

test('conversations · Earlier messages reads the page before, kept above', async ({ page }) => {
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  await open(page).getByRole('button', { name: 'Earlier messages' }).click()
  await expect(messages(page)).toHaveCount(9)
  await expect(messages(page).first()).toContainText('Who reads the report first, and what do they need from it?')
  await expect(messages(page).last()).toContainText('Let’s look at it together tomorrow.')
  await expect(open(page).getByRole('button', { name: 'Earlier messages' })).toHaveCount(0)
  // The button went with the last page: the focus is on the first message, never the page.
  await expect(messages(page).first()).toBeFocused()
})

test('conversations · the one open stays open as another moves to the top', async ({ page }) => {
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  await page.evaluate(() => window.fixture?.conversationMoves())
  // Coming back to the tab reads the list again.
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(titles(page).first()).toHaveText('Short or long briefs?')
  await expect(open(page).getByRole('heading', { level: 3 })).toHaveText('What makes a report worth reading?')
  await expect(rows(page).nth(1)).toHaveAttribute('aria-pressed', 'true')
})

test('conversations · what a conversation made opens its report', async ({ page }) => {
  await page.goto(PAGE)
  await open(page)
    .getByRole('button', { name: /Fixture report/ })
    .click()
  await expect(page.getByRole('complementary', { name: 'Fixture report' })).toBeVisible()
})

test('conversations · the filter narrows by title, and says when nothing matches', async ({ page }) => {
  await page.goto(PAGE)
  const filter = list(page).getByRole('searchbox', { name: 'Filter conversations' })
  await filter.fill('brief')
  await expect(titles(page)).toHaveText(['Short or long briefs?'])
  // Every word, in any order.
  await filter.fill('briefs short')
  await expect(titles(page)).toHaveText(['Short or long briefs?'])
  // Every word, not any: two titles have one of these each, none has both.
  await filter.fill('short release')
  await expect(rows(page)).toHaveCount(0)
  await filter.fill('nothing like this')
  await expect(rows(page)).toHaveCount(0)
  await expect(list(page)).toContainText('No conversation’s title has «nothing like this».')
  await filter.fill('')
  await expect(rows(page)).toHaveCount(3)
})

test('conversations · Project context: the mission, three accepted decisions, then the rest, and what is open apart', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(context(page)).toContainText('Fixture direction')
  await expect(context(page)).toContainText('Reports the team can act on in one read.')
  const accepted = context(page).getByRole('region', { name: 'Accepted decisions' })
  await expect(accepted.getByRole('listitem')).toHaveText([
    'Keep the brief to one page',
    'Reports open on the answer',
    'No payments in the first release',
  ])
  await expect(accepted).toContainText('and 2 more')
  const still = context(page).getByRole('region', { name: 'Still open' })
  await expect(still).toContainText('Map first, list second')
  await expect(accepted).not.toContainText('Map first, list second')
  // A later read that fails keeps what was read, and says it may be out of date.
  await page.evaluate(() => {
    window.fixture?.failMission(true)
    window.fixture?.update()
  })
  await expect(context(page)).toContainText('This may be out of date.')
  await expect(accepted.getByRole('listitem')).toHaveCount(3)
  await page.evaluate(() => window.fixture?.failMission(false))
  await context(page).getByRole('button', { name: 'Try again' }).click()
  await expect(context(page)).not.toContainText('This may be out of date.')
  // The same for every conversation.
  await rows(page).nth(2).click()
  await expect(accepted.getByRole('listitem')).toHaveCount(3)
})

test('conversations · a list that fails says so, with Try again; a conversation that fails leaves the list', async ({
  page,
}) => {
  await page.goto(PAGE.replace('conversations=1', 'conversations=fail'))
  await expect(list(page)).toContainText('The conversations can’t be read now.')
  await page.evaluate(() => window.fixture?.failConversations(false))
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await expect(rows(page)).toHaveCount(3)

  await page.goto(`${PAGE}&messages=fail`)
  await rows(page).nth(1).click()
  await expect(open(page)).toContainText('This conversation can’t be read now.')
  await expect(rows(page)).toHaveCount(3)
  await expect(context(page).getByRole('region', { name: 'Accepted decisions' })).toBeVisible()
})

test('conversations · none yet says so', async ({ page }) => {
  await page.goto(PAGE.replace('conversations=1', 'conversations=none'))
  await expect(list(page)).toContainText('No conversations in this project yet.')
  await expect(open(page)).toHaveCount(0)
  await expect(context(page)).toContainText('Fixture direction')
})

test('conversations · controls are at least 24 px tall, and the text keeps to the work views’ scale', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  const short = await page
    .locator('.conversations button:visible, .conversations input:visible')
    .evaluateAll((all) =>
      all
        .map((el) => ({ name: el.textContent.trim().slice(0, 20), h: el.getBoundingClientRect().height }))
        .filter((c) => c.h < 23.5),
    )
  expect(short).toEqual([])
  const sizes = await typeSizes(page, '.conversations')
  expect(
    sizes.filter((s) => !['10.5px', '12px', '13px', '14px', '18px'].includes(s)),
    sizes.join(' '),
  ).toEqual([])
})

test('conversations · on a phone, nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide).toBeLessThanOrEqual(0)
})
