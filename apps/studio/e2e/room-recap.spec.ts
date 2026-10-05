import { expect, test, type Page } from '@playwright/test'

// What the meeting left, on leaving (docs/plans/room-recap.md): the A12 recap proposed in issue #105, behind the vision
// flag the fixture pages set, built from the fixture's own records. Every word is synthetic.

const REPORT = '00000000-0000-4000-8000-0000000000b1'

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' }).first()
const sheet = (page: Page) => page.getByRole('dialog', { name: 'This meeting' })
const section = (page: Page, title: string) => sheet(page).getByRole('region', { name: title })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])

async function enter(page: Page, query = 'people=2&floor=1&sophia=listening') {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(leave(page)).toBeVisible()
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

test('recap · leaving shows what the meeting left: how long, who, and what was decided, from the records', async ({
  page,
}) => {
  await enter(page)
  await expect(sheet(page)).toHaveCount(0)
  await leave(page).click()
  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page).locator('.recap-head')).toHaveText('Under a minute · 3 members')
  await expect(section(page, 'Decided')).toContainText('Pilot the fixture with fourteen teams')
  await expect(section(page, 'Decided')).toContainText('proposed by Marco, decided by you')
  await expect(section(page, 'Made')).toHaveCount(0)
  expect(await served(page)).toContain('recap:running')
})

test('recap · a passage kept during the call is in Kept, as the member’s own note', async ({ page }) => {
  await page.goto(`/room.html?call=on&exchange=open&people=1&report=${REPORT}`)
  const pane = page.getByRole('complementary', { name: 'Fixture report' })
  await pane.locator('.md p', { hasText: 'The fixture holds.' }).selectText()
  await page.getByRole('toolbar', { name: 'The selected passage' }).getByRole('button', { name: 'Keep' }).click()
  await expect(pane.locator('.passage-kept')).toContainText('Kept in the brief.')
  await leave(page).click()
  await expect(section(page, 'Kept')).toContainText('“The fixture holds.” — Fixture report, v1')
  await expect(section(page, 'Kept')).toContainText('kept by you')
})

test('recap · what Sophia made is in Made, and Open opens it', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.notice())
  await leave(page).click()
  await expect(section(page, 'Made')).toContainText('Fixture report · v1')
  await expect(section(page, 'Made')).toContainText('asked by you')
  await section(page, 'Made').getByRole('button', { name: 'Open' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Fixture report' })).toBeVisible()
  // Closed, the report gives the focus to Join: the Open pressed went with the recap.
  await page
    .getByRole('complementary', { name: 'Fixture report' })
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Join the room' }).first()).toBeFocused()
})

test('recap · leaving from another view, by the mini dock, shows it there too', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=listening&place=work')
  await page.locator('.mini-dock').getByRole('button', { name: 'Leave the room' }).click()
  await expect(sheet(page)).toBeVisible()
  await expect(section(page, 'Decided')).toContainText('Pilot the fixture with fourteen teams')
})

test('recap · on top of another sheet, Escape puts away the recap only', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Invite' }).click()
  const invite = page.getByRole('dialog').filter({ hasNot: page.locator('#recap-title') })
  await invite.getByRole('group', { name: 'Your call' }).getByRole('button', { name: 'Leave the room' }).click()
  await expect(sheet(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(invite).toBeVisible()
})

test('recap · a copy the browser refused leaves the text to copy by hand, and it stays', async ({ page }) => {
  await page.clock.install()
  await enter(page)
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'))
  })
  await leave(page).click()
  await sheet(page).getByRole('button', { name: 'Copy recap' }).click()
  const field = sheet(page).getByRole('textbox', { name: 'The recap, to copy' })
  await expect(field).toBeFocused()
  await page.clock.fastForward(6000)
  await expect(sheet(page).locator('.recap-said')).toHaveText('')
  await expect(field).toHaveValue(/Pilot the fixture with fourteen teams/)
})

test('recap · Copy recap puts it on the clipboard as plain text', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await enter(page)
  await leave(page).click()
  await sheet(page).getByRole('button', { name: 'Copy recap' }).click()
  await expect(sheet(page).locator('.recap-said')).toHaveText('Recap copied.')
  // Windows' clipboard ends lines with \r\n; the text itself is the same.
  const text = (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')
  expect(text.split('\n').slice(0, 2)).toEqual(['Fixture project', 'Under a minute · 3 members'])
  // Others read what is pasted: the reader goes by their name there, not "you".
  expect(text).toContain('- Pilot the fixture with fourteen teams (proposed by Marco, decided by Fixture viewer)')
})

test('recap · an admin closes the meeting for everyone, once', async ({ page }) => {
  await enter(page)
  await leave(page).click()
  await sheet(page).getByRole('button', { name: 'Close the meeting' }).click()
  await expect(sheet(page).locator('.recap-said')).toHaveText('Closed. Everyone’s recap is this one.')
  await expect(sheet(page).getByRole('button', { name: 'Close the meeting' })).toHaveCount(0)
  expect((await served(page)).filter((s) => s === 'meeting:closed')).toEqual(['meeting:closed'])
})

test('recap · a viewer reads it and copies it, but closing the meeting is an editor’s', async ({ page }) => {
  await enter(page, 'people=2&floor=1&sophia=listening&role=viewer')
  await leave(page).click()
  await expect(section(page, 'Decided')).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: 'Copy recap' })).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: 'Close the meeting' })).toHaveCount(0)
})

test('recap · with no reply, the recap read again says it closed: nothing to press twice', async ({ page }) => {
  await enter(page)
  await leave(page).click()
  await page.evaluate(() => window.fixture?.loseNextCloseReply())
  await sheet(page).getByRole('button', { name: 'Close the meeting' }).click()
  await expect(sheet(page).locator('.recap-said')).toHaveText('This meeting is closed.')
  await expect(sheet(page).getByRole('button', { name: /Close the meeting|Try again/ })).toHaveCount(0)
  expect(await served(page)).toContain('recap:closed')
  expect((await served(page)).filter((s) => s === 'meeting:closed')).toEqual(['meeting:closed'])
})

test('recap · a dropped call shows no recap: the person didn’t leave', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.drop())
  await expect(page.getByRole('button', { name: 'Try again' }).first()).toBeVisible()
  await expect(sheet(page)).toHaveCount(0)
})

test('recap · a call moved to another tab shows none here either', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.drop('elsewhere'))
  await expect(page.getByRole('button', { name: 'Join the room' }).first()).toBeVisible()
  await expect(sheet(page)).toHaveCount(0)
})

test('recap · the next leave reads its own recap: the last one is never shown for it', async ({ page }) => {
  await enter(page)
  await leave(page).click()
  await expect(section(page, 'Decided')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Join the room' }).first().click()
  await expect(leave(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.holdRecaps())
  await leave(page).click()
  await expect(sheet(page)).toContainText('Putting the meeting together…')
  await expect(section(page, 'Decided')).toHaveCount(0)
  await page.evaluate(() => window.fixture?.releaseRecaps())
  await expect(section(page, 'Decided')).toBeVisible()
})

test('recap · a read again that fails keeps the recap shown, said out of date, never an alert over it', async ({
  page,
}) => {
  await enter(page)
  await leave(page).click()
  await expect(section(page, 'Decided')).toBeVisible()
  await page.evaluate(() => window.fixture?.failRecaps())
  await sheet(page).getByRole('button', { name: 'Close the meeting' }).click()
  await expect(sheet(page)).toContainText('This recap may be out of date.')
  await expect(sheet(page).getByRole('alert')).toHaveCount(0)
  await expect(section(page, 'Decided')).toBeVisible()
})

test('recap · Esc closes it', async ({ page }) => {
  await enter(page)
  await leave(page).click()
  await expect(sheet(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
})
