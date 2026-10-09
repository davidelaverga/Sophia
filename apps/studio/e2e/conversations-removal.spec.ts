import { expect, test, type Page } from '@playwright/test'

// Removing a message and erasing a conversation (CON-01, A16; binding map §6): the fixture's own member is an admin,
// who removes any message and erases a conversation; an editor or a viewer withdraws only their own. What a
// withdrawal takes leaves the screen at once, whatever the reads after it do; a list holding only the newest says so
// (PR #199's review). Every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const rows = (page: Page) => list(page).getByRole('listitem').getByRole('button')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const messages = (page: Page) => open(page).locator('.conv-messages > li')
const context = (page: Page) => page.getByRole('complementary', { name: 'Project context' })
const erase = (page: Page) => context(page).getByRole('button', { name: 'Erase this conversation' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const written = async (page: Page, kind: string) => (await served(page)).filter((s) => s.startsWith(`${kind}:`))
const FIRST = 'What makes a report worth reading?'
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** The first conversation open, its context shown (a panel «Context» opens where it is one). */
async function opened(page: Page, query = '') {
  await page.goto(`${PAGE}${query}`)
  await expect(messages(page)).toHaveCount(6)
  const toggle = open(page).getByRole('button', { name: 'Context' })
  if (await toggle.isVisible()) await toggle.click()
}

test('removal · an admin removes another member’s message: it says so, and the focus lands there', async ({ page }) => {
  await opened(page)
  const message = messages(page).nth(3)
  await expect(message).toContainText('The short one still needs the March figures.')
  await message.hover()
  await message.getByRole('button', { name: 'Remove message' }).click()
  const confirm = page.getByRole('group', { name: 'Remove this message' })
  await confirm.getByRole('button', { name: 'Remove' }).click()
  await expect(message.getByText('This message was withdrawn.')).toBeFocused()
  await expect(message).not.toContainText('March figures')
  expect(await written(page, 'conversation-withdraw')).toHaveLength(1)
})

test('removal · Keep it and Esc keep the conversation, and give the focus back to Erase', async ({ page }) => {
  await opened(page)
  await erase(page).click()
  const confirm = page.getByRole('group', { name: 'Erase this conversation' })
  await expect(confirm.getByRole('button', { name: 'Erase' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(erase(page)).toBeFocused()
  await erase(page).click()
  await confirm.getByRole('button', { name: 'Keep it' }).click()
  await expect(erase(page)).toBeFocused()
  await expect(list(page)).toContainText(FIRST)
  expect(await written(page, 'conversation-erase')).toEqual([])
})

test('removal · erased, it leaves the list, the list says so, and the focus lands on the one open now', async ({
  page,
}) => {
  await opened(page)
  await erase(page).click()
  const confirm = page.getByRole('group', { name: 'Erase this conversation' })
  await expect(confirm).toContainText('Its title and every message leave it for everyone')
  await confirm.getByRole('button', { name: 'Erase' }).click()
  await expect(list(page)).not.toContainText(FIRST)
  await expect(list(page)).toContainText('The conversation was erased.')
  await expect(rows(page).first()).toBeFocused()
  await expect(rows(page).first()).toHaveAttribute('aria-pressed', 'true')
  await expect(open(page).getByRole('heading', { level: 3 })).not.toHaveText(FIRST)
  expect(await written(page, 'conversation-erase')).toHaveLength(1)
})

for (const role of ['editor', 'viewer']) {
  test(`removal · ${role}: withdraws only their own, removes and erases nothing`, async ({ page }) => {
    await opened(page, `&role=${role}`)
    await expect(open(page).getByRole('button', { name: 'Remove message' })).toHaveCount(0)
    await expect(open(page).getByRole('button', { name: 'Withdraw message' })).toHaveCount(2)
    await expect(erase(page)).toHaveCount(0)
  })
}

test('removal · withdrawn, with every read after it failing, neither its words nor Sophia’s answer to it stay', async ({
  page,
}) => {
  await opened(page, '&last=1&withdraw=thenFail')
  await field(page).fill('Is the short one ready to send?')
  await open(page).getByRole('button', { name: 'Send' }).click()
  const asked = messages(page).filter({ hasText: 'Is the short one ready to send?' })
  await expect(asked).toHaveCount(1)
  await expect(open(page)).not.toContainText('Sophia is answering…', { timeout: 10_000 })
  const reply = messages(page).last()
  await expect(reply).toHaveClass(/sophia/)
  const said = ((await reply.locator('.conv-msg-body').innerText()).split('\n')[0] ?? '').slice(0, 30)
  expect(said.length).toBeGreaterThan(10)
  await expect(list(page)).toContainText(said)
  await asked.hover()
  await asked.getByRole('button', { name: 'Withdraw message' }).click()
  await page.getByRole('group', { name: 'Withdraw this message' }).getByRole('button', { name: 'Withdraw' }).click()
  await expect(open(page)).not.toContainText('Is the short one ready to send?')
  await expect(open(page)).not.toContainText(said)
  await expect(list(page)).not.toContainText(said)
  await expect(list(page)).not.toContainText('Is the short one ready to send?')
  await expect(messages(page).last()).toContainText('This message was withdrawn.')
})

test('removal · a list holding only the newest conversations says so; a whole one says nothing', async ({ page }) => {
  await page.goto(`${PAGE}&more=1`)
  await expect(rows(page)).toHaveCount(3)
  await expect(list(page)).toContainText('Only the newest 3 conversations are listed here')
  await page.goto(PAGE)
  await expect(rows(page)).toHaveCount(3)
  await expect(list(page)).not.toContainText('Only the newest')
})

test('removal · a withdrawn message never heads a run: the one after it says who wrote it', async ({ page }) => {
  await opened(page)
  await open(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await field(page).fill('Agreed, tomorrow at ten.')
  await open(page).getByRole('button', { name: 'Send' }).click()
  const sent = messages(page).filter({ hasText: 'Agreed, tomorrow at ten.' })
  // A minute after your last message: it goes on from it, its byline said once above.
  await expect(sent).toHaveAttribute('data-run', 'on')
  const before = messages(page).filter({ hasText: 'Let’s look at it together tomorrow.' })
  await before.hover()
  await before.getByRole('button', { name: 'Withdraw message' }).click()
  await page.getByRole('group', { name: 'Withdraw this message' }).getByRole('button', { name: 'Withdraw' }).click()
  await expect(messages(page).filter({ hasText: 'This message was withdrawn.' })).toHaveCount(1)
  await expect(sent).not.toHaveAttribute('data-run', 'on')
})

for (const width of ['desktop', '@phone'] as const) {
  test(`removal · ${width}: when the feed takes the erased conversation before its reply, the focus lands on the list in sight (CX-0015)`, async ({
    page,
  }) => {
    await page.goto(`${PAGE}&erase=feedFirst`)
    if (width === '@phone') {
      // One screen at a time: the conversation, then its context over it.
      await rows(page).first().click()
      await expect(open(page)).toBeVisible()
    }
    await expect(messages(page)).toHaveCount(6)
    const toggle = open(page).getByRole('button', { name: 'Context' })
    if (await toggle.isVisible()) await toggle.click()
    await erase(page).click()
    await page.getByRole('group', { name: 'Erase this conversation' }).getByRole('button', { name: 'Erase' }).click()
    // The feed shows it gone 0.5 s on; its reply comes 2.5 s on.
    await expect(rows(page).first()).toBeVisible({ timeout: 2000 })
    await expect(rows(page).first()).toBeFocused({ timeout: 1500 })
    expect(await written(page, 'reply')).toEqual([])
    await expect.poll(() => written(page, 'reply'), { timeout: 5000 }).toEqual(['reply:erasure'])
    await expect(rows(page).first()).toBeFocused()
    await expect(list(page)).toContainText('The conversation was erased.')
    await expect(list(page)).not.toContainText(FIRST)
  })
}

test('removal · a writer whose only message is removed is named nowhere, whatever the reads after it do', async ({
  page,
}) => {
  await opened(page, '&withdraw=thenFail')
  await rows(page).nth(1).click()
  await expect(messages(page)).toHaveCount(2)
  const who = open(page).locator('.conv-head .conv-who')
  await expect(who).toContainText('Marco')
  const his = messages(page).filter({ hasText: 'One page. Anything longer, nobody reads.' })
  await his.hover()
  await his.getByRole('button', { name: 'Remove message' }).click()
  await page.getByRole('group', { name: 'Remove this message' }).getByRole('button', { name: 'Remove' }).click()
  await expect(messages(page).first()).toContainText('This message was withdrawn.')
  await expect(who).not.toContainText('Marco')
  await expect(who).toContainText('Lucía')
  await expect(rows(page).nth(1)).not.toContainText('Marco')
})
