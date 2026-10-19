import { expect, test, type Page } from '@playwright/test'

// The room's chat reads back past its last 50 messages (docs/plans/discussion-earlier.md, A23): «Earlier messages» at
// its top reads one page and puts it above, the reader kept in place; at the first message the start is said. Every
// message seen stays, so the snapshot's moving window leaves no gap. Every word is synthetic.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const chatToggle = (page: Page) => page.getByRole('button', { name: /^Chat/ }).first()
const entries = (page: Page) => page.getByRole('list', { name: 'Recent discussion' }).locator('.contribution-text')
const earlier = (page: Page) => page.getByRole('button', { name: 'Earlier messages' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const first = '00000000-0000-4000-8000-000000000011'

async function enter(page: Page, count: number) {
  await page.goto(`/room.html?call=on&discussion=${count}`)
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('earlier · past 50 messages, the chat offers the earlier ones; a press puts them above, the reader kept in place', async ({
  page,
}) => {
  await enter(page, 60)
  await expect(entries(page)).toHaveCount(50)
  await expect(entries(page).first()).toHaveText('Message 11')
  await earlier(page).scrollIntoViewIfNeeded()
  const before = await entries(page).first().boundingBox()
  await earlier(page).click()
  await expect(entries(page)).toHaveCount(60)
  await expect(entries(page).first()).toHaveText('Message 1')
  // The message the reader was at stays where it was: what came in went above it.
  const kept = await page.getByText('Message 11', { exact: true }).boundingBox()
  expect(Math.abs((kept?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(80)
  await expect(page.getByText('The start of the room’s chat')).toBeVisible()
  await expect(earlier(page)).toHaveCount(0)
  expect(await served(page)).toContain(`discussion:${first}`)
})

test('earlier · a message after the press leaves no gap: every message seen stays', async ({ page }) => {
  await enter(page, 60)
  await earlier(page).click()
  await expect(entries(page)).toHaveCount(60)
  for (let i = 61; i <= 65; i++) await page.evaluate((text) => window.fixture?.say(text), `Message ${i}`)
  await expect(entries(page)).toHaveCount(65)
  await expect(entries(page).nth(15)).toHaveText('Message 16')
  await expect(entries(page).last()).toHaveText('Message 65')
})

test('earlier · a read that fails says so, and trying again reads it', async ({ page }) => {
  await enter(page, 60)
  await page.evaluate(() => window.fixture?.failEarlier())
  await earlier(page).click()
  await expect(page.getByRole('alert')).toContainText('Couldn’t load earlier messages')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(entries(page)).toHaveCount(60)
})

test('earlier · with fewer than 50 messages, nothing is offered', async ({ page }) => {
  await enter(page, 12)
  await expect(entries(page)).toHaveCount(12)
  await expect(earlier(page)).toHaveCount(0)
  expect((await served(page)).some((s) => s.startsWith('discussion:'))).toBe(false)
})

test('earlier · from the keyboard the focus stays in the chat: on the button while it reads, then on the start (Codex P1 on #350)', async ({
  page,
}) => {
  await enter(page, 60)
  await page.evaluate(() => window.fixture?.failEarlier())
  await earlier(page).focus()
  await page.keyboard.press('Enter')
  // Failed, the same control offers Try again, and keeps the focus.
  const retry = page.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeFocused()
  await page.keyboard.press('Enter')
  const start = page.getByText('The start of the room’s chat')
  await expect(start).toBeVisible()
  await expect(start).toBeFocused()
})

// 4309253137: a message older than the snapshot's 50, already read on an earlier page, corrected or withdrawn by someone
// else's tab. The feed names it; the chat reads again only the page that holds it and shows its committed state.
const items = (page: Page) => page.getByRole('list', { name: 'Recent discussion' }).locator('[data-message]')
const pageReads = async (page: Page) => (await served(page)).filter((s) => s.startsWith('discussion:')).length

async function heldEarlier(page: Page) {
  await page.goto('/room.html?call=on&discussion=60&acts=1')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await earlier(page).click()
  await expect(entries(page)).toHaveCount(60)
}

test('earlier · a held message corrected elsewhere shows its committed words, in place, after one page read (4309253137)', async ({
  page,
}) => {
  await heldEarlier(page)
  const reads = await pageReads(page)
  const target = (await items(page).nth(2).getAttribute('data-message')) ?? ''
  await page.evaluate((m) => window.fixture?.changeElsewhere(2, m, 'Message 3, corrected elsewhere'), target)
  await expect(page.locator(`[data-message="${target}"] .contribution-text`)).toHaveText(
    'Message 3, corrected elsewhere',
  )
  await expect(entries(page).nth(1)).toHaveText('Message 2')
  await expect(entries(page).nth(3)).toHaveText('Message 4')
  expect(await pageReads(page)).toBe(reads + 1)
  // An ordinary new message reads no earlier page again.
  await page.evaluate(() => window.fixture?.say('SYNTHETIC: an ordinary new message.'))
  await expect(page.getByText('an ordinary new message')).toBeVisible()
  expect(await pageReads(page)).toBe(reads + 1)
})

test('earlier · a held message withdrawn elsewhere loses its words; its neighbours stay in order (4309253137)', async ({
  page,
}) => {
  await heldEarlier(page)
  const target = (await items(page).nth(3).getAttribute('data-message')) ?? ''
  await page.evaluate((m) => window.fixture?.changeElsewhere(3, m, null), target)
  await expect(page.getByText('Message 4', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Message 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Message 5', { exact: true })).toBeVisible()
})

test('earlier · a held message withdrawn elsewhere whose page fails to read again: its words go, the earlier pages go, and «Earlier messages» reads them again (R on 61dc)', async ({
  page,
}) => {
  await heldEarlier(page)
  const target = (await items(page).nth(3).getAttribute('data-message')) ?? ''
  await page.evaluate(() => window.fixture?.failEarlier())
  await page.evaluate((m) => window.fixture?.changeElsewhere(3, m, null), target)
  await expect(page.getByText('Message 4', { exact: true })).toHaveCount(0)
  await expect(earlier(page)).toBeVisible() // the span let go: a visible way to read it again
  await expect(entries(page)).toHaveCount(50)
  await earlier(page).click()
  await expect(page.getByText('Message 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Message 4', { exact: true })).toHaveCount(0)
})

declare global {
  interface Window {
    /** Earlier-page reads held until released, and how many are out (the 06 cases below). */
    holdPages?: boolean
    pagesPending?: number
    pagesMost?: number
    releasePages?: () => void
    /** 07: answers computed when asked but delivered only when released (a stale answer), one at a time. */
    holdStale?: boolean
    staleWaiting?: number
    releaseStale?: (index: number) => void
    staleBodies?: string[]
    sawStale?: boolean
  }
}

// FND-B-COMMON-HELD-INTERACTIONS-06: the real EarlierDiscussion / useProjectFeed path with earlier-page reads genuinely
// held (the page's fetch waits until released), not an immediate fixture answer. Counts the reads actually pending.
async function heldPageReads(page: Page) {
  await page.addInitScript(() => {
    const w = window
    const control = { waiting: [] as (() => void)[] }
    const staleWaiting: (() => void)[] = []
    w.releaseStale = (index) => staleWaiting[index]?.()
    w.pagesPending = 0
    w.pagesMost = 0
    w.releasePages = () => {
      const all = control.waiting.splice(0)
      for (const go of all) go()
    }
    const wrap =
      (f: typeof fetch): typeof fetch =>
      async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href)
        const earlierRead = url.pathname.endsWith('/discussion') && url.searchParams.has('before')
        if (earlierRead && w.holdStale) {
          const answer = await f(input, init) // computed now, as the page was when asked
          ;(w.staleBodies ??= []).push(await answer.clone().text())
          staleWaiting.push(() => {})
          const at = staleWaiting.length - 1
          w.staleWaiting = staleWaiting.length
          await new Promise<void>((resolve) => (staleWaiting[at] = resolve))
          return answer
        }
        if (!earlierRead || !w.holdPages) return f(input, init)
        w.pagesPending = (w.pagesPending ?? 0) + 1
        w.pagesMost = Math.max(w.pagesMost ?? 0, w.pagesPending)
        await new Promise<void>((resolve) => control.waiting.push(resolve))
        w.pagesPending = (w.pagesPending ?? 1) - 1
        return f(input, init)
      }
    let current = wrap(window.fetch.bind(window))
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      get: () => current,
      set: (f: typeof fetch) => (current = wrap(f)),
    })
  })
}
const pending = (page: Page) => page.evaluate(() => ({ now: window.pagesPending ?? 0, most: window.pagesMost ?? 0 }))
const holdPages = (page: Page, on: boolean) => page.evaluate((v) => (window.holdPages = v), on)
const release = (page: Page) => page.evaluate(() => window.releasePages?.())
const idAt = async (page: Page, n: number) => (await items(page).nth(n).getAttribute('data-message')) ?? ''
const textOf = (page: Page, message: string) => page.locator(`[data-message="${message}"] .contribution-text`)

for (const phone of [false, true])
  test(`earlier${phone ? ' @phone' : ''} · a held message corrected elsewhere while its page read is held: never its old words, its neighbours and place kept, then its new words (06)`, async ({
    page,
  }) => {
    await heldPageReads(page)
    await heldEarlier(page)
    const target = await idAt(page, 2)
    const neighbour = page.getByText('Message 10', { exact: true })
    await neighbour.scrollIntoViewIfNeeded()
    const before = await neighbour.boundingBox()
    const focusedBefore = await page.evaluate(() => document.activeElement?.tagName ?? null)
    await holdPages(page, true)
    await page.evaluate((m) => window.fixture?.changeElsewhere(2, m, 'Message 3, corrected elsewhere'), target)
    await expect.poll(async () => (await pending(page)).now).toBe(1) // the refresh is genuinely out, held
    await expect(page.getByText('Message 3', { exact: true })).toHaveCount(0) // never the superseded words
    await page.waitForTimeout(1000)
    await expect(page.getByText('Message 3', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Message 2', { exact: true })).toBeVisible()
    await expect(page.getByText('Message 4', { exact: true })).toBeVisible()
    const during = await neighbour.boundingBox()
    await release(page)
    await expect(textOf(page, target)).toHaveText('Message 3, corrected elsewhere')
    const after = await neighbour.boundingBox()
    const focusedAfter = await page.evaluate(() => document.activeElement?.tagName ?? null)
    test.info().annotations.push({
      type: 'scroll-focus',
      description: JSON.stringify({
        before: before?.y,
        during: during?.y,
        after: after?.y,
        focusedBefore,
        focusedAfter,
      }),
    })
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(80) // the reader stays where they were
    expect(focusedAfter).toBe(focusedBefore)
    expect((await pending(page)).most).toBe(1)
  })

test('earlier · withdrawn elsewhere while its read is held, and another held message corrected meanwhile: neither shows stale words; both settle (06)', async ({
  page,
}) => {
  await heldPageReads(page)
  await heldEarlier(page)
  const withdrawn = await idAt(page, 3)
  const corrected = await idAt(page, 5)
  await holdPages(page, true)
  await page.evaluate((m) => window.fixture?.changeElsewhere(3, m, null), withdrawn)
  await expect.poll(async () => (await pending(page)).now).toBe(1)
  await page.evaluate((m) => window.fixture?.changeElsewhere(5, m, 'Message 6, corrected elsewhere'), corrected)
  await expect(page.getByText('Message 4', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Message 6', { exact: true })).toHaveCount(0) // fenced at once, waiting its turn
  await page.waitForTimeout(500)
  expect((await pending(page)).now, 'the second waits: one batch at a time').toBe(1)
  await holdPages(page, false)
  await release(page)
  await expect(textOf(page, corrected)).toHaveText('Message 6, corrected elsewhere')
  await expect(page.getByText('Message 4', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Message 5', { exact: true })).toBeVisible()
  expect((await pending(page)).most).toBeLessThanOrEqual(3)
})

test('earlier · a burst of held changes while reads are held keeps at most 3 reads out in this chat (06)', async ({
  page,
}) => {
  await heldPageReads(page)
  await heldEarlier(page)
  const ids = [await idAt(page, 1), await idAt(page, 3), await idAt(page, 5), await idAt(page, 7), await idAt(page, 9)]
  await holdPages(page, true)
  for (const [k, m] of ids.entries())
    await page.evaluate(
      ([n, mid]) => window.fixture?.changeElsewhere(Number(n), String(mid), `burst ${n}`),
      [[1, 3, 5, 7, 9][k], m],
    )
  await page.waitForTimeout(1000)
  expect((await pending(page)).most).toBeLessThanOrEqual(3)
  for (const n of [2, 4, 6, 8, 10]) await expect(page.getByText(`Message ${n}`, { exact: true })).toHaveCount(0)
  await holdPages(page, false)
  await release(page)
  // The first read settles; the four waiting need four pages, more than 3: the earlier pages are let go (held-pages)
  // and «Earlier messages» reads them again, with every change.
  await expect(earlier(page)).toBeVisible()
  await expect(entries(page)).toHaveCount(50)
  await earlier(page).click()
  for (const n of [1, 3, 5, 7, 9]) await expect(page.getByText(`burst ${n}`, { exact: true })).toBeVisible()
  for (const n of [2, 4, 6, 8, 10]) await expect(page.getByText(`Message ${n}`, { exact: true })).toHaveCount(0)
  expect((await pending(page)).most).toBeLessThanOrEqual(3)
})

// 07 ordering (R fallback-reload): stale answers to a manual «Earlier messages» read, against the real caller.
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`

test('earlier · a message corrected elsewhere while a manual «Earlier messages» read is out: its stale answer never shows the old words (07)', async ({
  page,
}) => {
  await heldPageReads(page)
  await enter(page, 60)
  await page.evaluate(() => (window.holdStale = true))
  await earlier(page).click()
  await expect.poll(() => page.evaluate(() => window.staleWaiting ?? 0)).toBe(1) // answered as it was, held
  await page.evaluate((m) => window.fixture?.changeElsewhere(2, m, 'Message 3, corrected during the read'), idOf(2))
  await page.evaluate(() => {
    window.holdStale = false
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('.contribution-text'))
        if (el.textContent === 'Message 3') window.sawStale = true
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  await page.evaluate(() => window.releaseStale?.(0))
  await expect(page.getByText('Message 3, corrected during the read', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.sawStale ?? false), 'the stale words were never on the page').toBe(false)
  await expect(page.getByText('Message 2', { exact: true })).toBeVisible()
})

test('earlier · a manual «Earlier messages» read that lands after the pages were let go installs nothing (07)', async ({
  page,
}) => {
  await heldPageReads(page)
  await page.goto('/room.html?call=on&discussion=110&acts=1')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await earlier(page).click()
  await expect(entries(page)).toHaveCount(100)
  await page.evaluate(() => (window.holdStale = true))
  await earlier(page).click() // the manual read of the oldest page: answered now, held (index 0)
  await expect.poll(() => page.evaluate(() => window.staleWaiting ?? 0)).toBe(1)
  await page.evaluate(() => window.fixture?.failEarlier())
  await page.evaluate((m) => window.fixture?.changeElsewhere(20, m, 'Message 21, corrected'), idOf(20))
  await expect.poll(() => page.evaluate(() => window.staleWaiting ?? 0)).toBe(2) // its refresh: fails, held (index 1)
  await page.evaluate(() => window.releaseStale?.(1)) // the refresh fails first: the pages are let go
  await expect(entries(page)).toHaveCount(50)
  await page.evaluate(() => window.releaseStale?.(0)) // then the older manual read lands
  await page.waitForTimeout(1000)
  await expect(entries(page)).toHaveCount(50)
  await expect(page.getByText('Message 1', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Message 11', { exact: true })).toHaveCount(0)
  await expect(earlier(page)).toBeVisible()
})

// 4309755040: a held message, older than the newest 50, named again at the same revision (contribution.mentioned, no
// new words) shows its new mention after its page is read again.
test('earlier · a held message that comes to mention me, its words and revision unchanged, shows the mention (4309755040)', async ({
  page,
}) => {
  await heldEarlier(page)
  const target = (await items(page).nth(2).getAttribute('data-message')) ?? ''
  await expect(page.locator(`[data-message="${target}"] .contribution-mentions`)).toHaveCount(0)
  await page.evaluate(() => window.fixture?.mentionMeIn(2))
  await expect(page.locator(`[data-message="${target}"] .contribution-mentions`)).toHaveText('to you')
  await expect(page.locator(`[data-message="${target}"] .contribution-text`)).toHaveText('Message 3')
})

// 4309755040 exact: a held message older than the newest 50 is named, then no longer, at the same revision, the second
// change learned while the first refresh is still out (answered at request, with the recipient). The older answer
// leaves it fenced; the fresh page (no recipient) settles it.
const MENTION_ENTITY = (id: string) => ({
  type: 'contribution.mentioned',
  entityType: 'contribution',
  entityId: id,
  entityRevision: 1,
})
const namesMe = (body: string, id: string) => new RegExp(`"id":"${id}"[^}]*"mentions":\\["`).test(body)

test('earlier · named then no longer at the same revision, the second while the first read is out: the old answer settles nothing; the fresh one shows no mention (4309755040)', async ({
  page,
}) => {
  await heldPageReads(page)
  await heldEarlier(page)
  const target = (await items(page).nth(2).getAttribute('data-message')) ?? ''
  await page.evaluate(() => (window.holdStale = true))
  await page.evaluate(() => window.fixture?.mentionMeIn(2)) // named: the first refresh, answered now, held (0)
  expect(await page.evaluate(() => window.fixture?.lastEventEntity())).toEqual(MENTION_ENTITY(target))
  await expect.poll(() => page.evaluate(() => window.staleWaiting ?? 0)).toBe(1)
  const firstAnswer = await page.evaluate(() => window.staleBodies?.[0] ?? '')
  expect(namesMe(firstAnswer, target), 'the recipient, in the answer as asked').toBe(true)
  await page.evaluate(() => window.fixture?.unmentionMeIn(2)) // no longer named, while that read is out
  expect(await page.evaluate(() => window.fixture?.lastEventEntity())).toEqual(MENTION_ENTITY(target))
  await page.evaluate(() => window.releaseStale?.(0)) // the older answer, with the recipient, lands
  await expect.poll(() => page.evaluate(() => window.staleWaiting ?? 0)).toBe(2) // read again: answered now (1)
  await expect(page.locator(`[data-message="${target}"]`)).toHaveCount(0) // still fenced, never with the old label
  const secondAnswer = await page.evaluate(() => window.staleBodies?.[1] ?? '')
  expect(secondAnswer).toContain(`"id":"${target}"`)
  expect(namesMe(secondAnswer, target), 'no recipient in the fresh answer').toBe(false)
  await page.evaluate(() => (window.holdStale = false))
  await page.evaluate(() => window.releaseStale?.(1))
  await expect(page.locator(`[data-message="${target}"] .contribution-text`)).toHaveText('Message 3')
  await expect(page.locator(`[data-message="${target}"] .contribution-mentions`)).toHaveCount(0)
  await expect(page.getByText('Message 2', { exact: true })).toBeVisible()
  await expect(page.getByText('Message 4', { exact: true })).toBeVisible()
})

// R on 21dab (r4313704366): A and B share one source, so one body, both held beyond the newest 50. Correcting or
// withdrawing A elsewhere erases that source: B no longer lists in any read, and the one event names A. B must go.
for (const act of ['correct', 'withdraw'] as const)
  test(`earlier · ${act === 'correct' ? 'a correction' : 'a withdrawal'} that erases a shared source leaves no held alias showing its words (r4313704366)`, async ({
    page,
  }) => {
    await page.goto('/room.html?call=on&discussion=60&acts=1&alias=1')
    await expect(leave(page)).toBeVisible()
    await chatToggle(page).click()
    await earlier(page).click()
    await expect(entries(page)).toHaveCount(60)
    const a = (await items(page).nth(2).getAttribute('data-message')) ?? ''
    const b = (await items(page).nth(3).getAttribute('data-message')) ?? ''
    await expect(page.locator(`[data-message="${b}"] .contribution-text`)).toHaveText('SYNTHETIC shared words')
    await page.evaluate(([m, text]) => window.fixture?.eraseShared(2, m, text), [
      a,
      act === 'correct' ? 'Message 3, corrected elsewhere' : null,
    ] as const)
    await expect(page.locator(`[data-message="${b}"]`)).toHaveCount(0)
    if (act === 'correct')
      await expect(page.locator(`[data-message="${a}"] .contribution-text`)).toHaveText(
        'Message 3, corrected elsewhere',
      )
    await expect(entries(page).nth(1)).toHaveText('Message 2')
  })

// r4313704366 F2: the alias pair on the oldest page, read by a manual «Earlier messages» while A's source is erased
// (A is not held then: which source went is unknown). That read, asked before, never shows B's old words.
test('earlier · an erasure learned while a manual «Earlier messages» read is out: the alias it brings never shows (r4313704366)', async ({
  page,
}) => {
  await heldPageReads(page)
  await page.goto('/room.html?call=on&discussion=110&acts=1&alias=1')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await earlier(page).click()
  await expect(entries(page)).toHaveCount(100)
  await page.evaluate(() => (window.holdStale = true))
  await earlier(page).click()
  await expect.poll(() => page.evaluate(() => window.staleWaiting ?? 0)).toBe(1) // answered as it was, held
  await page.evaluate((m) => window.fixture?.eraseShared(2, m, null), idOf(2))
  await page.evaluate(() => {
    window.holdStale = false
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('.contribution-text'))
        if (el.textContent === 'SYNTHETIC shared words') window.sawStale = true
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  await page.evaluate(() => window.releaseStale?.(0))
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.sawStale ?? false), 'the erased words were never on the page').toBe(false)
  await expect(page.getByText('SYNTHETIC shared words', { exact: true })).toHaveCount(0)
  await expect(earlier(page)).toBeVisible() // still usable: the pages can be read again
})

// R on 01d05 (F2, named A): A held, its alias pair on a held page; a manual «Earlier messages» read is out when A's
// correction erases the source. A's targeted reread brings its new words; the manual read, asked before, must not
// bring A's old ones back when it lands.
test('earlier · a manual «Earlier messages» read asked before an erasure never brings the named message’s old words back (r4313704366)', async ({
  page,
}) => {
  await heldPageReads(page)
  await page.goto('/room.html?call=on&discussion=110&acts=1&alias=1&aliasAt=20')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await earlier(page).click()
  await expect(entries(page)).toHaveCount(100)
  await page.evaluate(() => (window.holdStale = true))
  await earlier(page).click()
  await expect.poll(() => page.evaluate(() => window.staleWaiting ?? 0)).toBe(1) // the manual read, held
  await page.evaluate((m) => window.fixture?.eraseShared(20, m, 'Message 21, corrected elsewhere'), idOf(20))
  await expect.poll(() => page.evaluate(() => window.staleWaiting ?? 0)).toBe(2) // A's reread, held too
  await page.evaluate(() => (window.holdStale = false))
  await page.evaluate(() => window.releaseStale?.(1))
  await expect(page.locator(`[data-message="${idOf(20)}"] .contribution-text`)).toHaveText(
    'Message 21, corrected elsewhere',
  )
  await page.evaluate(() => {
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('.contribution-text'))
        if (el.textContent === 'SYNTHETIC shared words') window.sawStale = true
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  await page.evaluate(() => window.releaseStale?.(0))
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.sawStale ?? false), 'the erased words never came back').toBe(false)
  await expect(page.locator(`[data-message="${idOf(20)}"] .contribution-text`)).toHaveText(
    'Message 21, corrected elsewhere',
  )
})
