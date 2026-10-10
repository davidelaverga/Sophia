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

/** The list read again: by Try again where its last read failed, else by the read's own retry, already on its way. */
async function readListAgain(page: Page) {
  const again = list(page).getByRole('button', { name: 'Try again' })
  if (await again.isVisible()) await again.click()
}

/** To Goals and back: the conversations' view is mounted anew, and the open thread read again as it opens. */
async function trip(page: Page) {
  const views = page.getByRole('navigation', { name: 'Project views' })
  await views.getByRole('link', { name: 'Goals' }).click()
  await expect(page.getByRole('heading', { name: 'Goals', level: 2 })).toBeVisible()
  await views.getByRole('link', { name: 'Conversations' }).click()
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

test('removal · an erasure whose reply is lost, out of a list of the newest only: read within its project, its not found says it is gone', async ({
  page,
}) => {
  // A list holding the newest only proves nothing by leaving one out (it may be older); the conversation read within its
  // project does: to a current member the API answers not found (422) for one not open there, and that alone settles it
  // (probes.ts), with no fence. Older, or a read that fails otherwise, it is kept and nothing is said (the cases after
  // this one). Erase pressed is no receipt: its reply lost, the list says it isn't here, not that it was erased (CX-0074).
  await opened(page, '&erase=lost&more=1')
  await erase(page).click()
  await page.getByRole('group', { name: 'Erase this conversation' }).getByRole('button', { name: 'Erase' }).click()
  await expect(list(page)).not.toContainText(FIRST)
  await expect(rows(page).first()).toBeFocused()
  // The proof first: its read within the project, answered not found; only then is it said.
  await expect.poll(() => written(page, 'messages-gone')).toContain('messages-gone:c1')
  await expect(
    list(page).getByRole('status').filter({ hasText: 'The conversation isn’t here any more.' }),
  ).toBeVisible()
  await expect(page.getByText('The conversation was erased.')).toHaveCount(0)
  expect((await kept(page))?.erased[C1]).toBe(true)
  expect((await kept(page))?.erasures[C1]).toBeUndefined()
  expect((await kept(page))?.fence).toBeNull()
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
  // newest, a conversation something is kept for is read within its project; to a current member the API answers an
  // erased one not found (422), which settles it at once, with no fence (CX-0074).
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
  expect((await kept(page))?.fence).toBeNull()
  // Erased by someone else: nothing here says it was erased here, nor that it went.
  await expect(page.getByText('The conversation was erased.')).toHaveCount(0)
  await expect(page.getByText('The conversation isn’t here any more.')).toHaveCount(0)
  await expect(messages(page)).toHaveCount(2)
})

test('removal · its own read answers not found to a current member, the list’s reads failing: it is gone at once, and the rest still show', async ({
  page,
}) => {
  // CX-0074: read within its project, not found is what a current member gets for one not open there now (membership
  // and the conversation read in one snapshot), so it settles at once, with no fence; another cached here still shows.
  // None was erased here: nothing says so.
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  await rows(page).nth(1).click()
  await expect(messages(page)).toHaveCount(2)
  await rows(page).filter({ hasText: FIRST }).click()
  await expect(messages(page)).toHaveCount(6)
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate((c) => window.fixture?.eraseQuietly(c), C1)
  // To another view and back: its thread, cached, is read again as it opens, and answered not found.
  await trip(page)
  await expect.poll(async () => (await kept(page))?.erased[C1]).toBe(true)
  expect((await kept(page))?.fence).toBeNull()
  await expect(list(page)).not.toContainText(FIRST)
  await expect(rows(page)).toHaveCount(2)
  await expect(messages(page).first()).toBeVisible()
  await expect(list(page)).not.toContainText('This project refused')
  await expect(page.getByText('The conversation was erased.')).toHaveCount(0)
  // Read as it opened (twice: StrictMode mounts the fixture's view twice) and that read's one retry; then never again.
  const gone = (await written(page, 'messages-gone')).length
  expect(gone).toBeLessThanOrEqual(3)
  await page.waitForTimeout(1000)
  expect(await written(page, 'messages-gone')).toHaveLength(gone)
})

test('removal · its own read refused (403), the list’s reads failing: nothing shows, cached or not, until a list read since answers; then its thread only once read since', async ({
  page,
}) => {
  // CX-0073, CX-0074: refused within its project, the reader isn't a current member. Nothing is settled (its draft
  // stays), and neither its thread nor another one cached here shows, across trips to another view, until a list read
  // set out since answers. Given the project back, its thread, cached from before the refusal, shows only once a read
  // set out since answers: never what the cache kept, nor its composer, meanwhile.
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  await field(page).fill('SYNTHETIC-DRAFT-REFUSED')
  await rows(page).nth(1).click()
  await expect(messages(page)).toHaveCount(2)
  await rows(page).filter({ hasText: FIRST }).click()
  await expect(messages(page)).toHaveCount(6)
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate((c) => window.fixture?.refuseMessageReads(c), C1)
  // To another view and back: its thread, cached, is read again as it opens, and refused.
  await trip(page)
  await expect.poll(async () => (await served(page)).includes('messages-refused:c1')).toBe(true)
  await expect(open(page)).toHaveCount(0)
  await expect(rows(page)).toHaveCount(0)
  await expect(context(page).getByRole('heading', { name: 'This conversation' })).toHaveCount(0)
  await expect(list(page)).toContainText('This project refused a read of its conversations.')
  await trip(page)
  await expect(list(page)).toContainText('This project refused a read of its conversations.')
  await page.waitForTimeout(1000)
  await expect(open(page)).toHaveCount(0)
  await expect(rows(page)).toHaveCount(0)
  const refused = await kept(page)
  expect([refused?.erased[C1], refused?.drafts[C1]]).toEqual([undefined, 'SYNTHETIC-DRAFT-REFUSED'])
  expect(typeof refused?.denied[C1]).toBe('number')
  expect(refused?.fence?.at).toBe(refused?.denied[C1])
  // Given the project back, the reads that answer held: the list read since lifts the fence, and the thread opens.
  await page.evaluate(() => window.fixture?.holdMessageReads())
  await page.evaluate(() => window.fixture?.refuseMessageReads(null))
  await page.evaluate(() => window.fixture?.failConversations(false))
  await readListAgain(page)
  await expect(open(page).getByRole('heading', { name: FIRST })).toHaveCount(1)
  expect((await kept(page))?.fence).toBeNull()
  // What the cache holds from before the refusal doesn't show, nor the composer, while its read since is under way.
  await expect(open(page)).toContainText('Reading this conversation again…')
  await page.waitForTimeout(500)
  await expect(messages(page)).toHaveCount(0)
  await expect(field(page)).toHaveCount(0)
  expect(await page.evaluate((c) => window.fixture?.cachedMessages(c), C1)).toBe(true)
  await page.evaluate(() => window.fixture?.releaseMessageReads())
  await expect(messages(page)).toHaveCount(6)
  await expect(field(page)).toHaveValue('SYNTHETIC-DRAFT-REFUSED')
  await expect.poll(async () => (await kept(page))?.denied[C1]).toBeUndefined()
  await expect(list(page)).not.toContainText('This project refused')
  expect((await kept(page))?.erased[C1]).toBeUndefined()
})

/**
 * The list's reads fail as the feed moves (it says it may be out of date, with Try again); then, out of the project, the
 * list is refused, and the thread too though nothing reads it; Try again reads the list alone, and is refused.
 */
async function listRefusedOnTryAgain(page: Page) {
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate(() => window.fixture?.listMore(true))
  await expect(list(page).getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.evaluate(() => window.fixture?.failConversations(false))
  await page.evaluate(() => window.fixture?.refuseConversations(true))
  await page.evaluate((c) => window.fixture?.refuseMessageReads(c), C1)
  await list(page).getByRole('button', { name: 'Try again' }).click()
  await expect(list(page)).toContainText('This project refused a read of its conversations.')
}

/** Given the project back: its reads answer again, and the list is read again. */
async function projectGivenBack(page: Page) {
  await page.evaluate(() => window.fixture?.refuseConversations(false))
  await page.evaluate(() => window.fixture?.refuseMessageReads(null))
  await readListAgain(page)
}

test('removal · the list read alone refused (403), on Try again: asked once, and no frame after shows a row, the thread, its composer or Start', async ({
  page,
}) => {
  // PR #199 r4239350130, CX-0082: the list read may be the first, and the only, read to meet a refusal (Try again, the
  // feed not moving, the open thread not read again). What the list held, the thread open from it, its composer and
  // New conversation go with that answer, before any paint, across a trip to another view; an older thread read that
  // answers after lifts nothing. A list read set out since lifts the fence, and the draft is as it was.
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  await field(page).fill('SYNTHETIC-DRAFT-LIST-REFUSED')
  // The thread's read as the feed moves is held (it answers as it was, after the refusal).
  await page.evaluate(() => window.fixture?.holdMessageReads())
  await page.evaluate(() => {
    const frames = document.documentElement.dataset
    frames.shownAfterRefusal = '0'
    const shown = [
      '[aria-label="All conversations"] li',
      '[aria-label="Open conversation"]',
      'button[aria-label="New conversation"]',
    ].join(', ')
    const tick = () => {
      if ((window.fixture?.served ?? []).includes('conversations-refused') && document.querySelector(shown))
        frames.shownAfterRefusal = String(Number(frames.shownAfterRefusal) + 1)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await listRefusedOnTryAgain(page)
  await page.waitForTimeout(1500)
  expect((await served(page)).filter((s) => s === 'conversations-refused')).toHaveLength(1)
  await expect(rows(page)).toHaveCount(0)
  await expect(open(page)).toHaveCount(0)
  await expect(list(page).getByRole('button', { name: 'New conversation' })).toHaveCount(0)
  // The older thread read answers now; then to another view and back: still nothing shows.
  await page.evaluate(() => window.fixture?.releaseMessageReads())
  await trip(page)
  await expect(list(page)).toContainText('This project refused a read of its conversations.')
  await page.waitForTimeout(1000)
  expect(await page.evaluate(() => Number(document.documentElement.dataset.shownAfterRefusal))).toBeLessThanOrEqual(3)
  const fenced = await kept(page)
  expect(typeof fenced?.fence?.at).toBe('number')
  expect([fenced?.erased[C1], fenced?.drafts[C1]]).toEqual([undefined, 'SYNTHETIC-DRAFT-LIST-REFUSED'])
  await projectGivenBack(page)
  await expect(rows(page)).not.toHaveCount(0)
  await expect(messages(page)).toHaveCount(6)
  await expect(field(page)).toHaveValue('SYNTHETIC-DRAFT-LIST-REFUSED')
  expect((await kept(page))?.fence).toBeNull()
})

test('removal · the list refused while a new conversation is being written: the form goes, its words kept, and comes back with the project', async ({
  page,
}) => {
  // CX-0082: New conversation is a write control the refused list's capability offered; the form, and Start, go with
  // the refusal. What was written in it is kept, and is there again once a list read since answers.
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  await list(page).getByRole('button', { name: 'New conversation' }).click()
  const form = page.getByRole('form', { name: 'New conversation' })
  await form.getByLabel('Question').fill('SYNTHETIC-QUESTION-LIST-REFUSED')
  await listRefusedOnTryAgain(page)
  await expect(form).toHaveCount(0)
  await expect(list(page).getByRole('button', { name: 'New conversation' })).toHaveCount(0)
  await expect(rows(page)).toHaveCount(0)
  expect(await written(page, 'conversation-start')).toEqual([])
  await projectGivenBack(page)
  await expect(form.getByLabel('Question')).toHaveValue('SYNTHETIC-QUESTION-LIST-REFUSED')
  await expect(rows(page)).not.toHaveCount(0)
})

test('removal · an erasure with no reply, then the list refused: fenced, its intent kept; given the project back it is sent again under its key', async ({
  page,
}) => {
  // CX-0082: a refusal settles nothing. The erasure pressed and unanswered stays held across the fence, and goes again
  // under the same key once the project is back.
  await opened(page, '&erase=unreached')
  await erase(page).click()
  const confirm = page.getByRole('group', { name: 'Erase this conversation' })
  await confirm.getByRole('button', { name: 'Erase' }).click()
  await expect(confirm).toContainText('Not confirmed')
  await listRefusedOnTryAgain(page)
  await expect(rows(page)).toHaveCount(0)
  await expect(erase(page)).toHaveCount(0)
  expect((await kept(page))?.erasures[C1]).toBeTruthy()
  expect((await kept(page))?.erased[C1]).toBeUndefined()
  await projectGivenBack(page)
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

test('removal · refused (403), given the project back, its own reads failing (503): it says it can’t be read now, with Try again, and shows nothing it held', async ({
  page,
}) => {
  // PR #199 CX-0079: the list read since lifts the fence and the conversation opens again, but its own read since
  // fails. Waiting for ever is not what is so: once that read has failed it says it can't be read now, and Try again
  // reads it again. What it held before the refusal, and its composer, never show meanwhile; its draft stays.
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  await field(page).fill('SYNTHETIC-DRAFT-UNREAD')
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate((c) => window.fixture?.refuseMessageReads(c), C1)
  await trip(page)
  await expect.poll(async () => (await served(page)).includes('messages-refused:c1')).toBe(true)
  await expect(rows(page)).toHaveCount(0)
  // Given the project back; the list answers, the conversation's own reads fail.
  await page.evaluate((c) => window.fixture?.failMessageReads(c), C1)
  await page.evaluate(() => window.fixture?.refuseMessageReads(null))
  await page.evaluate(() => window.fixture?.failConversations(false))
  await readListAgain(page)
  await expect(open(page).getByRole('heading', { name: FIRST })).toHaveCount(1)
  const unread = open(page).getByRole('alert').filter({ hasText: 'This conversation can’t be read now.' })
  await expect(unread).toBeVisible({ timeout: 10_000 })
  await expect(open(page)).not.toContainText('Reading this conversation again…')
  await expect(messages(page)).toHaveCount(0)
  await expect(field(page)).toHaveCount(0)
  expect((await kept(page))?.drafts[C1]).toBe('SYNTHETIC-DRAFT-UNREAD')
  expect(typeof (await kept(page))?.denied[C1]).toBe('number')
  // Its reads answer again: Try again reads it, and it shows, its draft as it was.
  await page.evaluate(() => window.fixture?.failMessageReads(null))
  await unread.getByRole('button', { name: 'Try again' }).click()
  await expect(messages(page)).toHaveCount(6)
  await expect(field(page)).toHaveValue('SYNTHETIC-DRAFT-UNREAD')
  await expect.poll(async () => (await kept(page))?.denied[C1]).toBeUndefined()
})

test('removal · its read refused (403) as the feed moves, while open: asked once, and no frame shows its messages or composer after', async ({
  page,
}) => {
  // PR #199 r4239161783: refused, its read is not asked again (a retry would leave what it held on screen meanwhile),
  // and its messages and composer go in the render that refusal comes in, before any paint, then the view is fenced.
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  await expect(field(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate((c) => window.fixture?.refuseMessageReads(c), C1)
  // Each frame from the refusal on: whether a message or the composer of the open one is on screen.
  await page.evaluate(() => {
    const frames = document.documentElement.dataset
    frames.shownAfterRefusal = '0'
    const here = '[aria-label="Open conversation"]'
    const tick = () => {
      const refused = (window.fixture?.served ?? []).includes('messages-refused:c1')
      if (refused && document.querySelector(`${here} .conv-messages > li, ${here} textarea`))
        frames.shownAfterRefusal = String(Number(frames.shownAfterRefusal) + 1)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.evaluate(() => window.fixture?.listMore(true))
  await expect(rows(page)).toHaveCount(0)
  await page.waitForTimeout(1500)
  // The answer itself takes a frame or two to come in after the fixture serves it; a retry's wait would take ~60.
  expect(await page.evaluate(() => Number(document.documentElement.dataset.shownAfterRefusal))).toBeLessThanOrEqual(3)
  const refusals = (await served(page)).filter((s) => s === 'messages-refused:c1')
  expect(refusals).toHaveLength(1)
  await expect(list(page)).toContainText('This project refused a read of its conversations.')
})

test('removal · reads set out before another’s refusal (403) answer after it: the fence holds, and nothing shows until read since', async ({
  page,
}) => {
  // CX-0074: a direct read (probe) and the open thread's read, under way as the reader leaves the project, answer (200)
  // after the open conversation's read within the project is refused. Neither lifts the fence or brings back a row, a
  // thread or a composer; nothing is settled. Given the project back, the thread, cached from before, shows only once
  // a read set out since answers.
  await page.goto(`${PAGE}&more=1`)
  await expect(messages(page)).toHaveCount(6)
  await field(page).fill('SYNTHETIC-DRAFT-KEPT')
  await rows(page).nth(1).click()
  await expect(messages(page)).toHaveCount(2)
  const readsOfC1 = async () => (await served(page)).filter((s) => s.startsWith('messages:c1')).length
  const readBefore = await readsOfC1()
  // From now on the reads that answer are held, each to answer as it was when asked.
  await page.evaluate(() => window.fixture?.holdMessageReads())
  // The first pushed past the newest: read directly (held: it is there); the open one read again as the feed moves.
  await page.evaluate((c) => window.fixture?.capPast(c), C1)
  await expect(list(page)).not.toContainText(FIRST)
  await expect.poll(readsOfC1).toBe(readBefore + 1)
  // Out of the project, the list's reads failing: the open one read again as the feed moves, and refused.
  await page.evaluate((c) => window.fixture?.refuseMessageReads(c), C2)
  await page.evaluate(() => window.fixture?.failConversations(true))
  await page.evaluate(() => window.fixture?.listMore(true))
  await expect.poll(async () => (await served(page)).includes('messages-refused:c2')).toBe(true)
  await expect(rows(page)).toHaveCount(0)
  await expect.poll(async () => typeof (await kept(page))?.denied[C2]).toBe('number')
  const fenced = await kept(page)
  // The reads set out before the refusal answer now.
  await page.evaluate(() => window.fixture?.releaseMessageReads())
  await page.waitForTimeout(1000)
  await expect(rows(page)).toHaveCount(0)
  await expect(open(page)).toHaveCount(0)
  const after = await kept(page)
  expect([after?.fence, after?.denied]).toEqual([fenced?.fence, fenced?.denied])
  expect([after?.erased, after?.drafts[C1]]).toEqual([{}, 'SYNTHETIC-DRAFT-KEPT'])
  // Given the project back, the reads that answer held again: the open one's cache shows nothing until read since.
  await page.evaluate(() => window.fixture?.holdMessageReads())
  await page.evaluate(() => window.fixture?.refuseMessageReads(null))
  await page.evaluate(() => window.fixture?.failConversations(false))
  await readListAgain(page)
  await expect(rows(page)).not.toHaveCount(0)
  await expect(open(page)).toContainText('Reading this conversation again…')
  await page.waitForTimeout(500)
  await expect(messages(page)).toHaveCount(0)
  await expect(open(page).getByRole('textbox')).toHaveCount(0)
  await page.evaluate(() => window.fixture?.releaseMessageReads())
  await expect(messages(page)).toHaveCount(2)
  await expect.poll(async () => (await kept(page))?.denied[C2]).toBeUndefined()
  expect((await kept(page))?.drafts[C1]).toBe('SYNTHETIC-DRAFT-KEPT')
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

for (const back of ['older still', 'newest again'] as const) {
  test(`removal · older, its read within the project refused (403) after a list read checked it: fenced, nothing settled; given the project back (${back}), it stands with its draft`, async ({
    page,
  }) => {
    // CX-0073, CX-0074: a list read under way as the reader leaves the project (it answers as a member) lifts nothing
    // once the direct read within the project is refused: it set out before. The refusal fences the view and settles
    // nothing (its draft stays) until a list read set out since answers. Given the project back, its read within the
    // project, or its thread opened from a list that lists it again, says it stands. No view crashes on the way.
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().includes('Maximum update depth')) errors.push(m.text())
    })
    await page.clock.install()
    await page.goto(`${PAGE}&more=1`)
    await expect(messages(page)).toHaveCount(6)
    await field(page).fill('SYNTHETIC-DRAFT-OUT-OF-PROJECT')
    await rows(page).nth(1).click()
    await expect(messages(page)).toHaveCount(2)
    await page.evaluate((c) => window.fixture?.capPast(c), C1)
    await expect(list(page)).not.toContainText(FIRST)
    await expect
      .poll(async () => (await served(page)).filter((s) => s.startsWith('messages:c1')).length)
      .toBeGreaterThan(0)
    // A list read under way, the reader still in the project as it is read (held: it answers as it was).
    const lists = async () => (await served(page)).filter((s) => s === 'conversations:read').length
    const listed = await lists()
    await page.evaluate(() => window.fixture?.holdListReads())
    await page.evaluate(() => window.fixture?.listMore(true))
    await expect.poll(lists).toBe(listed + 1)
    // Out of the project: its reads refused (403), the list's failing.
    await page.evaluate((c) => window.fixture?.refuseMessageReads(c), C1)
    await page.evaluate(() => window.fixture?.failConversations(true))
    await page.clock.fastForward(31_000)
    await expect.poll(async () => (await served(page)).includes('messages-refused:c1')).toBe(true)
    await expect(rows(page)).toHaveCount(0)
    // The list read checked before the refusal answers now: it lifts nothing.
    await page.evaluate(() => window.fixture?.releaseListReads())
    await page.waitForTimeout(500)
    await expect(rows(page)).toHaveCount(0)
    await expect(open(page)).toHaveCount(0)
    await expect(list(page)).toContainText('This project refused a read of its conversations.')
    const refused = await kept(page)
    expect([refused?.erased[C1], refused?.drafts[C1]]).toEqual([undefined, 'SYNTHETIC-DRAFT-OUT-OF-PROJECT'])
    expect(typeof refused?.denied[C1]).toBe('number')
    // Given the project back; listed again among the newest, or still left out.
    await page.evaluate(() => window.fixture?.refuseMessageReads(null))
    if (back === 'newest again') await page.evaluate(() => window.fixture?.capPast(null))
    await page.evaluate(() => window.fixture?.failConversations(false))
    await readListAgain(page)
    await expect(rows(page)).not.toHaveCount(0)
    if (back === 'newest again') {
      await rows(page).filter({ hasText: FIRST }).click()
      await expect(messages(page)).toHaveCount(6)
      await expect(field(page)).toHaveValue('SYNTHETIC-DRAFT-OUT-OF-PROJECT')
    }
    await expect.poll(async () => (await kept(page))?.denied[C1]).toBeUndefined()
    expect((await kept(page))?.erased[C1]).toBeUndefined()
    expect((await kept(page))?.drafts[C1]).toBe('SYNTHETIC-DRAFT-OUT-OF-PROJECT')
    await expect(page.getByText('The conversation was erased.')).toHaveCount(0)
    await expect(page.getByText('The conversation isn’t here any more.')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

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

test('removal · an erasure whose reply is lost: when the feed shows it gone, it is said to be gone, not erased', async ({
  page,
}) => {
  // CX-0074: Erase pressed is no receipt, and a list without it can't tell an erasure from any other absence.
  await opened(page, '&erase=lost')
  await erase(page).click()
  await page.getByRole('group', { name: 'Erase this conversation' }).getByRole('button', { name: 'Erase' }).click()
  await expect(list(page)).not.toContainText(FIRST)
  await expect(
    list(page).getByRole('status').filter({ hasText: 'The conversation isn’t here any more.' }),
  ).toBeVisible()
  await expect(page.getByText('The conversation was erased.')).toHaveCount(0)
  await expect(rows(page).first()).toBeFocused()
  await noReadOnceGone(page)
})
