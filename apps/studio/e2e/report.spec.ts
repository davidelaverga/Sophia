import { expect, test, type Locator, type Page } from '@playwright/test'

// The report viewer over the room (SMC-M03), on the fixture page: the Studio's own ProjectShell with the fixture report
// (fixtures/report-data.ts). Each check holds one of LFE-02.1's findings fixed; only the API and LiveKit are faked, and
// each check ends by asking the page whether anything reached for the API beyond what it answers.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const V1 = '00000000-0000-4000-8000-0000000000d1'
const V2 = '00000000-0000-4000-8000-0000000000d2'
const IN_CALL = '/room.html?call=on&exchange=open'
const FIRST = 'The first version of a labelled fixture report.'
const SECOND = 'The second version of a labelled fixture report, published while the first was read.'

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
  const row = pane(page).locator('#source-00000000-0000-4000-8000-0000000000c9')
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
  const gone = page.getByRole('complementary', { name: 'Report' }) // no version: no title of its own
  await expect(gone.getByText('This version isn’t available.')).toBeVisible()
  await gone.getByRole('tab', { name: /^History/ }).click()
  await expect(gone.getByText('This version isn’t available.')).toBeVisible()
  await expect(gone.locator('.report-history')).toHaveCount(0)
  await gone.getByRole('tab', { name: /^Sources/ }).click()
  await expect(gone.getByText('This version isn’t available.')).toBeVisible()
  await gone.getByRole('button', { name: 'Show the current version, v1' }).click() // never a dead end
  await expect(pane(page).getByText('A labelled fixture page')).toBeVisible() // v1's sources, on the tab in view
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
  // The format filter is a filter, not tabs: pressed buttons.
  await expect(page.getByRole('group', { name: 'Format' }).getByRole('button', { name: 'Any' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
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
