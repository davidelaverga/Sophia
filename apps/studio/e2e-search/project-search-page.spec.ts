import { expect, test, type Page } from '@playwright/test'

// The project's search as A38 serves it (docs/handoffs/FND-C4-PROJECT-SEARCH-attempt-1.md): the room's fixture page
// built with VITE_SOPHIA_SEARCH=1 and without the vision flag (vite.search.config.ts), so the Studio asks
// /api/v1/projects/{id}/search through its served adapter and reads each page with the generated A38 parser; the
// fixture answers strict A38 pages (each hit with its hash, no meeting, no recap). Every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Search this project' })
const field = (page: Page) => sheet(page).getByRole('searchbox', { name: 'Search this project' })
const hits = (page: Page) => sheet(page).getByRole('list', { name: 'Results' }).getByRole('listitem')
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const requests = async (page: Page) =>
  (await served(page)).filter((s) => s.startsWith('search-request:')).map((s) => s.slice('search-request:'.length))
const reads = async (page: Page) => (await served(page)).filter((s) => s.startsWith('discussion:'))
const seenOf = async (page: Page) => (await served(page)).filter((s) => s.startsWith('seen:'))
const gapLine = (page: Page) => discussion(page).locator('.discussion-gap')
const entryIdOf = (n: number) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5198',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

async function open(page: Page, query: string) {
  await page.goto(`/room.html?people=2&${query}`)
  await expect(page.locator('.room-stage')).toBeVisible()
}

/** The head's Search (served without the vision flag), then a query. */
async function search(page: Page, q: string) {
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await field(page).fill(q)
}

/** Opens the hit whose words end with «message N.» (`heron=` messages) and waits for it in the chat. */
async function openHeron(page: Page, n: number) {
  await pressHeron(page, n)
  await expect(discussion(page).locator(`[data-message="${entryIdOf(n - 1)}"]`)).toBeInViewport()
}

/** Presses that hit without waiting for its message (its read may be held). */
async function pressHeron(page: Page, n: number) {
  await search(page, 'heron')
  await hits(page)
    .filter({ hasText: `message ${String(n)}.` })
    .getByRole('button')
    .click()
}

/** The message numbers shown, in order, and 'gap' where a gap line stands. */
const layout = (page: Page) =>
  discussion(page).evaluate((list) =>
    [...list.children].map((li) =>
      li.classList.contains('discussion-gap')
        ? 'gap'
        : String(Number((li instanceof HTMLElement ? (li.dataset.message ?? '') : '').slice(-12))),
    ),
  )

/** Runs of consecutive message numbers, with the gaps between them. */
async function runs(page: Page) {
  const out: string[] = []
  let from = 0
  let last = 0
  for (const item of await layout(page)) {
    if (item === 'gap') {
      if (from) out.push(`${String(from)}–${String(last)}`, 'gap')
      from = 0
      continue
    }
    const k = Number(item)
    if (!from || k !== last + 1) {
      if (from) out.push(`${String(from)}–${String(last)}`)
      from = k
    }
    last = k
  }
  if (from) out.push(`${String(from)}–${String(last)}`)
  return out
}
const BOTH_READ = ['1–40', 'gap', '51–100', 'gap', '161–260']

test('served search · asks A38’s endpoint with the query and its cursor, reads strict pages, and a section opens at its heading', async ({
  page,
}) => {
  await open(page, 'discussion=60')
  // No vision flag: no recap, no meeting; what the page shows came through the generated parser.
  await search(page, 'Message 1')
  await expect(hits(page)).toHaveCount(3)
  await expect(hits(page).first()).toContainText('Message ·')
  await sheet(page).getByRole('button', { name: 'More results' }).click()
  await expect(hits(page)).toHaveCount(6)
  expect(await requests(page)).toEqual([
    `/api/v1/projects/${PROJECT}/search?q=Message+1`,
    `/api/v1/projects/${PROJECT}/search?q=Message+1&cursor=3`,
  ])
  await field(page).fill('holds')
  await hits(page).filter({ hasText: 'Conclusion' }).getByRole('button').click()
  const pane = page.getByRole('complementary', { name: 'Fixture report' })
  await expect(pane.getByRole('heading', { name: 'Conclusion' })).toBeFocused()
})

test('served search · an answer that isn’t A38 (a recap, a meeting) is refused by the generated parser, not shown', async ({
  page,
}) => {
  await open(page, 'discussion=60&heron=3')
  await page.evaluate(() => window.fixture?.searchAsProposed())
  await search(page, 'fixture')
  await expect(sheet(page).getByRole('alert')).toContainText('The search couldn’t be read.')
  await expect(hits(page)).toHaveCount(0)
  // Asked again, the strict page reads.
  await sheet(page).getByRole('button', { name: 'Try again' }).click()
  await expect(hits(page).first()).toBeVisible()
})

test('served search · a message beyond the chat’s 200: one read ends at it; its mention, on the revision shown, is seen once', async ({
  page,
}) => {
  await open(page, 'discussion=260&heron=3&mentionOld=1')
  await openHeron(page, 3)
  expect(await reads(page)).toEqual([`discussion:${entryIdOf(3)}`])
  await expect(gapLine(page)).toHaveCount(1)
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${entryIdOf(2)}`])
  await page.waitForTimeout(300)
  expect(await seenOf(page)).toHaveLength(1)
})

test('served search · 100 then 125: the unread messages between stay behind a gap, filled a page a press', async ({
  page,
}) => {
  await open(page, 'discussion=260&heron=100,125')
  await openHeron(page, 100)
  await openHeron(page, 125)
  expect(await reads(page)).toEqual([`discussion:${entryIdOf(100)}`, `discussion:${entryIdOf(125)}`])
  await expect(gapLine(page)).toHaveCount(1)
  for (const [i, before] of [211, 161].entries()) {
    await gapLine(page).getByRole('button', { name: 'Show them' }).click()
    await expect.poll(() => reads(page)).toHaveLength(3 + i)
    expect((await reads(page)).at(-1)).toBe(`discussion:${entryIdOf(before - 1)}`)
  }
  await expect(gapLine(page)).toHaveCount(0)
  await expect(discussion(page).locator('[data-message]')).toHaveCount(210)
})

test('served search · a disjoint second open keeps both unread intervals, each filled from below', async ({ page }) => {
  await open(page, 'discussion=260&heron=40,150')
  await openHeron(page, 150)
  await openHeron(page, 40)
  await expect(gapLine(page)).toHaveCount(2)
  const press = async (gap: number, before: number, count: number, left: number) => {
    await gapLine(page).nth(gap).getByRole('button', { name: 'Show them' }).click()
    await expect.poll(() => reads(page)).toHaveLength(count)
    expect((await reads(page)).at(-1)).toBe(`discussion:${entryIdOf(before - 1)}`)
    await expect(gapLine(page)).toHaveCount(left)
  }
  await press(1, 211, 3, 2)
  await press(1, 161, 4, 1)
  await press(0, 101, 5, 1)
  await press(0, 51, 6, 0)
  await expect(discussion(page).locator('[data-message]')).toHaveCount(260)
})

test('served search · the found page’s read fails: the failure and Try again stay, nothing is seen; Try again shows it', async ({
  page,
}) => {
  await open(page, 'discussion=260&heron=3&mentionOld=1')
  await page.evaluate(() => window.fixture?.failEarlierReads(true))
  await search(page, 'heron')
  await hits(page).getByRole('button').click()
  await expect(page.getByText('The message you opened couldn’t be loaded.')).toBeVisible()
  await page.waitForTimeout(800)
  expect(await reads(page)).toHaveLength(1)
  expect(await seenOf(page)).toEqual([])
  await page.evaluate(() => window.fixture?.failEarlierReads(false))
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(discussion(page).locator(`[data-message="${entryIdOf(2)}"]`)).toBeInViewport()
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${entryIdOf(2)}`])
})

test('served search · a slow Show them, then a search open answering first: both pages stay (R-C4-02)', async ({
  page,
}) => {
  await open(page, 'discussion=260&heron=40,100')
  await openHeron(page, 100)
  await page.evaluate((id) => window.fixture?.holdEarlierBefore([id]), entryIdOf(210))
  await gapLine(page).getByRole('button', { name: 'Show them' }).click()
  await expect.poll(() => reads(page)).toHaveLength(2)
  await openHeron(page, 40)
  await page.evaluate(() => window.fixture?.releaseEarlierReads())
  await expect(discussion(page).locator(`[data-message="${entryIdOf(209)}"]`)).toHaveCount(1)
  await expect(discussion(page).locator(`[data-message="${entryIdOf(39)}"]`)).toHaveCount(1)
  expect(await runs(page)).toEqual(BOTH_READ)
  expect(await reads(page)).toEqual([
    `discussion:${entryIdOf(100)}`,
    `discussion:${entryIdOf(210)}`,
    `discussion:${entryIdOf(40)}`,
  ])
})

test('served search · a slow search open, then a Show them answering first: both pages stay (R-C4-02)', async ({
  page,
}) => {
  await open(page, 'discussion=260&heron=40,100')
  await openHeron(page, 100)
  await page.evaluate((id) => window.fixture?.holdEarlierBefore([id]), entryIdOf(40))
  await pressHeron(page, 40)
  await expect.poll(() => reads(page)).toHaveLength(2)
  await gapLine(page).getByRole('button', { name: 'Show them' }).click()
  await expect(discussion(page).locator(`[data-message="${entryIdOf(209)}"]`)).toHaveCount(1)
  await page.evaluate(() => window.fixture?.releaseEarlierReads())
  await expect(discussion(page).locator(`[data-message="${entryIdOf(39)}"]`)).toBeInViewport()
  await expect(discussion(page).locator(`[data-message="${entryIdOf(209)}"]`)).toHaveCount(1)
  expect(await runs(page)).toEqual(BOTH_READ)
  expect(await reads(page)).toEqual([
    `discussion:${entryIdOf(100)}`,
    `discussion:${entryIdOf(40)}`,
    `discussion:${entryIdOf(210)}`,
  ])
})

declare global {
  interface Window {
    /** Earlier pages answered at request time and delivered on release (the discard-ordering cases below). */
    staleOn?: boolean
    staleCount?: () => number
    staleBody?: (i: number) => string | undefined
    releaseStale?: (i: number) => void
  }
}

// FND-B-SEARCH-DISCARD-ORDERING-PROOF-10 (R-SEARCH-AB2F-DISCARDED-READ): an earlier page answered AT REQUEST TIME
// (the page as it was when asked), delivered only when released, so a found-page jump can answer after a discard.
async function staleAtRequest(page: Page) {
  await page.addInitScript(() => {
    const w = window
    const waiting: (() => void)[] = []
    const bodies: string[] = []
    w.staleOn = false
    w.staleCount = () => waiting.length
    w.staleBody = (i: number) => bodies[i]
    w.releaseStale = (i: number) => waiting[i]?.()
    const wrap =
      (f: typeof fetch): typeof fetch =>
      async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href)
        const earlier = url.pathname.endsWith('/discussion') && url.searchParams.has('before')
        if (!earlier || !w.staleOn) return f(input, init)
        const answer = await f(input, init) // computed now
        bodies.push(await answer.clone().text())
        const at = waiting.length
        waiting.push(() => {})
        await new Promise<void>((resolve) => (waiting[at] = resolve))
        return answer
      }
    let current = wrap(window.fetch.bind(window))
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      get: () => current,
      set: (f: typeof fetch) => (current = wrap(f)),
    })
  })
}
const stale = (page: Page, script: string) => page.evaluate(script)

test('served search · a jump answered before a correction and a let-go never shows the old words nor brings the pages back; asked again, the new words (10)', async ({
  page,
}) => {
  await staleAtRequest(page)
  await open(page, 'discussion=260&heron=40,150')
  await openHeron(page, 150) // pages held: the one that ends at message 150
  await stale(page, 'window.staleOn = true')
  await pressHeron(page, 40) // the jump to message 40: answered now, held (0)
  await expect.poll(() => stale(page, 'window.staleCount()')).toBe(1)
  const target = entryIdOf(39)
  expect(String(await stale(page, 'window.staleBody(0)'))).toContain(target) // the old page, captured at request
  expect(String(await stale(page, 'window.staleBody(0)'))).toContain('The heron arrived, message 40.') // its old words
  await page.evaluate((m) => window.fixture?.changeElsewhere(39, m, 'The heron arrived again, message 40.'), target)
  // The corrected message is neither held nor shown: which source its correction erased can't be told here, so the
  // held pages are let go at once, fail-closed, with a new epoch (Common r4313704366) — no refresh read is asked.
  expect(await stale(page, 'window.staleCount()')).toBe(1)
  await expect(discussion(page).locator(`[data-message="${entryIdOf(129)}"]`)).toHaveCount(0)
  await stale(page, 'window.releaseStale(0)') // then the jump's old answer lands
  await page.waitForTimeout(1000)
  await expect(discussion(page).locator(`[data-message="${target}"]`)).toHaveCount(0) // no old words, no page back
  await expect(discussion(page).locator(`[data-message="${entryIdOf(129)}"]`)).toHaveCount(0)
  await stale(page, 'window.staleOn = false')
  // The corrected words keep what the search finds («heron», «message 40.»): the result is the corrected one.
  await search(page, 'heron')
  await expect(hits(page).filter({ hasText: 'The heron arrived again, message 40.' })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await openHeron(page, 40) // asked again: admitted, the new words
  await expect(discussion(page).locator(`[data-message="${target}"] .contribution-text`)).toHaveText(
    'The heron arrived again, message 40.',
  )
})

test('served search · a gap fill answered before a correction and a let-go never shows the old words nor brings the pages back; filled again, the new words (12)', async ({
  page,
}) => {
  await staleAtRequest(page)
  await open(page, 'discussion=260&heron=100,125')
  await openHeron(page, 100)
  await openHeron(page, 125)
  await expect(gapLine(page)).toHaveCount(1)
  await stale(page, 'window.staleOn = true')
  await gapLine(page).getByRole('button', { name: 'Show them' }).click() // the fill: answered now, held (0)
  await expect.poll(() => stale(page, 'window.staleCount()')).toBe(1)
  // A message the fill brings that the chat doesn't show yet: its old words are in the captured answer.
  const target = await page.evaluate(() => {
    const ids = [...(window.staleBody?.(0) ?? '').matchAll(/"id":"([0-9a-f-]{36})"/g)].map((m) => m[1])
    const shown = new Set([...document.querySelectorAll('[data-message]')].map((el) => el.getAttribute('data-message')))
    const unseen = ids.find((id) => id !== undefined && !shown.has(id))
    return unseen ? { id: unseen } : null
  })

  expect(target).not.toBeNull()
  const targetId = target?.id ?? ''
  const n = Number(targetId.slice(-12)) - 1
  await page.evaluate(
    ([i, m]) =>
      window.fixture?.changeElsewhere(
        Number(i),
        String(m),
        `Message ${Number(i) + 1}, corrected after the fill was asked`,
      ),
    [n, targetId],
  )
  // The corrected message is neither held nor shown: which source its correction erased can't be told here, so the
  // held pages are let go at once, fail-closed, with a new epoch (Common r4313704366) — no refresh read is asked.
  expect(await stale(page, 'window.staleCount()')).toBe(1)
  await expect(discussion(page).locator(`[data-message="${entryIdOf(109)}"]`)).toHaveCount(0)
  await stale(page, 'window.releaseStale(0)') // then the fill's old answer lands
  await page.waitForTimeout(1000)
  await expect(discussion(page).locator(`[data-message="${targetId}"]`)).toHaveCount(0) // no old words back
  await expect(discussion(page).locator(`[data-message="${entryIdOf(109)}"]`)).toHaveCount(0) // no pages back
  await stale(page, 'window.staleOn = false')
  // Read again from the start: the found pages, then the gap, filled now with the current words.
  await openHeron(page, 100)
  await openHeron(page, 125)
  await gapLine(page).getByRole('button', { name: 'Show them' }).click()
  await expect(discussion(page).locator(`[data-message="${targetId}"] .contribution-text`)).toHaveText(
    `Message ${n + 1}, corrected after the fill was asked`,
  )
})

// R on 0d25 (r4315060306): A38's 401/403 with an error body that never ends (SYNTHETIC: the page's fetch answers the
// search with that status and an endless stream, the transport controlled here). The hits read before are not shown,
// without waiting for the body; the body is let go.
type Denying = Window & { denySearch?: boolean; searchDenied?: number; searchBodyCancelled?: number }
for (const status of [401, 403])
  test(`served search · a ${status} whose body never ends hides the hits read before at once (r4315060306)`, async ({
    page,
  }) => {
    await page.addInitScript((code) => {
      const w = window as Denying
      w.searchDenied = 0
      w.searchBodyCancelled = 0
      const wrap =
        (f: typeof fetch): typeof fetch =>
        (input, init) => {
          const url = new URL(input instanceof Request ? input.url : String(input), location.href)
          if (!w.denySearch || !url.pathname.endsWith('/search')) return f(input, init)
          w.searchDenied = (w.searchDenied ?? 0) + 1
          const body = new ReadableStream({
            cancel: () => void (w.searchBodyCancelled = (w.searchBodyCancelled ?? 0) + 1),
          })
          return Promise.resolve(new Response(body, { status: code, headers: { 'content-type': 'application/json' } }))
        }
      let current = wrap(window.fetch.bind(window))
      Object.defineProperty(window, 'fetch', {
        configurable: true,
        get: () => current,
        set: (f: typeof fetch) => (current = wrap(f)),
      })
    }, status)
    await open(page, 'discussion=60&heron=3')
    await search(page, 'heron')
    await expect(hits(page)).toHaveCount(1)
    await page.evaluate(() => ((window as Denying).denySearch = true))
    await field(page).fill('kiosk') // a new search: its read refused by the headers, its body never ending
    await expect.poll(() => page.evaluate(() => (window as Denying).searchDenied)).toBeGreaterThan(0)
    await field(page).fill('heron') // back to the search read before the refusal: its cached hits are not shown
    await expect(hits(page)).toHaveCount(0, { timeout: 2000 })
    expect(await page.evaluate(() => (window as Denying).searchBodyCancelled), 'the body is let go').toBeGreaterThan(0)
  })
