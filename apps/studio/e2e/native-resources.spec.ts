import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'

// A51's native resource catalog in the Resources view (INC01-DES-002, docs/plans/inc01-resources-service-adapter.md),
// on its own fixture page (fixtures/native-resources.html): the Studio's ProjectShell and ProjectResources over
// synthetic catalog pages answered in the page. It says only what the catalog records: no session, account, control,
// readiness, capacity or request is made up, a teammate never reads the owner's facts, every state is distinct, and a
// refusal or a switch leaves nothing read before on screen.
const PAGE = '/native-resources.html'
const view = (page: Page) => page.locator('section.resources')
const tiles = (page: Page) => page.locator('.resource-tile')
const sheet = (page: Page) => page.getByRole('dialog')
/** What the catalog is, said under its head at every width (UX01). */
const SCOPE = 'Saved coding-resource records. Live activity, usage and controls aren’t reported here.'
const LIVE = 'Live sign-in and readiness aren’t reported.'
const UNREPORTED = 'Work activity, remaining usage and controls aren’t reported by this view.'
const EVIDENCE = 'Recorded host and capability evidence'
/** What Sign in again says before it signs this device out (REC01). */
const SIGN_IN_WARNING =
  'Signing in again signs out this device. It ends any call you’re in and removes everything unsent on this device: drafts and messages in your projects and your personal space.'
/** Words the catalog never says: what it doesn't report, said as none, or a host said live. */
const NEVER = [/nothing waiting/i, /no assignment/i, /\bonline\b/i, /never observed/i, /signed in/i, /\bready\b/i]

async function says(page: Page, words: RegExp[]) {
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  for (const w of words) expect(text, String(w)).not.toMatch(w)
}

test('the catalog read: what is recorded, and what isn’t reported said so, never as none', async ({ page }) => {
  await page.goto(`${PAGE}?case=complete`)
  await expect(tiles(page)).toHaveCount(6)
  await expect(view(page).locator('.view-head .count')).toHaveText('6')
  // What it is, under the head (UX01); no summary beside the count, which a phone would hide.
  await expect(view(page).locator('.resources-scope')).toHaveText(SCOPE)
  await expect(view(page).locator('.resources-summary')).toHaveCount(0)
  // Only the filters whose facts it reports: no Waiting or Online to count as none.
  await expect(page.getByRole('tab')).toHaveText([/^All/, /^Mine/])
  await expect(tiles(page).first().locator('.resource-tile-activity-words')).toHaveText('Sessions not reported')
  await expect(page.locator('.resources-attention')).toHaveCount(0)
  await expect(page.locator('.resources-away')).toHaveCount(0)
  await says(page, NEVER)
  // Its owner's tiles say their host as recorded; a teammate's, that it is private; claude is Claude Code.
  const own = tiles(page).filter({ hasText: 'Davide' })
  await expect(own.first().locator('.resource-tile-host')).toHaveText(/Host recorded|No host/)
  await expect(tiles(page).filter({ hasText: 'Luis' }).first().locator('.resource-tile-host')).toHaveText(
    'Host private',
  )
  await expect(tiles(page).filter({ hasText: 'Claude Code' })).toHaveCount(3)
  // An owner with no name: the words for that, a neutral mark and no letter, and that they left.
  const unknown = tiles(page).filter({ hasText: 'Unknown name' })
  await expect(unknown).toHaveCount(1)
  await expect(unknown.locator('.resource-avatar-unknown')).toHaveCount(1)
  await expect(unknown.locator('.avatar')).toHaveCount(0)
  await expect(unknown).toContainText('Former member')
  await expect(tiles(page).filter({ hasText: 'Needs a connection' })).toHaveCount(1)
  await expect(tiles(page).filter({ hasText: 'Revoked' })).toHaveCount(1)
})

test('its owner reads their own recorded facts in the sheet, by keys, and Escape returns to the tile', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=complete`)
  const first = tiles(page).filter({ hasText: 'Host recorded' }).first()
  await first.focus()
  await page.keyboard.press('Enter')
  await expect(sheet(page)).toBeVisible()
  const body = sheet(page)
  // Its meaning first (UX02): the connection as recorded, when the service observed it, and the live limit.
  await expect(body.locator('.resource-connection')).toHaveText('Connection linked')
  await expect(body.locator('.resource-as-read time')).toHaveAttribute('datetime', '2026-11-12T14:00:00.000Z')
  await expect(body.locator('.resource-readiness')).toHaveText(LIVE)
  // Then its recorded evidence, closed until asked for, and opened by keys.
  const evidence = body.locator('details.resource-evidence')
  await expect(evidence).not.toHaveAttribute('open')
  await expect(body.getByText('Handshake recorded')).toBeHidden()
  await evidence.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(evidence).toHaveAttribute('open')
  await expect(body.getByText('Host active (recorded) · last seen 4 min before this reading')).toBeVisible()
  await expect(body.getByText('Handshake recorded')).toBeVisible()
  await expect(evidence).toContainText(
    'Recorded qualification: current for create, input and stop. Recorded evidence, not a promise that a control works.',
  )
  await expect(evidence.locator('time').first()).toHaveAttribute('datetime', '2026-11-10T09:00:00.000Z')
  // What it doesn't report, said once, never three empty sections.
  await expect(body.locator('.resource-unreported-group')).toHaveText(UNREPORTED)
  await expect(body.getByRole('heading', { name: /^(Sessions|Capacity|Controls)$/ })).toHaveCount(0)
  // In that order: connection, observed, limit, evidence, then what isn't reported.
  const order = await body.evaluate((el) =>
    [
      '.resource-connection',
      '.resource-as-read',
      '.resource-readiness',
      '.resource-evidence',
      '.resource-unreported-group',
    ]
      .map((s) => el.querySelector(s))
      .map((n) => (n ? [...el.querySelectorAll('*')].indexOf(n) : -1)),
  )
  expect(order.every((n, i) => n >= 0 && (i === 0 || n > (order[i - 1] ?? 0)))).toBe(true)
  // Nothing to send from here: no Act, effort, Hold, Stop or Resume.
  await expect(body.getByRole('button', { name: /^(Act|Hold|Stop|Resume|Steer)\b/ })).toHaveCount(0)
  const text = (await body.innerText()).replace(/\s+/g, ' ')
  for (const w of NEVER) expect(text, String(w)).not.toMatch(w)
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(first).toBeFocused()
})

test('the owner’s recorded host says what isn’t recorded as such: no time, a conflict, none bound', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=complete`)
  await tiles(page).filter({ hasText: 'Revoked' }).click()
  await sheet(page).getByText(EVIDENCE).click()
  await expect(sheet(page)).toContainText('Host bound (recorded) · last seen 3 h before this reading')
  await expect(sheet(page)).toContainText('Connection revoked')
  await expect(sheet(page)).toContainText('Recorded qualification: doesn’t apply now')
  await page.keyboard.press('Escape')
  await tiles(page).filter({ hasText: 'Needs a connection' }).click()
  await sheet(page).getByText(EVIDENCE).click()
  await expect(sheet(page)).toContainText('No bound or active host recorded')
  // Linked but past its time: expired, never usable.
  await expect(sheet(page)).toContainText('Connection expired')
  await expect(sheet(page)).toContainText('Recorded qualification: stale')
})

test('a teammate never reads the owner’s facts: not in the sheet, not anywhere in the page', async ({ page }) => {
  await page.goto(`${PAGE}?case=complete&viewer=luis`)
  await expect(tiles(page)).toHaveCount(6)
  await tiles(page).filter({ hasText: 'Davide' }).first().click()
  await expect(sheet(page)).toContainText('Its host and connection details are private to its owner.')
  await expect(sheet(page).locator('.resource-readiness')).toHaveText(LIVE)
  // No evidence at all for a teammate: no disclosure, closed or hidden, and none of its words (UX02).
  await expect(sheet(page).locator('.resource-evidence, details')).toHaveCount(0)
  const html = await page.content()
  for (const fact of ['Connection linked', 'Handshake recorded', 'Recorded qualification', 'last seen 4 min', EVIDENCE])
    expect(html).not.toContain(fact)
  // A listed record is no entitlement (UX06): nothing to use, share, assign or pool.
  await expect(sheet(page).getByRole('button', { name: /use|share|assign|pool|connect/i })).toHaveCount(0)
  await expect(sheet(page)).not.toContainText(/shared subscription|pooled|use this tool/i)
  await page.keyboard.press('Escape')
  // Luis's own reads as his: a conflict recorded, no usable last-seen time, no qualification record shown.
  await tiles(page).filter({ hasText: 'Host recorded' }).first().click()
  await sheet(page).getByText(EVIDENCE).click()
  await expect(sheet(page)).toContainText('Host bound (recorded) · last seen time not recorded in a usable form')
  await expect(sheet(page)).toContainText('A conflict is recorded')
  await expect(sheet(page)).toContainText('No qualification recorded')
})

test('More reads the next page; each row keeps its own page’s time', async ({ page }) => {
  await page.goto(`${PAGE}?case=more`)
  await expect(tiles(page)).toHaveCount(3)
  await expect(view(page).locator('.view-head .count')).toHaveText('3 loaded')
  const more = page.getByRole('button', { name: 'More resources' })
  await more.focus()
  await page.keyboard.press('Enter')
  await expect(tiles(page)).toHaveCount(6)
  await expect(page.getByRole('button', { name: 'More resources' })).toHaveCount(0)
  await expect(view(page).locator('.view-head .count')).toHaveText('6')
  await expect(page.locator('.resources-cue')).toHaveCount(0)
  await tiles(page).nth(0).click()
  await expect(sheet(page).locator('.resource-as-read time')).toHaveAttribute('datetime', '2026-11-12T14:00:00.000Z')
  await page.keyboard.press('Escape')
  await tiles(page).nth(5).click()
  await expect(sheet(page).locator('.resource-as-read time')).toHaveAttribute('datetime', '2026-11-12T14:01:30.000Z')
  // The first page, then the next by the cursor it gave (the dev page's StrictMode may ask the first one twice).
  const asked = await page.evaluate(() => window.nativeFixture?.requests.map((r) => r.after) ?? [])
  expect(asked.filter((a) => a !== null)).toEqual(['10000000-0000-4000-8000-000000000003'])
  expect(asked.at(-1)).toBe('10000000-0000-4000-8000-000000000003')
})

test('a second page that fails, or doesn’t follow, leaves what was read partial, said with its time', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=partial`)
  await page.getByRole('button', { name: 'More resources' }).click()
  await expect(page.locator('.resources-partial')).toContainText('3 loaded · couldn’t read the rest.')
  await expect(page.locator('.resources-partial time')).toHaveAttribute('datetime', '2026-11-12T14:00:00.000Z')
  await expect(tiles(page)).toHaveCount(3)
  // Try again is a new read, from the start.
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(tiles(page)).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'More resources' })).toBeVisible()
  await page.goto(`${PAGE}?case=inconsistent`)
  await page.getByRole('button', { name: 'More resources' }).click()
  await expect(page.locator('.resources-partial')).toContainText('couldn’t be read consistently')
  await expect(tiles(page)).toHaveCount(3)
})

for (const status of [401, 403, 404]) {
  test(`refused (${String(status)}) with a body that never ends: said at once, nothing read shown`, async ({
    page,
  }) => {
    await page.goto(`${PAGE}?case=refused&status=${String(status)}`)
    await expect(page.locator('.resources-read')).toHaveAttribute('data-read', 'refused', { timeout: 2000 })
    await expect(page.locator('.resources-read')).toContainText(
      status === 401 ? 'Your session has ended.' : 'can’t be read with your access',
    )
    await expect(tiles(page)).toHaveCount(0)
    // Never repeated by itself: no read follows the refusal.
    const asked = await page.evaluate(() => window.nativeFixture?.requests.length ?? 0)
    await page.waitForTimeout(1000)
    expect(await page.evaluate(() => window.nativeFixture?.requests.length ?? 0)).toBe(asked)
  })
}

test('a refusal on the second page clears every row read before, at once', async ({ page }) => {
  await page.goto(`${PAGE}?case=refused2`)
  await expect(tiles(page)).toHaveCount(3)
  await page.getByRole('button', { name: 'More resources' }).click()
  await expect(page.locator('.resources-read')).toHaveAttribute('data-read', 'refused')
  await expect(tiles(page)).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(view(page)).not.toContainText('Davide')
})

test('a refused token is renewed once, and the read goes on with the new one', async ({ page }) => {
  await page.goto(`${PAGE}?case=renew`)
  await expect(tiles(page)).toHaveCount(6)
  // Its first token refused, renewed once, then read: one refused read and one answered, never a third.
  const subjects = await page.evaluate(() => window.nativeFixture?.requests.map((r) => r.subject) ?? [])
  expect(new Set(subjects)).toEqual(new Set(['00000000-0000-4000-8000-00000000d001']))
  expect(subjects.length).toBeLessThanOrEqual(4)
})

test('failed, unavailable, empty and loading are each their own: none says an empty catalog but empty', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=failed`)
  await expect(page.locator('.resources-read')).toHaveText(/Couldn’t read the resources\.\s*Try again/)
  await page.goto(`${PAGE}?case=unavailable`)
  await expect(page.locator('.resources-read')).toContainText('Resources can’t be read here right now.')
  await expect(page.locator('main')).not.toContainText(/Coming/i)
  await page.goto(`${PAGE}?case=empty`)
  await expect(page.locator('main')).toContainText('No tool is enrolled for this project yet.')
  await expect(view(page).locator('.view-head .count')).toHaveText('0')
  // How one comes to be listed, and no way offered here that doesn't exist (UX04).
  await expect(page.locator('main')).toContainText(
    'Each owner enrolls their own tool from the computer it runs on; Studio doesn’t enroll tools.',
  )
  await expect(view(page).getByRole('button')).toHaveCount(0)
  await expect(view(page).getByRole('link')).toHaveCount(0)
  await page.goto(`${PAGE}?case=loading`)
  await expect(page.getByText('Reading the resources…')).toBeAttached()
  await expect(view(page).locator('.view-head .count')).toHaveText('–')
})

test('a read whose owner and reader disagree is a failed read, never rows shown', async ({ page }) => {
  await page.goto(`${PAGE}?case=bad`)
  await expect(page.locator('.resources-read')).toHaveAttribute('data-read', 'failed')
  await expect(tiles(page)).toHaveCount(0)
})

test('another account: a late answer for the last never shows its rows or its facts', async ({ page }) => {
  await page.goto(`${PAGE}?case=more`)
  await expect(tiles(page)).toHaveCount(3)
  await page.evaluate(() => window.nativeFixture?.hold())
  await page.getByRole('button', { name: 'More resources' }).click()
  await page.evaluate(() => window.nativeFixture?.switchAccount())
  // Luis's own read, from its first page: his one resource there is his.
  await expect(tiles(page)).toHaveCount(3)
  await expect(tiles(page).filter({ hasText: 'You' })).toHaveCount(1)
  await expect(tiles(page).filter({ hasText: 'You' })).toContainText('Luis')
  // Davide's held page answers now, late: Luis's view takes none of it, and none of Davide's facts.
  await page.evaluate(() => window.nativeFixture?.release('page2'))
  await page.waitForTimeout(300)
  await expect(tiles(page)).toHaveCount(3)
  expect(await page.content()).not.toContain('Connection linked')
})

test('another project: the last one’s rows go at once, and its late answer is never taken', async ({ page }) => {
  await page.goto(`${PAGE}?case=more`)
  await page.evaluate(() => window.nativeFixture?.hold())
  await page.getByRole('button', { name: 'More resources' }).click()
  await page.evaluate(() => window.nativeFixture?.switchProject())
  await expect(tiles(page)).toHaveCount(1)
  await page.evaluate(() => window.nativeFixture?.release('page2'))
  await page.waitForTimeout(300)
  await expect(tiles(page)).toHaveCount(1)
})

test('keeps nothing of the catalog in this browser', async ({ page }) => {
  await page.goto(`${PAGE}?case=more`)
  await page.getByRole('button', { name: 'More resources' }).click()
  await expect(tiles(page)).toHaveCount(6)
  await page.getByRole('tab', { name: /Mine/ }).click()
  await tiles(page).first().click()
  await page.keyboard.press('Escape')
  const kept = await page.evaluate(() =>
    JSON.stringify({
      ...Object.fromEntries(Object.entries(localStorage)),
      ...Object.fromEntries(Object.entries(sessionStorage)),
    }),
  )
  expect(kept).not.toContain('10000000-0000-4000-8000')
  expect(kept).not.toContain('catalog')
})

test('@phone the catalog at 390: tiles, the owner’s sheet, More and a refusal fit and work by touch', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=more`)
  await expect(tiles(page)).toHaveCount(3)
  await page.getByRole('button', { name: 'More resources' }).tap()
  await expect(tiles(page)).toHaveCount(6)
  await tiles(page).filter({ hasText: 'Host recorded' }).first().tap()
  await expect(sheet(page)).toContainText('Recorded qualification: current')
  const box = await sheet(page).boundingBox()
  expect(box?.width ?? 0).toBeLessThanOrEqual(390)
  await page.goto(`${PAGE}?case=refused&status=404`)
  await expect(page.locator('.resources-read')).toContainText('can’t be read with your access')
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scroll).toBeLessThanOrEqual(390)
})

// DES002-F01 (repair 001): an empty first page that says more follows is never an empty catalog. Only an observed
// complete empty catalog says no tool is enrolled; the incumbent panel's own empty words stay for known data.
const ENROLLED = 'No tool is enrolled for this project yet.'

async function readsIncomplete(page: Page) {
  await expect(page.locator('.resources-read')).toHaveAttribute('data-read', 'incomplete')
  await expect(page.locator('.resources-read')).toContainText(
    'The resources couldn’t be read in full, so none is shown.',
  )
  await expect(page.locator('.resources-read time')).toHaveAttribute('datetime', '2026-11-12T14:00:00.000Z')
  await expect(page.locator('main')).not.toContainText(ENROLLED)
  await expect(view(page).locator('.view-head .count')).toHaveText('–')
  await expect(tiles(page)).toHaveCount(0)
  // The partial line under tiles is not said again beside it.
  await expect(page.locator('.resources-partial')).toHaveCount(0)
}

test('an empty first page that says more follows reads incomplete, never no tool enrolled; Try again reads again', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=emptyfirst`)
  await readsIncomplete(page)
  const asked = await page.evaluate(() => window.nativeFixture?.requests.length ?? 0)
  const again = page.getByRole('button', { name: 'Try again' })
  await again.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => window.nativeFixture?.requests.length ?? 0)).toBeGreaterThan(asked)
  await readsIncomplete(page)
})

test('controls: a complete empty catalog and the known-data empty panel say no tool is enrolled, nothing else', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=empty`)
  await expect(page.locator('main')).toContainText(ENROLLED)
  await expect(page.locator('.resources-read')).toHaveCount(0)
  await expect(view(page).locator('.view-head .count')).toHaveText('0')
  await page.goto(`${PAGE}?case=known-empty`)
  await expect(page.locator('main')).toContainText(ENROLLED)
  await expect(page.locator('.resources-read')).toHaveCount(0)
  await expect(page.locator('.resources-summary')).toHaveText('0 hosts online · nothing waiting')
})

test('control: a later page that fails keeps the rows read, partial, and never says no tool is enrolled', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=partial`)
  await page.getByRole('button', { name: 'More resources' }).click()
  await expect(page.locator('.resources-partial')).toContainText('couldn’t read the rest.')
  await expect(tiles(page)).toHaveCount(3)
  await expect(page.locator('main')).not.toContainText(ENROLLED)
  await expect(page.locator('.resources-read')).toHaveCount(0)
})

test('@phone an empty first page at 390: the incomplete notice and Try again in view, no empty claim', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=emptyfirst`)
  await readsIncomplete(page)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeInViewport()
  await expect(page.locator('.resources-read')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.goto(`${PAGE}?case=empty`)
  await expect(page.locator('main')).toContainText(ENROLLED)
})

// UX iteration 001 (docs/plans/inc01-resources-service-adapter.md): what the catalog is, said at every width; search and
// counts as far as read; the cue before the tiles; recovery that does what it asks; the owner's evidence closed and a
// teammate's absent; contrast measured on the actual surfaces.

test('the catalog says what it is in every state, and the richer sources keep their own words', async ({ page }) => {
  for (const q of ['case=loading', 'case=failed', 'case=unavailable', 'case=refused&status=404', 'case=emptyfirst']) {
    await page.goto(`${PAGE}?${q}`)
    await expect(view(page).locator('.resources-scope'), q).toHaveText(SCOPE)
    await expect(view(page).locator('.resources-scope'), q).toHaveCount(1)
  }
  await page.goto(`${PAGE}?case=complete`)
  await expect(page.getByRole('searchbox', { name: 'Search resources' })).toHaveAttribute(
    'placeholder',
    'Search tools or owners…',
  )
  // Known data keeps its summary and its wider search, and is never called the catalog.
  await page.goto(`${PAGE}?case=known-empty`)
  await expect(page.locator('.resources-scope')).toHaveCount(0)
  await page.goto('/resources.html')
  await expect(page.locator('.resource-tile').first()).toBeVisible()
  await expect(page.locator('.resources-scope')).toHaveCount(0)
  await expect(page.locator('.resources-summary')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search resources' })).toHaveAttribute(
    'placeholder',
    'Search tools, owners, work…',
  )
})

test('search covers the loaded rows: no match is said of those, More reads on with the search kept', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=more`)
  await expect(tiles(page)).toHaveCount(3)
  await expect(page.getByRole('tablist', { name: 'Show loaded' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search resources' }).fill('unknown')
  const none = page.locator('.resources-none')
  await expect(none).toHaveAttribute('data-none', 'loaded')
  await expect(none).toContainText('Nothing loaded matches “unknown”. More resources aren’t read yet.')
  await expect(page.locator('main')).not.toContainText('Nothing matches')
  const asked = await page.evaluate(() => window.nativeFixture?.requests.filter((r) => r.after !== null).length ?? 0)
  await none.getByRole('button', { name: 'More resources' }).click()
  // The next page, by the original cursor, once; the search still there, and its match now shown.
  await expect(tiles(page)).toHaveCount(1)
  await expect(tiles(page)).toContainText('Unknown name')
  await expect(page.getByRole('searchbox', { name: 'Search resources' })).toHaveValue('unknown')
  const after = await page.evaluate(() => window.nativeFixture?.requests.filter((r) => r.after !== null) ?? [])
  expect(after.length).toBe(asked + 1)
  expect(after.at(-1)?.after).toBe('10000000-0000-4000-8000-000000000003')
  await expect(page.getByRole('tablist', { name: 'Show' })).toBeVisible()
  // Read in full now: no match is said of the whole catalog.
  await page.getByRole('searchbox', { name: 'Search resources' }).fill('zzz')
  await expect(none).toHaveAttribute('data-none', 'all')
  await expect(none).toContainText('Nothing matches “zzz”')
})

test('a filter with none loaded, after a later page failed: said of the loaded rows, with Try again', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=partial&viewer=luis`)
  await page.getByRole('button', { name: 'More resources' }).click()
  await expect(page.locator('.resources-partial')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search resources' }).fill('claude code luis')
  const none = page.locator('.resources-none')
  await expect(none).toContainText('Nothing loaded matches “claude code luis”. The rest couldn’t be read.')
  const asked = await page.evaluate(() => window.nativeFixture?.requests.length ?? 0)
  await none.getByRole('button', { name: 'Try again' }).click()
  await expect.poll(() => page.evaluate(() => window.nativeFixture?.requests.length ?? 0)).toBeGreaterThan(asked)
})

test('the partial cue comes before the toolbar and tiles, once, and the 401 offers what it asks', async ({ page }) => {
  await page.goto(`${PAGE}?case=partial`)
  await page.getByRole('button', { name: 'More resources' }).click()
  await expect(page.locator('.resources-partial')).toHaveCount(1)
  const above = await page.evaluate(() => {
    const cue = document.querySelector('.resources-cue')
    const bar = document.querySelector('.resources-toolbar')
    return !!cue && !!bar && (cue.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  })
  expect(above).toBe(true)
  await expect(page.getByRole('status').filter({ hasText: 'couldn’t read the rest' })).toHaveCount(1)
  // Without the app's way (this page by itself): Try again. With it: Sign in again, which only a press starts.
  await page.goto(`${PAGE}?case=refused&status=401`)
  await expect(page.locator('.resources-read').getByRole('button')).toHaveText('Try again')
  await page.goto(`${PAGE}?case=refused&status=401&signin=app`)
  const signIn = page.locator('.resources-read').getByRole('button', { name: 'Sign in again' })
  await expect(signIn).toBeVisible()
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.nativeFixture?.signIns)).toBe(0)
  const asked = await page.evaluate(() => window.nativeFixture?.requests.length ?? 0)
  // Pressed, it asks first (REC01): what signing out of this device ends and removes, Stay here focused.
  await signIn.focus()
  await page.keyboard.press('Enter')
  const choice = page.locator('.resources-read').getByRole('group', { name: 'Sign in again' })
  await expect(choice).toContainText(SIGN_IN_WARNING)
  await expect(choice.getByRole('button', { name: 'Stay here' })).toBeFocused()
  expect(await page.evaluate(() => window.nativeFixture?.signIns)).toBe(0)
  // A second Enter keeps: nothing signed out, nothing read, the refusal and its way back as they were.
  await page.keyboard.press('Enter')
  await expect(choice).toHaveCount(0)
  await expect(signIn).toBeFocused()
  expect(await page.evaluate(() => window.nativeFixture?.signIns)).toBe(0)
  // Only Sign out and continue starts it, once.
  await signIn.click()
  await choice.getByRole('button', { name: 'Sign out and continue' }).click()
  expect(await page.evaluate(() => window.nativeFixture?.signIns)).toBe(1)
  expect(await page.evaluate(() => window.nativeFixture?.requests.length ?? 0)).toBe(asked)
  await expect(tiles(page)).toHaveCount(0)
  // 403 and 404 never ask to sign in: access, said as such.
  for (const status of [403, 404]) {
    await page.goto(`${PAGE}?case=refused&status=${String(status)}&signin=app`)
    await expect(page.locator('.resources-read')).toContainText('can’t be read with your access')
    await expect(page.getByRole('button', { name: 'Sign in again' })).toHaveCount(0)
  }
})

test('stepping from an opened owner’s evidence: the next resource’s starts closed, a teammate’s has none', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=complete`)
  await tiles(page).filter({ hasText: 'Host recorded' }).first().click()
  await sheet(page).getByText(EVIDENCE).click()
  await expect(sheet(page).locator('details.resource-evidence')).toHaveAttribute('open')
  const seen: string[] = []
  for (let i = 0; i < 5; i += 1) {
    await sheet(page).locator('.resource-connection, .resource-private').first().click()
    await page.keyboard.press('j')
    const evidence = sheet(page).locator('details.resource-evidence')
    const owned = (await sheet(page).locator('.resource-private').count()) === 0
    seen.push(owned ? 'own' : 'private')
    if (owned) await expect(evidence).not.toHaveAttribute('open')
    else await expect(evidence).toHaveCount(0)
  }
  expect(seen).toContain('private')
  expect(seen).toContain('own')
})

test('the changed words read against their actual surfaces (measured, 4.5:1 floor)', async ({ page }) => {
  await page.goto(`${PAGE}?case=partial`)
  await page.getByRole('button', { name: 'More resources' }).click()
  await expect(page.locator('.resources-partial')).toBeVisible()
  expect(await lowContrast(page, '.resources-scope')).toEqual([])
  expect(await lowContrast(page, '.resources-cue')).toEqual([])
  await page.goto(`${PAGE}?case=complete`)
  await tiles(page).filter({ hasText: 'Host recorded' }).first().click()
  await sheet(page).getByText(EVIDENCE).click()
  expect(await lowContrast(page, '.resource-catalog')).toEqual([])
  expect(await lowContrast(page, '.resource-unreported-group')).toEqual([])
})

test('@phone at 390 the scope and the partial cue show before any tile, and More and Try again are in reach', async ({
  page,
}) => {
  await page.goto(`${PAGE}?case=more`)
  await expect(tiles(page)).toHaveCount(3)
  await expect(page.locator('.resources-scope')).toBeInViewport()
  await expect(page.locator('.resources-cue')).toBeInViewport()
  await expect(page.locator('.resources-cue')).toContainText('3 loaded · more not read yet')
  const cueBottom = await page.locator('.resources-cue').evaluate((e) => e.getBoundingClientRect().bottom)
  const tileTop = await tiles(page)
    .first()
    .evaluate((e) => e.getBoundingClientRect().top)
  expect(cueBottom).toBeLessThan(tileTop)
  await page.locator('.resources-cue').getByRole('button', { name: 'More resources' }).tap()
  await expect(tiles(page)).toHaveCount(6)
  await page.goto(`${PAGE}?case=partial`)
  await page.getByRole('button', { name: 'More resources' }).tap()
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(page.locator('.resources-partial')).toBeInViewport()
  await expect(page.locator('.resources-partial').getByRole('button', { name: 'Try again' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  // The owner's evidence opens by touch, and fits.
  await page.goto(`${PAGE}?case=complete`)
  await tiles(page).filter({ hasText: 'Host recorded' }).first().tap()
  await sheet(page).getByText(EVIDENCE).tap()
  await expect(sheet(page).getByText('Handshake recorded')).toBeVisible()
  expect((await sheet(page).boundingBox())?.width ?? 0).toBeLessThanOrEqual(390)
})
