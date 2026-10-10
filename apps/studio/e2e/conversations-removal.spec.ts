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
const C1 = '00000000-0000-4000-8000-0000000000c1'
const C2 = '00000000-0000-4000-8000-0000000000c2'
/** What the view keeps for this project and account (talk-store.ts), as the fixture page reads it. */
const kept = (page: Page) => page.evaluate(() => window.fixture?.kept())
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

/**
 * The erased conversation read only before the page could know it was gone, and refused as not found (as 0048 hides
 * it): as the feed moves, the open thread is read again with the list. Once the list shows it gone, never again.
 */
async function noReadOnceGone(page: Page) {
  const refused = (await written(page, 'messages-gone')).length
  // Its read again as the feed moved, and that read's one retry at most.
  expect(refused).toBeLessThanOrEqual(2)
  await page.waitForTimeout(1000)
  expect(await written(page, 'messages-gone')).toHaveLength(refused)
}

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
    await noReadOnceGone(page)
    // The row it landed on, pressed: on a phone the list goes, and the conversation's title has the focus, not the
    // page (Codex, A24); beside the list, the row keeps it.
    await page.keyboard.press('Enter')
    await expect(open(page).getByRole('heading', { level: 3 })).toBeVisible()
    await expect(width === '@phone' ? open(page).getByRole('heading', { level: 3 }) : rows(page).first()).toBeFocused()
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

for (const width of ['desktop', '@phone'] as const) {
  test(`removal · ${width}: an erasure's late reply leaves where you went since, your focus and your draft`, async ({
    page,
  }) => {
    await page.goto(`${PAGE}&erase=feedFirst`)
    if (width === '@phone') await rows(page).first().click()
    await expect(messages(page)).toHaveCount(6)
    const toggle = open(page).getByRole('button', { name: 'Context' })
    if (await toggle.isVisible()) await toggle.click()
    await erase(page).click()
    await page.getByRole('group', { name: 'Erase this conversation' }).getByRole('button', { name: 'Erase' }).click()
    // The feed shows it gone first (0.5 s); then you open the conversation still there and write, before its reply.
    await expect(rows(page).first()).toBeFocused({ timeout: 1500 })
    await rows(page).first().click()
    await field(page).fill('Draft after the erasure.')
    expect(await written(page, 'reply')).toEqual([])
    await expect.poll(() => written(page, 'reply'), { timeout: 5000 }).toEqual(['reply:erasure'])
    await page.waitForTimeout(300)
    await expect(field(page)).toBeVisible()
    await expect(field(page)).toBeFocused()
    await expect(field(page)).toHaveValue('Draft after the erasure.')
    // Nowhere on the page (on a phone the list is out of sight while a conversation is open).
    await expect(page.getByText('The conversation was erased.')).toHaveCount(0)
    await noReadOnceGone(page)
  })
}

test('removal · an erasure with no reply is sent again under its key, after another conversation was opened', async ({
  page,
}) => {
  await opened(page, '&erase=unreached')
  await erase(page).click()
  const confirm = page.getByRole('group', { name: 'Erase this conversation' })
  await confirm.getByRole('button', { name: 'Erase' }).click()
  await expect(confirm).toContainText('Not confirmed')
  // Away to another conversation and back: the intent waits with the view, not with the part that pressed it.
  await rows(page).nth(1).click()
  await expect(messages(page)).toHaveCount(2)
  await rows(page).first().click()
  await expect(messages(page)).toHaveCount(6)
  const toggle = open(page).getByRole('button', { name: 'Context' })
  if (await toggle.isVisible()) await toggle.click()
  await erase(page).click()
  await expect(confirm).toContainText('Not confirmed')
  await confirm.getByRole('button', { name: 'Erase' }).click()
  await expect(list(page)).not.toContainText(FIRST)
  const keys = await written(page, 'erase-key')
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
})

test('removal · an erasure whose reply is lost, out of a list of the newest only: read directly, its not found says it', async ({
  page,
}) => {
  // A list holding the newest only proves nothing by leaving one out (it may be older); the conversation read directly
  // does: the API refuses an erased one as not found (422), and that alone settles it (probes.ts). Older, or a read that
  // fails otherwise, it is kept and nothing is said (the cases after this one).
  await opened(page, '&erase=lost&more=1')
  await erase(page).click()
  await page.getByRole('group', { name: 'Erase this conversation' }).getByRole('button', { name: 'Erase' }).click()
  await expect(list(page)).not.toContainText(FIRST)
  await expect(rows(page).first()).toBeFocused()
  // The proof first: its direct read, refused as not found; only then is it said.
  await expect.poll(() => written(page, 'messages-gone')).toContain('messages-gone:c1')
  await expect(list(page).getByRole('status').filter({ hasText: 'The conversation was erased.' })).toBeVisible()
  expect((await kept(page))?.erased[C1]).toBe(true)
  expect((await kept(page))?.erasures[C1]).toBeUndefined()
})

test('removal · an erasure with no reply, its conversation pushed past the list’s newest: kept, its draft too, and sent again under its key', async ({
  page,
}) => {
  // PR #199 r4235299406, CON-01-CX-0018: newer activity, not the erasure, takes it out of a list of the newest only.
  await page.goto(`${PAGE}&erase=unreached`)
  await expect(messages(page)).toHaveCount(6)
  await field(page).fill('SYNTHETIC-CAP-DRAFT-MUST-SURVIVE')
  const toggle = open(page).getByRole('button', { name: 'Context' })
  if (await toggle.isVisible()) await toggle.click()
  await erase(page).click()
  const confirm = page.getByRole('group', { name: 'Erase this conversation' })
  await confirm.getByRole('button', { name: 'Erase' }).click()
  await expect(confirm).toContainText('Not confirmed')
  await page.evaluate((id) => window.fixture?.capPast(id), C1)
  await expect(list(page)).not.toContainText(FIRST)
  await expect(rows(page).first()).toBeFocused()
  await page.waitForTimeout(1000)
  await expect(page.getByText('The conversation was erased.')).toHaveCount(0)
  // Back among the newest: its draft as it was, and its erasure still held under the same key.
  await page.evaluate(() => window.fixture?.capPast(null))
  await rows(page).filter({ hasText: FIRST }).click()
  await expect(field(page)).toHaveValue('SYNTHETIC-CAP-DRAFT-MUST-SURVIVE')
  if (await toggle.isVisible()) await toggle.click()
  await erase(page).click()
  await expect(confirm).toContainText('Not confirmed')
  await confirm.getByRole('button', { name: 'Erase' }).click()
  await expect(list(page)).not.toContainText(FIRST)
  const keys = await written(page, 'erase-key')
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
})

test('removal · a removal with no reply is sent again under its key, after another conversation was opened', async ({
  page,
}) => {
  // PR #199 r4235397321: the intent is kept by the view, not by the message's part, which goes with the conversation.
  await opened(page, '&withdraw=unreached')
  const message = messages(page).nth(3)
  await message.hover()
  await message.getByRole('button', { name: 'Remove message' }).click()
  const confirm = page.getByRole('group', { name: 'Remove this message' })
  await confirm.getByRole('button', { name: 'Remove' }).click()
  await expect(confirm).toContainText('Not confirmed')
  await rows(page).nth(1).click()
  await expect(messages(page)).toHaveCount(2)
  await rows(page).first().click()
  await expect(messages(page)).toHaveCount(6)
  const again = messages(page).nth(3)
  await again.hover()
  await again.getByRole('button', { name: 'Remove message' }).click()
  await expect(confirm).toContainText('Not confirmed')
  await confirm.getByRole('button', { name: 'Remove' }).click()
  await expect(again.getByText('This message was withdrawn.')).toBeVisible()
  const keys = await written(page, 'withdraw-key')
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
  expect(await written(page, 'conversation-withdraw')).toHaveLength(1)
})

test('removal · erased while a message’s proposal is on its way: nothing of it is kept, its late reply included', async ({
  page,
}) => {
  // PR #199 r4235397318: a message's proposal (its words and key) goes with its conversation, and stays gone.
  await page.goto(`${PAGE}&propose=slow`)
  await expect(messages(page)).toHaveCount(6)
  const message = messages(page).nth(3)
  await message.hover()
  await message.getByRole('button', { name: 'Propose as decision' }).click()
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect.poll(async () => Object.keys((await kept(page))?.proposals ?? {}).length).toBe(1)
  const [id = ''] = Object.keys((await kept(page))?.proposals ?? {})
  const toggle = open(page).getByRole('button', { name: 'Context' })
  if (await toggle.isVisible()) await toggle.click()
  await erase(page).click()
  await page.getByRole('group', { name: 'Erase this conversation' }).getByRole('button', { name: 'Erase' }).click()
  await expect(list(page)).not.toContainText(FIRST)
  // The proposal's reply comes 3 s after it went: it brings nothing back.
  await expect.poll(async () => (await page.evaluate(() => window.fixture?.missionWrites ?? [])).length).toBe(1)
  await page.waitForTimeout(3500)
  const after = await kept(page)
  expect([after?.proposals[id], after?.proposed[id], after?.proposalRefusals[id]]).toEqual([
    undefined,
    undefined,
    undefined,
  ])
  expect(after?.gone[id]).toBe(true)
})

test('removal · erased elsewhere while the list holds the newest only: read directly, its not found lets its part go', async ({
  page,
}) => {
  // PR #199 r4235397313, r4235629899: a project past the newest may never be listed whole. Left out of a list of the
  // newest, a conversation something is kept for is read directly; the API refuses an erased one as not found.
  await page.goto(`${PAGE}&more=1`)
  await expect(messages(page)).toHaveCount(6)
  await field(page).fill('SYNTHETIC-DRAFT-ERASED-ELSEWHERE')
  await rows(page).nth(1).click()
  await expect(messages(page)).toHaveCount(2)
  await page.evaluate((c) => window.fixture?.eraseElsewhere(c), C1)
  await expect(list(page)).not.toContainText(FIRST)
  await expect.poll(async () => (await kept(page))?.drafts[C1]).toBeUndefined()
  expect((await kept(page))?.erased[C1]).toBe(true)
  expect(await written(page, 'messages-gone')).toEqual(['messages-gone:c1'])
  // Erased by someone else: nothing here says it was erased here.
  await expect(page.getByText('The conversation was erased.')).toHaveCount(0)
  await expect(messages(page)).toHaveCount(2)
})

test('removal · erased elsewhere while open, the list’s reads failing: its own read’s not found takes it away at once', async ({
  page,
}) => {
  // PR #199 r4238633930: a read of the conversation itself answering not found is as sure as a whole list without it;
  // what it read before (the cache keeps it across a failed read) is never shown again, whatever the list's reads do.
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  await expect(open(page).getByRole('heading', { name: FIRST })).toHaveCount(1)
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate((c) => window.fixture?.eraseElsewhere(c), C1)
  await expect.poll(async () => (await served(page)).includes('messages-gone:c1')).toBe(true)
  await expect.poll(async () => (await kept(page))?.erased[C1]).toBe(true)
  await expect(list(page)).not.toContainText(FIRST)
  await expect(open(page).getByRole('heading', { name: FIRST })).toHaveCount(0)
  await expect(page.getByText('The conversation was erased.')).toHaveCount(0)
})

test('removal · older, then erased elsewhere with the list unchanged: read again on its own clock, its part goes then', async ({
  page,
}) => {
  // Codex's countercase: left out of the newest while it still exists (read: kept), then erased while every list read
  // is the same; no list change comes, so the reads again come on their own clock (30 s, then longer).
  await page.clock.install()
  await page.goto(`${PAGE}&more=1`)
  await expect(messages(page)).toHaveCount(6)
  await field(page).fill('SYNTHETIC-DRAFT-OLDER-THEN-ERASED')
  await rows(page).nth(1).click()
  await expect(messages(page)).toHaveCount(2)
  await page.evaluate((c) => window.fixture?.capPast(c), C1)
  await expect(list(page)).not.toContainText(FIRST)
  // Read directly: it is there, only older; what is kept for it stays.
  await expect
    .poll(async () => (await served(page)).filter((s) => s.startsWith('messages:c1')).length)
    .toBeGreaterThan(0)
  expect((await kept(page))?.drafts[C1]).toBe('SYNTHETIC-DRAFT-OLDER-THEN-ERASED')
  // A read that fails proves nothing either.
  await page.evaluate((c) => window.fixture?.failConversationReads(c), C1)
  await page.clock.fastForward(31_000)
  await page.waitForTimeout(500)
  expect((await kept(page))?.drafts[C1]).toBe('SYNTHETIC-DRAFT-OLDER-THEN-ERASED')
  await page.evaluate(() => window.fixture?.failConversationReads(null))
  // Erased elsewhere; the list it reads is the same as before.
  await page.evaluate((c) => window.fixture?.eraseElsewhere(c), C1)
  await page.clock.fastForward(61_000)
  await expect.poll(async () => (await kept(page))?.drafts[C1]).toBeUndefined()
  expect((await kept(page))?.erased[C1]).toBe(true)
  await expect(page.getByText('The conversation was erased.')).toHaveCount(0)
})

for (const send of ['lostSlow', 'slow'] as const) {
  test(`removal · erased while a message is on its way (${send === 'slow' ? 'its receipt' : 'no reply'} after): it keeps nothing, another’s draft stays`, async ({
    page,
  }) => {
    // Codex on a3422f4: a late answer to a send (no reply, or its receipt) writes nothing back for an erased conversation.
    await page.goto(`${PAGE}&send=${send}`)
    await expect(messages(page)).toHaveCount(6)
    await rows(page).nth(1).click()
    await expect(messages(page)).toHaveCount(2)
    await field(page).fill('SYNTHETIC-OTHER-DRAFT-STAYS')
    await rows(page).first().click()
    await expect(messages(page)).toHaveCount(6)
    await field(page).fill('SYNTHETIC-ERASED-SEND-WORDS')
    await open(page).getByRole('button', { name: 'Send' }).click()
    // On its way (1.5 s): the conversation is erased meanwhile.
    const toggle = open(page).getByRole('button', { name: 'Context' })
    if (await toggle.isVisible()) await toggle.click()
    await erase(page).click()
    await page.getByRole('group', { name: 'Erase this conversation' }).getByRole('button', { name: 'Erase' }).click()
    await expect(list(page)).not.toContainText(FIRST)
    await page.waitForTimeout(2500)
    const after = await kept(page)
    expect([after?.holds[C1], after?.drafts[C1], after?.refusals[C1], after?.asked[C1]]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
    expect(await page.evaluate((c) => window.fixture?.cachedMessages(c), C1)).toBe(false)
    expect(after?.drafts[C2]).toBe('SYNTHETIC-OTHER-DRAFT-STAYS')
    await expect(page.getByText('SYNTHETIC-ERASED-SEND-WORDS')).toHaveCount(0)
  })
}

test('removal · withdrawn while its send’s receipt is on its way, every read after failing: its words come back nowhere', async ({
  page,
}) => {
  // Codex, CX-0022 (actual app at 89eb193): the late receipt put the withdrawn words back in the list's row.
  await page.goto(`${PAGE}&send=late&last=1`)
  await expect(messages(page)).toHaveCount(6)
  const ask = open(page)
    .locator('.conv-compose')
    .getByRole('checkbox', { name: /Ask Sophia/ })
  if (await ask.isChecked()) await ask.uncheck()
  await field(page).fill('SYNTHETIC-WITHDRAWN-LATE-SEND-MUST-NOT-RETURN')
  await open(page).getByRole('button', { name: 'Send' }).click()
  // The feed shows it landed; its receipt comes 4 s on. Withdrawn meanwhile.
  const mine = messages(page).filter({ hasText: 'SYNTHETIC-WITHDRAWN-LATE-SEND-MUST-NOT-RETURN' })
  await expect(mine).toHaveCount(1)
  await mine.hover()
  await mine.getByRole('button', { name: 'Withdraw message' }).click()
  await page.getByRole('group', { name: 'Withdraw this message' }).getByRole('button', { name: 'Withdraw' }).click()
  await expect(messages(page).getByText('This message was withdrawn.')).toHaveCount(1)
  // Every read after it fails; then the old receipt comes.
  await page.evaluate((c) => window.fixture?.failConversationReads(c), C1)
  // The withdrawal's own receipt came before (reply:withdrawal); the send's receipt is the one waited for.
  await expect.poll(async () => (await written(page, 'reply')).includes('reply:message'), { timeout: 6000 }).toBe(true)
  await page.waitForTimeout(500)
  await expect(page.getByText('SYNTHETIC-WITHDRAWN-LATE-SEND-MUST-NOT-RETURN')).toHaveCount(0)
  await expect(messages(page).getByText('This message was withdrawn.')).toHaveCount(1)
})

test('removal · withdrawn elsewhere after a late send, the list read since: the receipt never brings its words back', async ({
  page,
}) => {
  // Codex, CX-0027 (actual app at 715d2b1): the thread's reads fail, the list's answer after the withdrawal, then the
  // send's receipt comes. The row's last activity is the message's own time: the list read knew of it.
  const WORDS = 'SYNTHETIC-WITHDRAWN-ELSEWHERE-LATE-SEND'
  await page.goto(`${PAGE}&send=late&last=1`)
  await expect(messages(page)).toHaveCount(6)
  const ask = open(page)
    .locator('.conv-compose')
    .getByRole('checkbox', { name: /Ask Sophia/ })
  if (await ask.isChecked()) await ask.uncheck()
  await field(page).fill(WORDS)
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(list(page)).toContainText(WORDS)
  await page.evaluate((c) => window.fixture?.failMessageReads(c), C1)
  await page.evaluate(([c, w]) => window.fixture?.withdrawElsewhere(c, w), [C1, WORDS] as const)
  await expect(list(page)).not.toContainText(WORDS)
  // Then the list's reads fail too, and the send's receipt comes.
  await page.evaluate((c) => window.fixture?.failConversationReads(c), C1)
  await expect.poll(async () => (await written(page, 'reply')).includes('reply:message'), { timeout: 6000 }).toBe(true)
  await page.waitForTimeout(500)
  await expect(list(page)).not.toContainText(WORDS)
})

test('removal · withdrawn elsewhere while the list’s reads fail: the thread’s own read takes its words off the row', async ({
  page,
}) => {
  // Codex's CX-0027 recovery: a row still saying a message the thread now reads withdrawn says nothing of it.
  const WORDS = 'SYNTHETIC-TOMBSTONE-OFF-THE-ROW'
  await page.goto(`${PAGE}&last=1`)
  await expect(messages(page)).toHaveCount(6)
  const ask = open(page)
    .locator('.conv-compose')
    .getByRole('checkbox', { name: /Ask Sophia/ })
  if (await ask.isChecked()) await ask.uncheck()
  await field(page).fill(WORDS)
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(list(page)).toContainText(WORDS)
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate(([c, w]) => window.fixture?.withdrawElsewhere(c, w), [C1, WORDS] as const)
  await expect(messages(page).getByText('This message was withdrawn.')).toHaveCount(1)
  await expect(list(page)).not.toContainText(WORDS)
})

/** Sends these words in the first conversation, Sophia not asked, and waits for its row to say them. */
async function sendSaid(page: Page, words: string) {
  await page.goto(`${PAGE}&last=1`)
  await expect(messages(page)).toHaveCount(6)
  const ask = open(page)
    .locator('.conv-compose')
    .getByRole('checkbox', { name: /Ask Sophia/ })
  if (await ask.isChecked()) await ask.uncheck()
  await field(page).fill(words)
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(list(page)).toContainText(words)
}

test('removal · a list read under way across a withdrawal elsewhere, answering after the thread’s: its words stay off the row', async ({
  page,
}) => {
  // Codex at 7969d40 (the actual app): the list's answer, as it was before the withdrawal, came after the thread's
  // read had taken the words off the row, and said them again.
  const WORDS = 'SYNTHETIC-LATE-LIST-GET-WITHDRAWN'
  await sendSaid(page, WORDS)
  // From now the list's reads wait; one sets out (the feed moves) and holds the words.
  await page.evaluate(() => window.fixture?.holdListReads())
  const before = (await written(page, 'conversations')).length
  await page.evaluate(() => window.fixture?.listMore(false))
  await expect.poll(async () => (await written(page, 'conversations')).length).toBeGreaterThan(before)
  // Withdrawn elsewhere, the feed held up: the thread learns it when read again (another one opened, then this one).
  await page.evaluate(([c, w]) => window.fixture?.withdrawQuietly(c, w), [C1, WORDS] as const)
  await rows(page).nth(1).click()
  await rows(page).filter({ hasText: FIRST }).click()
  await expect(messages(page).getByText('This message was withdrawn.')).toHaveCount(1)
  await expect(list(page)).not.toContainText(WORDS)
  // The list's read from before answers now, with the words.
  await page.evaluate(() => window.fixture?.releaseListReads())
  await page.waitForTimeout(500)
  await expect(list(page)).not.toContainText(WORDS)
  await expect(page.getByText(WORDS)).toHaveCount(0)
  // What the pages read still show stays: you wrote other words there, and Sophia answered (r4236040713's positive).
  await expect(rows(page).filter({ hasText: FIRST })).toContainText('Lucía, You · Sophia')
})

test('removal · the thread read again while the list’s reads still fail: the list still says it may be out of date', async ({
  page,
}) => {
  // Codex at 7969d40 (the actual app): the thread's Try again, the list's read still failing, took the list's notice
  // away (its read was marked answered by what the thread wrote into it).
  const WORDS = 'SYNTHETIC-LIST-STILL-FAILING'
  await sendSaid(page, WORDS)
  await page.evaluate((c) => window.fixture?.failConversationReads(c), C1)
  await page.evaluate(() => window.fixture?.listMore(false))
  await expect(list(page).getByText('This may be out of date.')).toBeVisible()
  await expect(open(page).getByText('This may be out of date.')).toBeVisible()
  // Withdrawn elsewhere meanwhile; the thread's reads answer again, the list's still fail.
  await page.evaluate(([c, w]) => window.fixture?.withdrawQuietly(c, w), [C1, WORDS] as const)
  await page.evaluate(() => window.fixture?.failMessageReads(null))
  await open(page).getByRole('button', { name: 'Try again' }).click()
  await expect(messages(page).getByText('This message was withdrawn.')).toHaveCount(1)
  await expect(open(page).getByText('This may be out of date.')).toHaveCount(0)
  await page.waitForTimeout(500)
  await expect(list(page).getByText('This may be out of date.')).toBeVisible()
  await expect(list(page)).not.toContainText(WORDS)
})

test('removal · a message confirmed while the list’s reads fail: its row says it, and the list still says it may be out of date', async ({
  page,
}) => {
  // PR #199 r4237298620: the send's receipt was written into the list as an answered read, and the list's notice went.
  const WORDS = 'SYNTHETIC-SENT-WHILE-THE-LIST-FAILS'
  await page.goto(`${PAGE}&last=1`)
  await expect(messages(page)).toHaveCount(6)
  const ask = open(page)
    .locator('.conv-compose')
    .getByRole('checkbox', { name: /Ask Sophia/ })
  if (await ask.isChecked()) await ask.uncheck()
  // The list's read fails (the feed moves); then the next one waits, so its own answer can't say anything meanwhile.
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate(() => window.fixture?.listMore(false))
  await expect(list(page).getByText('This may be out of date.')).toBeVisible()
  await page.evaluate(() => window.fixture?.failConversations(false))
  await page.evaluate(() => window.fixture?.holdListReads())
  await field(page).fill(WORDS)
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(messages(page).filter({ hasText: WORDS })).toHaveCount(1)
  await expect(list(page)).toContainText(WORDS)
  await page.waitForTimeout(500)
  await expect(list(page).getByText('This may be out of date.')).toBeVisible()
  await page.evaluate(() => window.fixture?.releaseListReads())
})

/** Sends a message timed in the same millisecond as the conversation's last, every list read failing meanwhile. */
async function sendSameMillisecond(page: Page, words: string, query: string) {
  await page.goto(`${PAGE}&last=1${query}`)
  await expect(messages(page)).toHaveCount(6)
  const before = (await rows(page).first().textContent()) ?? ''
  const ask = open(page)
    .locator('.conv-compose')
    .getByRole('checkbox', { name: /Ask Sophia/ })
  if (await ask.isChecked()) await ask.uncheck()
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate(() => window.fixture?.sameTimeNext())
  await field(page).fill(words)
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(messages(page).filter({ hasText: words })).toHaveCount(1)
  return before
}

test('removal · a message in the same millisecond as the last, the list’s reads failing: its place puts it on the row at once', async ({
  page,
}) => {
  // PR #199 r4235629903, CON-01-CC-0023: the row says its order (messageSeq), so a list read before the second message
  // is told from one after it, whatever their times.
  const WORDS = 'SYNTHETIC-SAME-MILLISECOND-PLACED'
  await sendSameMillisecond(page, WORDS, '')
  await expect(list(page)).toContainText(WORDS)
})

test('removal · the same, from an API that says no order: the row lags, never wrong, then catches up', async ({
  page,
}) => {
  // An older API (no messageSeq, no lastMessage.seq): equal times keep the row until the list is read again.
  const WORDS = 'SYNTHETIC-SAME-MILLISECOND-UNPLACED'
  const before = await sendSameMillisecond(page, WORDS, '&order=none')
  await page.waitForTimeout(500)
  await expect(list(page)).not.toContainText(WORDS)
  expect(await rows(page).first().textContent()).toBe(before)
  await page.evaluate(() => window.fixture?.failConversations(false))
  await page.evaluate(() => window.fixture?.listMore(false))
  await expect(list(page)).toContainText(WORDS)
})

test('removal · an erasure whose reply is lost is said when the feed shows it gone', async ({ page }) => {
  await opened(page, '&erase=lost')
  await erase(page).click()
  await page.getByRole('group', { name: 'Erase this conversation' }).getByRole('button', { name: 'Erase' }).click()
  await expect(list(page)).not.toContainText(FIRST)
  await expect(list(page).getByRole('status').filter({ hasText: 'The conversation was erased.' })).toBeVisible()
  await expect(rows(page).first()).toBeFocused()
  await noReadOnceGone(page)
})
