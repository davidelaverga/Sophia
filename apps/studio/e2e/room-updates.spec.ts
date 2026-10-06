import { expect, test, type Page } from '@playwright/test'

// Updates (docs/plans/room-updates.md): what changed since the person last looked (A13's digest, built as A12's recap)
// and the project's meetings, each opening its recap. Behind the vision flag the fixture pages set; every word is
// synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const since = (page: Page) => page.getByRole('region', { name: 'Since you last looked' })
const meetings = (page: Page) => page.getByRole('region', { name: 'Meetings' })
const recap = (page: Page) => page.getByRole('dialog', { name: 'This meeting' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.goto('/room.html?place=updates')
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('updates · what changed since the person last looked, with who, and the meetings, newest first', async ({
  page,
}) => {
  await expect(since(page)).toContainText('You haven’t looked before: this is everything so far.')
  const decided = since(page).getByRole('region', { name: 'Decided' })
  await expect(decided).toContainText('Keep the room checks on fixtures')
  await expect(decided).toContainText('proposed by Lucía, decided by you')
  // Nobody has joined the call on this page: no meeting runs.
  const rows = meetings(page).getByRole('button')
  await expect(rows).toHaveText(['Oct 4, 15:00 · 38 minutes', 'Oct 2, 09:30 · 25 minutes'])
})

test('updates · Mark as seen writes the digest’s sequence once, and then nothing is new', async ({ page }) => {
  await expect(since(page).getByRole('region', { name: 'Decided' })).toBeVisible()
  await since(page).getByRole('button', { name: 'Mark as seen' }).click()
  await expect(since(page)).toContainText('Nothing new since you last looked.')
  await expect(since(page).getByRole('region', { name: 'Decided' })).toHaveCount(0)
  await expect(since(page).getByRole('button', { name: 'Mark as seen' })).toHaveCount(0)
  expect((await served(page)).filter((s) => s.startsWith('seen:'))).toEqual(['seen:1'])
})

test('updates · a note kept afterwards is new, without a reload', async ({ page }) => {
  await since(page).getByRole('button', { name: 'Mark as seen' }).click()
  await expect(since(page)).toContainText('Nothing new since you last looked.')
  await page.evaluate(() => window.fixture?.keep('Two teams asked for the pilot'))
  const kept = since(page).getByRole('region', { name: 'Kept' })
  await expect(kept).toContainText('Two teams asked for the pilot')
  await expect(kept).toContainText('kept by you')
  await expect(since(page).getByRole('region', { name: 'Decided' })).toHaveCount(0)
})

test('updates · with no reply, Mark as seen says so, and a second press marks it', async ({ page }) => {
  await page.evaluate(() => window.fixture?.loseNextSeenReply())
  await since(page).getByRole('button', { name: 'Mark as seen' }).click()
  await expect(since(page)).toContainText('Not marked. Try again.')
  await since(page).getByRole('button', { name: 'Mark as seen' }).click()
  await expect(since(page)).toContainText('Nothing new since you last looked.')
})

test('updates · a past meeting opens its recap, closed: nothing to close', async ({ page }) => {
  await meetings(page).getByRole('button', { name: 'Oct 4, 15:00 · 38 minutes' }).click()
  await expect(recap(page).locator('.recap-head')).toHaveText('38 minutes · 2 members · 1 guest')
  await expect(recap(page).getByRole('region', { name: 'Decided' })).toContainText('Keep the room checks on fixtures')
  await expect(recap(page).locator('.recap-said')).toHaveText('This meeting is closed.')
  await expect(recap(page).getByRole('button', { name: 'Close the meeting' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(recap(page)).toHaveCount(0)
  await expect(meetings(page).getByRole('button', { name: 'Oct 4, 15:00 · 38 minutes' })).toBeFocused()
})

test('updates · an older meeting opens its own recap, not the latest: one that left nothing says so', async ({
  page,
}) => {
  await meetings(page).getByRole('button', { name: 'Oct 2, 09:30 · 25 minutes' }).click()
  await expect(recap(page).locator('.recap-head')).toHaveText('25 minutes · 2 members')
  await expect(recap(page)).toContainText('Nothing was decided, made or kept in this meeting.')
  await expect(recap(page).getByRole('region', { name: 'Decided' })).toHaveCount(0)
})

test('updates · in a call, the running meeting is first, and opens with Close for an admin', async ({ page }) => {
  await page.goto('/room.html?place=updates&call=on')
  await expect(meetings(page).getByRole('button').first()).toHaveText(/^Now · started \d\d:\d\d$/)
  await meetings(page).getByRole('button', { name: /^Now/ }).click()
  await expect(recap(page).getByRole('region', { name: 'Decided' })).toContainText(
    'Pilot the fixture with fourteen teams',
  )
  await expect(recap(page).getByRole('button', { name: 'Close the meeting' })).toBeVisible()
  // Closed from here, it is no longer «Now» behind the sheet.
  await recap(page).getByRole('button', { name: 'Close the meeting' }).click()
  await expect(recap(page).locator('.recap-said')).toHaveText('Closed. Everyone’s recap is this one.')
  await page.keyboard.press('Escape')
  await expect(meetings(page).getByRole('button').first()).toHaveText(/^Oct \d+, \d\d:\d\d · under a minute$/)
})

test('updates · leaving from an older meeting’s sheet opens the recap of the meeting left, on top', async ({
  page,
}) => {
  await page.goto('/room.html?place=updates&call=on')
  await expect(meetings(page).getByRole('button').first()).toHaveText(/^Now/)
  // Held, so Leave comes before its recap: the list said it ended, so leaving from it opens the one left, on top.
  await page.evaluate(() => window.fixture?.holdRecaps())
  await meetings(page).getByRole('button', { name: 'Oct 4, 15:00 · 38 minutes' }).click()
  await expect(recap(page)).toHaveCount(1)
  await recap(page).getByRole('group', { name: 'Your call' }).getByRole('button', { name: 'Leave the room' }).click()
  await expect(recap(page)).toHaveCount(2)
  await page.evaluate(() => window.fixture?.releaseRecaps())
  await expect(recap(page).last().getByRole('region', { name: 'Decided' })).toContainText(
    'Pilot the fixture with fourteen teams',
  )
  await page.keyboard.press('Escape')
  await expect(recap(page)).toHaveCount(1)
  await expect(recap(page).getByRole('region', { name: 'Decided' })).toContainText('Keep the room checks on fixtures')
})

test('updates · leaving the call from a recap’s own sheet opens no second one', async ({ page }) => {
  await page.goto('/room.html?place=updates&call=on')
  await meetings(page).getByRole('button', { name: /^Now/ }).click()
  await expect(recap(page)).toBeVisible()
  await recap(page).getByRole('group', { name: 'Your call' }).getByRole('button', { name: 'Leave the room' }).click()
  await expect(recap(page).getByRole('group', { name: 'Your call' })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('updates · leaving from the running meeting’s sheet while its recap is read opens no second one', async ({
  page,
}) => {
  await page.goto('/room.html?place=updates&call=on')
  await page.evaluate(() => window.fixture?.holdRecaps())
  await meetings(page).getByRole('button', { name: /^Now/ }).click()
  await expect(recap(page)).toContainText('Putting the meeting together…')
  await recap(page).getByRole('group', { name: 'Your call' }).getByRole('button', { name: 'Leave the room' }).click()
  await expect(recap(page).getByRole('group', { name: 'Your call' })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.evaluate(() => window.fixture?.releaseRecaps())
  await expect(page.getByRole('dialog')).toHaveCount(1)
})
