import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Locator, type Page } from '@playwright/test'
import { DESIGNED, LONG_HEADING } from '../fixtures/report-data.ts'
import { reaches } from './reach.ts'
import { typeSizes } from './type-sizes.ts'

// The report viewer over the room (SMC-M03), on the fixture page: the Studio's own ProjectShell with the fixture report
// (fixtures/report-data.ts). Each check holds one of LFE-02.1's findings fixed; only the API and LiveKit are faked, and
// each check ends by asking the page whether anything reached for the API beyond what it answers.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const V1 = '00000000-0000-4000-8000-0000000000d1'
const V2 = '00000000-0000-4000-8000-0000000000d2'
const V3 = '00000000-0000-4000-8000-0000000000d3'
const CITED = '00000000-0000-4000-8000-0000000000c9'
const IN_CALL = '/room.html?call=on&exchange=open'
const FIRST = 'The first version of a labelled fixture report.'
const SECOND = 'The second version of a labelled fixture report, published while the first was read.'
const THIRD = 'The third version of a labelled fixture report, its citation written as a link.'
/** The fixture report's title with `title=long`. */
const LONG =
  'A labelled fixture report whose title runs on far past the width of the side pane, so that its head has to cut it short'
/** The pane's head controls, left to right (in the room). */
const HEAD = ['Download', 'Enlarge', 'Chat', 'Close'] as const

const fixture = (page: Page) =>
  page.evaluate(() => {
    const view = window.fixture
    if (!view) throw new Error('the fixture page did not start')
    return { asked: [...view.asked], served: [...view.served], unexpected: [...view.unexpected] }
  })
const asked = async (page: Page) => (await fixture(page)).asked
const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })

/** Whether nothing covers the middle of what `locator` names: a tap there reaches it. */
const onTop = (locator: Locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
  })
const door = (page: Page) => page.getByRole('complementary', { name: 'Waiting to come in' })

/** Whether what `locator` names lies wholly inside what `outer` names, to half a pixel. */
async function within(locator: Locator, outer: Locator): Promise<boolean> {
  const [a, b] = await Promise.all([locator.boundingBox(), outer.boundingBox()])
  if (!a || !b) return false
  const e = 0.5
  return a.x >= b.x - e && a.y >= b.y - e && a.x + a.width <= b.x + b.width + e && a.y + a.height <= b.y + b.height + e
}

/** Whether the pane's title is cut: its text runs past the room the head gives it. */
const cut = (page: Page) => page.locator('#report-pane-title').evaluate((el) => el.scrollWidth > el.clientWidth)

/** Each of the head's controls lies in the pane and on screen, with nothing over it. */
async function headInReach(side: Locator) {
  for (const name of HEAD) {
    const control = side.getByRole('button', { name, exact: true })
    expect(await within(control, side), `${name} in the pane`).toBe(true)
    await expect(control, `${name} on screen`).toBeInViewport({ ratio: 1 })
    expect(await onTop(control), `${name} uncovered`).toBe(true)
  }
}

/** A link to a version of the fixture report followed in the page: the address moves, as Back and Forward move it. */
const follow = (page: Page, versionId: string) =>
  page.evaluate(
    ([report, version]) => {
      window.history.pushState(null, '', `/room.html?report=${report}&version=${version}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    [REPORT, versionId],
  )

/** The pane with no version to hand: no title of its own. */
const untitled = (page: Page) => page.getByRole('complementary', { name: 'Report', exact: true })

/** Opens the page and, in a call, waits for it: connected, and the microphone arrived. */
async function enter(page: Page, url: string) {
  await page.goto(url)
  if (!url.includes('call=on')) return
  await expect(leave(page)).toBeAttached()
  await expect.poll(() => asked(page)).toContain('microphone:on')
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect((await fixture(page)).unexpected, 'requests the fixture did not expect').toEqual([])
})

test('ART-02 · a report opened on its current version keeps it when a newer one is published, and offers that one', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`version=${V1}`)) // the version being read is named, in place

  await page.evaluate(() => window.fixture?.publishReport())
  // The window's focus comes back: the viewer reads the report's versions again, as it does in use.
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(async () => (await fixture(page)).served).toContain('versions:2')
  const offer = pane(page).getByText('v2 is the current version.')
  await expect(offer).toBeVisible()
  await expect(pane(page).getByText(FIRST)).toBeVisible() // never swapped in under the reader

  await pane(page).getByRole('button', { name: 'Show it' }).click()
  await expect(pane(page).getByText(SECOND)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`version=${V2}`))
  await expect(offer).toHaveCount(0)
  await expect(page.locator('#report-pane-title')).toBeFocused() // "Show it" went with the offer: the title has it
})

test('LFE-02.1 · a citation shows its source with the focus on it, once', async ({ page }) => {
  await enter(page, `/room.html?report=${REPORT}`)
  await pane(page).getByRole('button', { name: 'Source 1' }).click()
  const row = pane(page).locator(`#source-${CITED}`)
  await expect(pane(page).getByRole('tab', { name: /^Sources/ })).toHaveAttribute('aria-selected', 'true')
  await expect(row).toBeFocused() // the citation's button went with the Document tab: its source has the focus
  await expect(row.getByText('Citation 1')).toBeAttached() // said, though the number is drawn for the eye
  // A tab chosen afterwards shows the list as it is: the old citation is not shown and focused again.
  await pane(page).getByRole('tab', { name: 'Document' }).click()
  await pane(page)
    .getByRole('tab', { name: /^Sources/ })
    .click()
  await expect(row).not.toHaveAttribute('data-focused')
  await expect(row).not.toBeFocused()
})

test('M03-RF-0022 · a citation whose source comes late hands it the focus while nothing else has it', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}&hold=sources`)
  await pane(page).getByRole('button', { name: 'Source 1' }).click()
  await expect(pane(page).getByText('Loading the sources…')).toBeVisible()
  await page.evaluate(() => window.fixture?.releaseSources())
  await expect(pane(page).locator(`#source-${CITED}`)).toBeFocused() // the citation's button went: nobody had it
})

test('M03-RF-0022 · a citation whose source comes late never takes the focus from where the person moved it', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}&hold=sources`)
  await pane(page).getByRole('button', { name: 'Source 1' }).click()
  await expect(pane(page).getByText('Loading the sources…')).toBeVisible()
  await page.getByRole('button', { name: 'Account' }).click()
  const signOut = page.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: 'Sign out' })
  await signOut.focus() // the person moved on before the source came
  await page.evaluate(() => window.fixture?.releaseSources())
  const row = pane(page).locator(`#source-${CITED}`)
  await expect(row).toHaveAttribute('data-focused', 'true') // shown, as the citation asked
  await expect(signOut).toBeFocused()
  // Still Sign out's once the row has settled: the row would take it as its effect runs, after it is drawn.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 100))))
  await expect(signOut).toBeFocused()
})

test('LFE-02.1 · History keeps the focus on what was pressed: a version shown, a comparison opened and closed', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await page.evaluate(() => window.fixture?.publishReport())
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(pane(page).getByText('v2 is the current version.')).toBeVisible()
  await pane(page)
    .getByRole('tab', { name: /^History/ })
    .click()
  const v2 = pane(page).locator('.report-history > li').filter({ hasText: 'v2' })

  const show = v2.getByRole('button', { name: 'Show this version' })
  await show.click()
  await expect(page).toHaveURL(new RegExp(`version=${V2}`))
  const onScreen = v2.getByRole('button', { name: 'On screen' })
  await expect(onScreen).toBeFocused() // in place, not removed from under the focus
  await expect(onScreen).toHaveAttribute('aria-disabled', 'true')

  const compare = v2.getByRole('button', { name: 'Compare with the version before' })
  await compare.click()
  await expect(pane(page).getByRole('heading', { name: 'v1 → v2, by section' })).toBeFocused()
  await pane(page).getByRole('region', { name: 'v1 to v2' }).getByRole('button', { name: 'Close' }).click()
  await expect(compare).toBeFocused()
})

test('LFE-02.1 · a version that is gone is said on every tab, never a list that looks current', async ({ page }) => {
  await enter(page, `/room.html?report=${REPORT}&version=00000000-0000-4000-8000-0000000000d9`)
  const gone = untitled(page)
  await expect(gone.getByText('This version isn’t available.')).toBeVisible()
  await gone.getByRole('tab', { name: /^History/ }).click()
  await expect(gone.getByText('This version isn’t available.')).toBeVisible()
  await expect(gone.locator('.report-history')).toHaveCount(0)
  await gone.getByRole('tab', { name: /^Sources/ }).click()
  await expect(gone.getByText('This version isn’t available.')).toBeVisible()
  await gone.getByRole('button', { name: 'Show the current version, v1' }).click() // never a dead end
  await expect(pane(page).getByText('A labelled fixture page')).toBeVisible() // v1's sources, on the tab in view
  await expect(page.locator('#report-pane-title')).toBeFocused() // the button went once pressed: the title has it
})

test('LFE-02.1 · a report open in a project kept for its call stays closed once the person comes back from home', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await page.evaluate(() => window.fixture?.away()) // home: the project is kept out of sight, the address is the places'
  await expect(page.locator('.shell')).toBeHidden()
  await page.keyboard.press('Escape') // out of sight, the project takes no keys: the places' entry is left alone
  expect(new URL(page.url()).search).toBe('?place=home')
  expect(await page.evaluate(() => window.history.state as unknown)).toEqual({ fixture: 'home' })
  await page.evaluate(() => window.fixture?.back()) // back by the places' call control: no report in the address
  await expect(page.locator('.shell')).toBeVisible()
  await expect(pane(page)).toHaveCount(0)
})

test('LFE-02.1 · the report’s tabs are a tab row: one stop for Tab, arrow keys, Home and End between them', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}`)
  const tab = (name: RegExp) => pane(page).getByRole('tab', { name })
  await expect(tab(/^Document/)).toHaveAttribute('tabindex', '0')
  await expect(tab(/^Sources/)).toHaveAttribute('tabindex', '-1')
  await tab(/^Document/).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tab(/^Sources/)).toBeFocused()
  await expect(tab(/^Sources/)).toHaveAttribute('aria-selected', 'true')
  await expect(pane(page).getByRole('tabpanel', { name: /^Sources/ })).toBeVisible()
  await page.keyboard.press('End')
  await expect(tab(/^History/)).toBeFocused()
  await page.keyboard.press('Home')
  await expect(tab(/^Document/)).toBeFocused()
})

test('LFE-02.1 · a PDF asked for that the version lacks: the pane says its Markdown is shown instead', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}&format=pdf`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await expect(pane(page).getByRole('note')).toHaveText('This version has no PDF, so its Markdown is shown.')
})

test('LFE-02.1 · a result notice marks Chat; closing the report it opened hands the focus to Chat', async ({
  page,
}) => {
  await enter(page, IN_CALL)
  await page.evaluate(() => window.fixture?.notice()) // the chat is closed: the notice is unread
  const marked = page.getByRole('button', { name: 'Chat, something new', exact: true })
  await expect(marked).toBeVisible()
  await marked.click()
  const card = page.getByRole('group', { name: 'Research report ready' })
  await card.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(pane(page).getByText(FIRST)).toBeVisible() // the chat gave way to the report
  await expect(page.locator('#report-pane-title')).toBeFocused() // the pane's title, as it opens

  await pane(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(pane(page)).toHaveCount(0)
  // The notice's Open went out of sight with the chat: the toggle that brings the chat back has the focus.
  await expect(page.getByRole('button', { name: 'Chat', exact: true })).toBeFocused()
})

test('LFE-02.1 · a message that arrives while a report covers the corner marks the pane’s own Chat', async ({
  page,
}) => {
  await enter(page, `${IN_CALL}&report=${REPORT}`)
  await pane(page).getByRole('button', { name: 'Enlarge' }).click() // the full page covers the corner's toggles
  await page.evaluate(() => window.fixture?.say('Written while the report is read'))
  await expect(pane(page).getByRole('button', { name: 'Chat, something new', exact: true })).toBeVisible()
})

test('LFE-02.1 · the chat opened in the report’s place keeps the focus it moved to its message bar', async ({
  page,
}) => {
  await enter(page, IN_CALL)
  await page.evaluate(() => window.fixture?.notice())
  await page.getByRole('button', { name: 'Chat, something new', exact: true }).click()
  await page
    .getByRole('group', { name: 'Research report ready' })
    .getByRole('button', { name: 'Open', exact: true })
    .click()
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await pane(page).getByRole('button', { name: 'Chat', exact: true }).click() // the chat in the report's place
  await expect(pane(page)).toHaveCount(0)
  // Not handed back to the notice's Open, now on screen again: the panel moved the focus in, and keeps it.
  await expect(page.getByRole('textbox', { name: 'Message Sophia', exact: true })).toBeFocused()
})

test('LFE-02.1 · the top bar’s menus open over a report, beside the room and over the full page', async ({ page }) => {
  await enter(page, `/room.html?report=${REPORT}`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  const account = page.getByRole('button', { name: 'Account' })
  const signOut = page.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: 'Sign out' })
  await account.click()
  expect(await onTop(signOut), 'beside: the menu over the side pane').toBe(true)
  await account.click()
  await pane(page).getByRole('button', { name: 'Enlarge' }).click()
  await account.click()
  expect(await onTop(signOut), 'over the full page').toBe(true)
})

test('LFE-02.1 · the full page covers the dock, so the call’s switches come under its head', async ({ page }) => {
  await enter(page, `${IN_CALL}&report=${REPORT}&lobby=waiting`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  // Beside the room the dock keeps them: the pane does not repeat them.
  await expect(pane(page).getByRole('button', { name: 'Microphone' })).toBeHidden()
  await expect(leave(page)).toBeInViewport()
  expect(await onTop(door(page)), 'the door keeps clear of the pane').toBe(true)

  await pane(page).getByRole('button', { name: 'Enlarge' }).click()
  const mute = pane(page).getByRole('button', { name: 'Microphone' })
  await expect(mute).toBeInViewport()
  // Someone at the door is let in from over the full page, under its head: Close and the switches stay in reach.
  expect(await onTop(door(page)), 'the door over the full page').toBe(true)
  expect(await onTop(mute), 'the microphone under the head').toBe(true)
  expect(await onTop(pane(page).getByRole('button', { name: 'Back to side panel' })), 'the head').toBe(true)
  expect(await onTop(pane(page).getByRole('tab', { name: 'Document' })), 'the tabs').toBe(true)
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await mute.click()
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  expect((await asked(page)).at(-1)).toBe('microphone:off')
})

test('LFE-02.1 @phone · a report over the room keeps mute, sending and the door in reach', async ({ page }) => {
  await enter(page, `${IN_CALL}&report=${REPORT}&lobby=waiting`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  const mute = pane(page).getByRole('button', { name: 'Microphone' })
  await expect(mute).toBeInViewport()
  // The pane covers the room on a phone: the door comes over it, under its head and the switches.
  expect(await onTop(door(page)), 'the door over the pane').toBe(true)
  expect(await onTop(mute), 'the microphone').toBe(true)
  expect(await onTop(pane(page).getByRole('button', { name: 'Close', exact: true })), 'Close').toBe(true)
  expect(await onTop(pane(page).getByRole('tab', { name: 'Document' })), 'the tabs').toBe(true)
  await expect(mute).toHaveAttribute('aria-pressed', 'true') // sending: the microphone is on
  await mute.click() // a tap reaches it: nothing covers it
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  expect((await asked(page)).at(-1)).toBe('microphone:off')
  await expect(pane(page).getByRole('button', { name: 'Close', exact: true })).toBeInViewport()
})

test('LFE-02.1 · a description edit never overwrites a teammate’s newer one, and the focus follows the form', async ({
  page,
}) => {
  await enter(page, '/room.html?place=knowledge')
  const card = page.getByRole('listitem').filter({ hasText: 'Fixture report' })
  await expect(card.getByText('A labelled fixture report, as Sophia described it.')).toBeVisible()
  const edit = card.getByRole('button', { name: 'Edit', exact: true })
  await edit.click()
  const field = card.getByRole('textbox', { name: 'Description' })
  await expect(field).toBeFocused() // Edit moves the focus to the text
  await field.press('Escape')
  await expect(edit).toBeFocused() // and leaving the form hands it back

  await edit.click()
  await field.fill('My own description')
  // Meanwhile a teammate saves theirs, and the cards are read again (the window's focus comes back).
  await page.evaluate(() => window.fixture?.describeElsewhere('A teammate’s description'))
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.getByRole('alert')).toContainText('Someone changed this description since you opened it.')
  await expect(card.getByText('A teammate’s description')).toBeVisible() // theirs is shown, not overwritten
  await expect(edit).toBeFocused()
})

test('LFE-02.1 · More reports keeps the focus while the page loads, then hands it to the first card it brought', async ({
  page,
}) => {
  await enter(page, '/room.html?place=knowledge')
  await expect(page.getByRole('button', { name: 'Fixture report' })).toBeVisible()
  await page.getByRole('button', { name: 'More reports' }).click()
  // The last page: the button goes, and the focus is on the report it brought, never dropped to the page.
  await expect(page.getByRole('button', { name: 'An older fixture report' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'More reports' })).toHaveCount(0)
})

test('No-PDF release · Knowledge offers no PDF filter while no report has a PDF; an empty search says so', async ({
  page,
}) => {
  await enter(page, '/room.html?place=knowledge')
  await expect(page.getByRole('button', { name: 'Fixture report' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Format' })).toHaveCount(0) // no report on the first page has a PDF
  const search = page.getByRole('searchbox', { name: 'Search reports' })
  await search.fill('nothing like this')
  await expect(page.getByText('No reports match these filters.')).toBeVisible()
  await expect(page.getByText(/No reports here yet/)).toHaveCount(0) // the reports exist: they are filtered out
  await page.getByRole('button', { name: 'Clear the filters' }).click()
  await expect(page.getByRole('button', { name: 'Fixture report' })).toBeVisible()
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused() // the button went with the empty list

  // Once a report with a PDF is in the list, the filter is offered: a filter, not tabs, so pressed buttons.
  await page.getByRole('button', { name: 'More reports' }).click()
  await expect(page.getByRole('button', { name: 'An older fixture report' })).toBeVisible()
  const formats = page.getByRole('group', { name: 'Format' })
  await expect(formats.getByRole('button', { name: 'Any format' })).toHaveAttribute('aria-pressed', 'true')
  await formats.getByRole('button', { name: 'With PDF' }).click()
  await expect(formats.getByRole('button', { name: 'With PDF' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'An older fixture report' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fixture report', exact: true })).toHaveCount(0)
  // A filter whose reports are still loading keeps the group, so the press keeps its focus (never dropped to the page).
  // Each search is waited for (the list says it), so Any format asks for words never asked for under it.
  await search.fill('nothing like this')
  await expect(page.getByText('No reports match these filters.')).toBeVisible()
  await search.fill('old')
  await expect(page.getByRole('button', { name: 'An older fixture report' })).toBeVisible()
  const any = formats.getByRole('button', { name: 'Any format' })
  await any.click()
  await expect(any).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'An older fixture report' })).toBeVisible()
  await expect(any).toBeFocused()
})

test('LFE-02.1 · a read again that fails keeps the report being read, never "not available"', async ({ page }) => {
  await enter(page, `/room.html?report=${REPORT}`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await page.evaluate(() => window.fixture?.failVersions())
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange'))) // the window's focus reads it again
  // The read is tried four times (three retries), then gives up.
  await expect
    .poll(async () => (await fixture(page)).served.filter((s) => s === 'versions:failed').length, { timeout: 20_000 })
    .toBe(4)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await expect(pane(page).getByText('This report isn’t available to you.')).toHaveCount(0)
  await expect(pane(page).getByText('couldn’t be loaded')).toHaveCount(0)
})

test('M03-RF-0021 · a version the list read earlier lacks, with the list failing to load, is said, with Try again', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}`)
  await expect(pane(page).getByText(FIRST)).toBeVisible() // the list read holds v1 only
  await page.evaluate(() => {
    window.fixture?.publishReport()
    window.fixture?.failVersions()
  })
  await follow(page, V2)
  // The list is read again for v2, four times (three retries), then the pane says so: never "Loading" for good.
  await expect(untitled(page).getByRole('alert')).toContainText('This version couldn’t be loaded.', { timeout: 20_000 })
  expect((await fixture(page)).served.filter((s) => s === 'versions:failed')).toHaveLength(4)
  await expect(untitled(page).getByText('This report isn’t available to you.')).toHaveCount(0) // not a refusal

  await page.evaluate(() => window.fixture?.failVersions(false))
  await untitled(page).getByRole('button', { name: 'Try again' }).click()
  await expect(pane(page).getByText(SECOND)).toBeVisible()
  await expect(page.locator('#report-pane-title')).toBeFocused() // the button went once pressed: the title has it
})

test('M03-RF-0021 · a version asked for after a read again failed is read for, not said failed from that error', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await page.evaluate(() => window.fixture?.failVersions())
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect
    .poll(async () => (await fixture(page)).served.filter((s) => s === 'versions:failed').length, { timeout: 20_000 })
    .toBe(4)
  await expect(pane(page).getByText(FIRST)).toBeVisible() // the failed read left its error; v1 stays
  await page.evaluate(() => {
    window.fixture?.publishReport()
    window.fixture?.failVersions(false)
  })
  await follow(page, V2)
  await expect(pane(page).getByText(SECOND)).toBeVisible() // read for v2, which the API now lists
  await expect(pane(page).getByText('couldn’t be loaded')).toHaveCount(0)
})

test('M03-RF-0021 · a report the API refuses is said as refused, never as a read to try again', async ({ page }) => {
  await enter(page, `/room.html?report=${REPORT}`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await page.evaluate(() => window.fixture?.failVersions('not_found')) // the person may no longer read it (a 422)
  await follow(page, V2)
  await expect(untitled(page).getByText('This report isn’t available to you.')).toBeVisible({ timeout: 20_000 })
  expect((await fixture(page)).served.filter((s) => s === 'versions:refused')).toHaveLength(4)
  await expect(untitled(page).getByRole('button', { name: 'Try again' })).toHaveCount(0)
})

test('LFE-02.1 · Esc held down steps down once, and pinning names the version in place, not as a new entry', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}&view=full`)
  await expect(page).toHaveURL(new RegExp(`version=${V1}`))
  await page.locator('#report-pane-title').focus()
  await page.keyboard.down('Escape')
  await expect(page.locator('.report-pane')).toHaveAttribute('data-size', 'side')
  await page.keyboard.down('Escape') // the key repeating while held
  await page.keyboard.up('Escape')
  await expect(page.locator('.report-pane')).toHaveAttribute('data-size', 'side') // still open: one press, one step
  // The pin replaced the opening entry (a blank page, then this one): no entry of the report without its version.
  expect(await page.evaluate(() => window.history.length)).toBe(2)
})

for (const width of [1024, 1280, 1440]) {
  test(`CX-0019 · at ${String(width)} px a long title is cut, and the head’s controls stay in the side pane and take a click`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await enter(page, `/room.html?report=${REPORT}&title=long`)
    const side = page.getByRole('complementary', { name: LONG })
    await expect(side.getByText(FIRST)).toBeVisible() // the text is checked: Download has its bytes
    expect(await cut(page), 'the title is cut, not the pane widened').toBe(true)
    await headInReach(side)

    // A mouse reaches each of them.
    await side.getByRole('button', { name: 'Download', exact: true }).click()
    await expect(side.getByText(/^Downloading fixture-report\.md/)).toBeVisible()
    await side.getByRole('button', { name: 'Enlarge', exact: true }).click()
    await expect(page.locator('.report-pane')).toHaveAttribute('data-size', 'full')
    await side.getByRole('button', { name: 'Back to side panel', exact: true }).click()
    await expect(page.locator('.report-pane')).toHaveAttribute('data-size', 'side')
    await side.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(side).toHaveCount(0)
  })
}

test('CX-0019 · with a long title, the current version’s offer and Close stay in the side pane', async ({ page }) => {
  await enter(page, `/room.html?report=${REPORT}&title=long`)
  const side = page.getByRole('complementary', { name: LONG })
  await expect(side.getByText(FIRST)).toBeVisible()
  await page.evaluate(() => window.fixture?.publishReport())
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(side.getByText('v2 is the current version.')).toBeVisible()
  for (const control of [
    side.getByRole('button', { name: 'Show it' }),
    side.getByRole('button', { name: 'Close', exact: true }),
  ]) {
    expect(await within(control, side)).toBe(true)
    await expect(control).toBeInViewport({ ratio: 1 })
  }
  await side.getByRole('button', { name: 'Show it' }).click()
  await expect(side.getByText(SECOND)).toBeVisible()
  await expect(page.locator('#report-pane-title')).toBeFocused()
})

test('CX-0019 @phone · a long title leaves Download, Enlarge, Chat and Close on screen, each a tap away', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}&title=long`)
  const side = page.getByRole('complementary', { name: LONG })
  await expect(side.getByText(FIRST)).toBeVisible()
  expect(await cut(page)).toBe(true)
  await headInReach(side)
  await side.getByRole('button', { name: 'Close', exact: true }).tap()
  await expect(side).toHaveCount(0)
})

test('CX-0019 · Download waits for the checked bytes without dropping the focus: aria-disabled, never disabled', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}&hold=text`)
  const download = pane(page).getByRole('button', { name: 'Download', exact: true })
  await expect(pane(page).getByText('Loading the report…')).toBeVisible()
  await expect(download).toHaveAttribute('aria-disabled', 'true')
  await expect(download).not.toHaveAttribute('disabled')
  await download.focus()
  await expect(download).toBeFocused() // it can be reached, and a press does nothing yet: no file is saved
  const early = page.waitForEvent('download', { timeout: 1000 }).then(
    () => true,
    () => false,
  )
  await page.keyboard.press('Enter')
  expect(await early).toBe(false)
  await expect(pane(page).locator('.report-status')).toHaveText('') // the head's line

  await page.evaluate(() => window.fixture?.releaseText())
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await expect(download).not.toHaveAttribute('aria-disabled')
  await expect(download).toBeFocused() // kept through the load
  const saved = page.waitForEvent('download')
  await page.keyboard.press('Enter')
  expect((await saved).suggestedFilename()).toBe('fixture-report.md')
  await expect(pane(page).locator('.report-status')).toHaveText(/^Downloading fixture-report\.md/)
})

test('CX-0019 · History names the recommendations, not the conclusion, when only they changed', async ({ page }) => {
  await enter(page, `/room.html?report=${REPORT}&versions=2&version=${V2}`)
  await expect(pane(page).getByText(SECOND)).toBeVisible()
  await pane(page)
    .getByRole('tab', { name: /^History/ })
    .click()
  const v2 = pane(page).locator('.report-history > li').filter({ hasText: 'v2' })
  await expect(v2.locator('.report-chips')).toContainText('Recommendations changed')
  await expect(v2.locator('.report-chips')).not.toContainText('Conclusion changed')
  await v2.getByRole('button', { name: 'Compare with the version before' }).click()
  const region = pane(page).getByRole('region', { name: 'v1 to v2' })
  await expect(region.locator('dt')).toHaveText(['Revised', 'Unchanged', 'Recommendations'])
  await expect(region.locator('dd')).toHaveText(['“Fixture report”, “Recommendations”', '“Conclusion”', 'Changed'])
})

/** The pilot-shaped v2's facts line (`history=pilot`, CX-0026): what the History entry says first. */
const PILOT_FACTS =
  'Compared with v1: 7 sections removed: “Summary”, “Compatibility and standards”, “Charging speed in practice”, ' +
  '“Product claims vs. evidence”, “Comparison table”, “Recommendations for buyers”, “Limitations of this review”; ' +
  '2 added: “Revised recommendations”, “Sources”. Cited sources: 5 dropped.'
/** Its notes, which say the rest was kept (synthetic words, as the pilot's said it). */
const PILOT_CHANGE = 'Revised the recommendations; the rest of the report is unchanged.'
const PILOT_KEPT = 'Kept: Compatibility, charging speed, product claims and limitations are kept as they were.'

/** Version `n`'s entry on the History tab. */
const entry = (page: Page, n: number) =>
  pane(page)
    .locator('.report-history > li')
    .filter({ has: page.getByText(`v${String(n)}`, { exact: true }) })

/** Opens the fixture report at `url` on its History tab, and gives its version `n`'s entry. */
async function historyAt(page: Page, url: string, n = 2): Promise<Locator> {
  await enter(page, url)
  await pane(page)
    .getByRole('tab', { name: /^History/ })
    .click()
  await expect(entry(page, 1)).toBeVisible()
  return entry(page, n)
}

/** Whether `upper` ends above where `lower` begins. */
async function above(upper: Locator, lower: Locator): Promise<boolean> {
  const [a, b] = await Promise.all([upper.boundingBox(), lower.boundingBox()])
  return a !== null && b !== null && a.y + a.height <= b.y
}

/**
 * Whether every History entry (or what else `part` names: the comparison) lies across the pane's width, its boxes
 * and its lines of text too (text can run past the box that holds it): the pane clips what runs past its edge, so the
 * page itself never scrolls sideways. The pane scrolls down, so the height is not compared.
 */
async function entriesFit(page: Page, part = '.report-history'): Promise<boolean> {
  const side = await pane(page).boundingBox()
  if (!side) return false
  return pane(page)
    .locator(part)
    .evaluate(
      (list, { left, right }) => {
        const rects = [...list.querySelectorAll(':scope *')].map((el) => el.getBoundingClientRect())
        const walk = document.createTreeWalker(list, NodeFilter.SHOW_TEXT)
        for (let text = walk.nextNode(); text; text = walk.nextNode()) {
          const range = document.createRange()
          range.selectNodeContents(text)
          rects.push(...range.getClientRects())
        }
        const drawn = rects.filter((r) => r.width > 0 && r.height > 0)
        return drawn.length > 0 && drawn.every((r) => r.left >= left && r.right <= right)
      },
      { left: side.x - 0.5, right: side.x + side.width + 0.5 },
    )
}

interface Colour {
  r: number
  g: number
  b: number
  a: number
}

/** A computed CSS colour (`rgb(…)` or `rgba(…)`) as its channels. */
function colourOf(css: string): Colour {
  const [r = 0, g = 0, b = 0, a = 1] = (css.match(/[\d.]+/g) ?? []).map(Number)
  return { r, g, b, a }
}

/** `top` laid over the opaque `under`. */
function over(top: Colour, under: Colour): Colour {
  const mix = (t: number, u: number) => t * top.a + u * (1 - top.a)
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 }
}

/** A channel's share of the light, as WCAG counts it. */
const channel = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
const lightOf = (c: Colour) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)

/**
 * The contrast of the text of what `locator` names against what lies under it, as WCAG measures it: its colour over
 * the backgrounds up the tree, to the first opaque one.
 */
async function contrast(locator: Locator): Promise<number> {
  const { ink, backgrounds } = await locator.evaluate((el) => {
    const seen: string[] = []
    for (let node: Element | null = el; node; node = node.parentElement) {
      seen.push(getComputedStyle(node).backgroundColor)
    }
    return { ink: getComputedStyle(el).color, backgrounds: seen }
  })
  const layers = backgrounds.map(colourOf).filter((c) => c.a > 0)
  const opaque = layers.findIndex((c) => c.a === 1)
  const ground = layers
    .slice(0, opaque === -1 ? layers.length : opaque + 1)
    .reduceRight((under, top) => over(top, under), { r: 0, g: 0, b: 0, a: 1 })
  const [hi = 0, lo = 0] = [lightOf(over(colourOf(ink), ground)), lightOf(ground)].toSorted((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

/** Version 1's entry says no notes: its change note is the service's "First version" (0027), never Sophia's. */
async function firstSaysNoNotes(page: Page) {
  const v1 = entry(page, 1)
  await expect(v1).toBeVisible()
  await expect(v1).not.toContainText('Sophia’s notes')
  await expect(v1).not.toContainText('First version')
}

// At 1280 px (desktop) and 390 px (@phone, where the pane covers the room): CONTRIBUTING's Studio UI widths.
for (const phone of [false, true]) {
  const at = phone ? ' @phone' : ''

  test(`CX-0026${at} · a History entry shaped like the pilot’s says the facts first, Sophia’s notes folded under them`, async ({
    page,
  }) => {
    const v2 = await historyAt(page, `/room.html?report=${REPORT}&versions=2&version=${V2}&history=pilot`)
    const facts = v2.locator('.report-facts')
    await expect(facts).toHaveText(PILOT_FACTS)
    await expect(v2.locator('.report-chips')).toHaveText('Recommendations changed') // nothing the line says, again
    const notes = v2.locator('details.report-notes')
    const by = notes.locator('summary')
    await expect(by).toHaveText('Sophia’s notes')
    await expect(notes).not.toHaveAttribute('open')
    await expect(v2.getByText(PILOT_CHANGE)).toBeHidden()
    await expect(v2.getByText(PILOT_KEPT)).toBeHidden()
    expect(await above(facts, by), 'the facts before the notes').toBe(true)
    expect(await entriesFit(page), 'the facts line wraps in the pane').toBe(true)

    // The notes unfold in place, the press keeping its focus; they read as Sophia's, under the facts.
    if (phone) await by.tap()
    else await by.press('Enter')
    await expect(by).toBeFocused()
    await expect(v2.getByText(PILOT_CHANGE)).toBeVisible()
    await expect(v2.getByText(PILOT_KEPT)).toBeVisible()
    expect(await above(facts, v2.getByText(PILOT_CHANGE)), 'the facts still first').toBe(true)
    expect(await entriesFit(page), 'and the notes too').toBe(true)
    // Show this version still turns into "On screen" in place, keeping the focus: aria-disabled, never disabled.
    await entry(page, 1).getByRole('button', { name: 'Show this version' }).click()
    const onScreen = entry(page, 1).getByRole('button', { name: 'On screen' })
    await expect(onScreen).toBeFocused()
    await expect(onScreen).toHaveAttribute('aria-disabled', 'true')
    await expect(onScreen).not.toHaveAttribute('disabled')
  })

  test(`CX-0026${at} · the line that unfolds Sophia’s notes reads at its size and reaches past its words; v1 has none`, async ({
    page,
  }) => {
    const v2 = await historyAt(page, `/room.html?report=${REPORT}&versions=2&version=${V2}&history=pilot`)
    const by = v2.locator('details.report-notes > summary')
    expect(await contrast(by), 'at least 4.5:1 on the pane').toBeGreaterThanOrEqual(4.5)
    if (phone) expect(await reaches(by, 6), 'a press 6 px above it opens the notes').toBe(true)
    await firstSaysNoNotes(page)
  })

  test(`CX-0026${at} · an honest History entry says the facts, then Sophia’s notes, both in sight`, async ({
    page,
  }) => {
    const v2 = await historyAt(page, `/room.html?report=${REPORT}&versions=2&version=${V2}`)
    const facts = v2.locator('.report-facts')
    await expect(facts).toHaveText('Compared with v1: no section added or removed.')
    await expect(v2.locator('.report-chips .tag')).toHaveText(['2 revised', 'Recommendations changed'])
    await expect(v2.locator('details')).toHaveCount(0) // nothing to fold: no section removed, no source dropped
    const by = v2.getByText('Sophia’s notes', { exact: true })
    const change = v2.getByText('Expanded the introduction and the recommendations.')
    await expect(change).toBeVisible()
    await expect(v2.getByText('Kept: The conclusion is unchanged.')).toBeVisible()
    expect(await above(facts, by), 'the facts first').toBe(true)
    expect(await above(by, change), 'then whose notes they are').toBe(true)
    expect(await contrast(by), 'whose notes, read at its size').toBeGreaterThanOrEqual(4.5)
    expect(await entriesFit(page)).toBe(true)
    await firstSaysNoNotes(page)
  })

  test(`CX-0026${at} · a heading or a note a line cannot break in wraps inside its History entry`, async ({ page }) => {
    const v3 = await historyAt(page, `/room.html?report=${REPORT}&versions=3&history=pilot`, 3)
    const facts = v3.locator('.report-facts')
    await expect(facts).toHaveText(`Compared with v2: 1 section added: “${LONG_HEADING}”.`) // named whole: 59 characters
    const note = v3.getByText(/^Added the charging times, from measured_/)
    // Nothing removed and no source dropped (its own versions are none): the notes are in sight.
    await expect(note).toBeVisible()
    expect(await entriesFit(page), 'the heading and the file name wrap inside the pane').toBe(true)
  })

  test(`CX-0026${at} · the comparison by section quotes every heading, as the facts line does, and wraps in the pane`, async ({
    page,
  }) => {
    const v2 = await historyAt(page, `/room.html?report=${REPORT}&versions=2&version=${V2}&history=pilot`)
    await v2.getByRole('button', { name: 'Compare with the version before' }).click()
    const region = pane(page).getByRole('region', { name: 'v1 to v2' })
    await expect(region.locator('dt')).toHaveText(['Added', 'Removed', 'Unchanged', 'Recommendations'])
    await expect(region.locator('dd')).toHaveText([
      '“Revised recommendations”, “Sources”',
      '“Summary”, “Compatibility and standards”, “Charging speed in practice”, “Product claims vs. evidence”, ' +
        '“Comparison table”, “Recommendations for buyers”, “Limitations of this review”',
      '“Fixture report”',
      'Changed',
    ])
    expect(await entriesFit(page, '.report-compare'), 'the lists wrap in the pane').toBe(true)
  })

  test(`CX-0026${at} · a Knowledge card shows no notes of what changed, never “Kept:”; its History says the facts`, async ({
    page,
  }) => {
    await enter(page, '/room.html?place=knowledge&versions=2&history=pilot')
    const card = page.locator('.report-card').filter({ has: page.getByRole('button', { name: 'Fixture report' }) })
    await expect(card.locator('.report-meta')).toContainText('v2 · 2 versions')
    await expect(card).not.toContainText('Kept:')
    await expect(card).not.toContainText(PILOT_CHANGE)
    await card.getByRole('button', { name: 'History and changes' }).click()
    await expect(entry(page, 2).locator('.report-facts')).toHaveText(PILOT_FACTS)
  })
}

test('type · a History entry keeps to the work views’ scale, its notes open or folded', async ({ page }) => {
  const v2 = await historyAt(page, `/room.html?report=${REPORT}&versions=2&version=${V2}&history=pilot`)
  const folded = await typeSizes(page, '.report-history')
  expect(folded, folded.join(' ')).toEqual(['12px', '13px'])
  await v2.locator('summary').click()
  await expect(v2.getByText(PILOT_CHANGE)).toBeVisible()
  const open = await typeSizes(page, '.report-history')
  expect(open, open.join(' ')).toEqual(['12px', '13px'])
})

test('CX-0019 · a citation written as a link to one of the version’s sources is numbered; a link to another id stays text', async ({
  page,
}) => {
  await enter(page, `/room.html?report=${REPORT}&versions=3&version=${V3}`)
  await expect(pane(page).getByText(THIRD)).toBeVisible()
  const one = pane(page).getByRole('button', { name: 'Source 1' })
  await expect(one).toBeVisible() // once the sources came: the link names one of them
  await expect(pane(page).getByRole('button', { name: 'Source 2' })).toHaveCount(0)
  await expect(pane(page).locator('.md a')).toHaveCount(0)
  await expect(pane(page).getByText('none of its sources 2.')).toBeVisible() // the stray link reads as its label
  await one.click()
  const row = pane(page).locator(`#source-${CITED}`)
  await expect(row).toBeFocused()
  await expect(row.getByText('Citation 1')).toBeAttached()
  await expect(pane(page).getByText('Not cited in the text')).toHaveCount(0)
})

/** What a download saved, as text. */
async function savedText(download: Download): Promise<string> {
  const path = await download.path()
  return readFile(path, 'utf8')
}

const frame = (page: Page) => pane(page).locator('iframe.report-html-frame')

test('HTML · a Markdown-only task offers no HTML row: nothing is printed from its Markdown (SDD-01)', async ({
  page,
}) => {
  await enter(page, '/room.html?place=work')
  await expect(page.getByRole('button', { name: 'Open fixture-report-v1.md, Markdown' })).toBeVisible()
  await expect(page.locator('.work-card .report-tile[data-format="html"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /HTML page/ })).toHaveCount(0)
})

test('HTML · the work card lists the stored designed page with its review, and saves exactly its bytes', async ({
  page,
}) => {
  await enter(page, '/room.html?place=work&designed=on')
  const open = page.getByRole('button', { name: 'Open fixture-report-v1.html, HTML page' })
  await expect(open).toContainText('HTML page · ')
  await expect(open).toContainText('reviewed')
  const saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download fixture-report-v1.html, HTML page' }).click()
  const download = await saved
  expect(download.suggestedFilename()).toBe('fixture-report-v1.html')
  expect(await savedText(download)).toBe(DESIGNED.text)
})

test('HTML · the viewer shows the designed page in a frame with no permission, from checked bytes; Download saves them', async ({
  page,
}) => {
  await enter(page, '/room.html?place=work&designed=on')
  await page.getByRole('button', { name: 'Open fixture-report-v1.html, HTML page' }).click()
  await expect(pane(page).getByRole('group', { name: 'Format' }).getByRole('button', { name: 'HTML' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // No allow-* token: the page cannot run, reach Studio's DOM or storage, submit, open windows or navigate Studio.
  await expect(frame(page)).toHaveAttribute('sandbox', '')
  expect(await frame(page).getAttribute('srcdoc')).toBe(DESIGNED.text)
  await expect(
    page.frameLocator('iframe.report-html-frame').getByText('A labelled fixture designed page'),
  ).toBeVisible()
  await expect(pane(page).getByRole('note')).toHaveText(/checked by a separate visual reviewer/)
  await expect(pane(page).locator('.report-meta')).toHaveText(/^HTML · v1 · .* · 315a02d3 · reviewed$/)
  await expect(pane(page).locator('.md')).toHaveCount(0) // never read through MarkdownView
  const saved = page.waitForEvent('download')
  await pane(page).getByRole('button', { name: 'Download', exact: true }).click()
  const download = await saved
  expect(download.suggestedFilename()).toBe('fixture-report-v1.html')
  expect(await savedText(download)).toBe(DESIGNED.text) // what is shown is what downloads
})

test('HTML · a designed page that does not match its record is not shown', async ({ page }) => {
  await enter(page, `/room.html?report=${REPORT}&format=html&designed=on&tamper=html`)
  await expect(pane(page).getByRole('alert')).toHaveText('This page did not match its record, so it is not shown.')
  await expect(frame(page)).toHaveCount(0)
  await expect(pane(page).getByRole('button', { name: 'Download', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

test('HTML · a version without a designed page shows its Markdown and says so', async ({ page }) => {
  await enter(page, `/room.html?report=${REPORT}&format=html`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await expect(pane(page).getByRole('note')).toHaveText(
    'This version has no designed HTML page, so its Markdown is shown.',
  )
  await expect(pane(page).getByRole('group', { name: 'Format' })).toHaveCount(0)
  await expect(frame(page)).toHaveCount(0)
})

test('HTML · a Knowledge card opens its current version’s designed page; a card without one offers none', async ({
  page,
}) => {
  await enter(page, '/room.html?place=knowledge')
  const plain = page.locator('.report-card').filter({ has: page.getByRole('button', { name: 'Fixture report' }) })
  await expect(plain.getByRole('button', { name: /HTML/ })).toHaveCount(0)
  await expect(plain.getByRole('button', { name: 'Download HTML page' })).toHaveCount(0)

  await enter(page, '/room.html?place=knowledge&designed=on')
  await page.getByRole('button', { name: 'Open Fixture report, HTML page' }).click()
  await expect(frame(page)).toHaveAttribute('sandbox', '')
  await expect(
    page.frameLocator('iframe.report-html-frame').getByText('A labelled fixture designed page'),
  ).toBeVisible()

  // The older report has a PDF, so the format filter is offered.
  await page.getByRole('button', { name: 'More reports' }).click()
  const formats = page.getByRole('group', { name: 'Format' }).first()
  await expect(formats.getByRole('button', { name: 'Without PDF' })).toBeVisible()
})
