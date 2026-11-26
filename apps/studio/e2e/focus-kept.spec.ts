import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// The focus never falls to the page when a press takes its control away (docs/plans/focus-kept.md): the control that
// takes its place gets it. Hold → Resume, Resume → Hold, Stop for good → the goal's line, Create the room link → Copy
// link, Send invitation → the address field, Join → the microphone, Leave → the recap, then Join. Every press is a
// keyboard's.

const onPage = (page: Page) => page.evaluate(() => document.activeElement === document.body)
const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('focus · Hold hands the focus to Resume, and Resume back to Hold', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  // The first goal's controls, found by place: their buttons change under the presses.
  const goal = page.locator('.controls').first()
  await expect(goal.getByRole('button', { name: 'Hold', exact: true })).toBeVisible()
  await goal.getByRole('button', { name: 'Hold', exact: true }).press('Enter')
  await expect(goal.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
  expect(await onPage(page)).toBe(false)
  await goal.getByRole('button', { name: 'Resume', exact: true }).press('Enter')
  await expect(goal.getByRole('button', { name: 'Hold', exact: true })).toBeFocused()
})

test('focus · Stop for good leaves the focus on what the press did, never the page', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  // The first goal's controls, found by place: their buttons change under the presses.
  const goal = page.locator('.controls').first()
  await expect(goal.getByRole('button', { name: 'Hold', exact: true })).toBeVisible()
  await goal.getByRole('button', { name: 'Stop', exact: true }).press('Enter')
  await goal.getByRole('button', { name: 'Stop for good' }).press('Enter')
  await expect(goal.locator('.outcome')).toBeFocused()
  await expect(goal.locator('.outcome')).toContainText('Stop requested')
})

test('focus · Create the room link hands it to Copy link; Send invitation, back to the address field', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).first().click()
  await page.getByRole('tab', { name: 'Guests' }).click()
  const guests = page.getByRole('tabpanel', { name: 'Guests' })
  await guests.getByRole('button', { name: 'Create the room link' }).press('Enter')
  await expect(guests.getByRole('button', { name: 'Copy link' })).toBeFocused()
  await page.getByRole('tab', { name: 'Members' }).click()
  const members = page.getByRole('tabpanel', { name: 'Members' })
  const email = members.getByRole('textbox', { name: 'Email' })
  await email.fill('ana@example.test')
  await members.getByRole('button', { name: 'Send invitation' }).press('Enter')
  await expect(members).toContainText('ana@example.test')
  await expect(email).toBeFocused()
  await expect(email).toHaveValue('')
})

test('focus · Join hands it to the microphone; Leave, back to Join', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await dock(page).getByRole('button', { name: 'Join the room' }).press('Enter')
  await expect(dock(page).getByRole('button', { name: 'Microphone' })).toBeFocused()
  await dock(page).getByRole('button', { name: 'Leave the room' }).press('Enter')
  // Leaving opens what the meeting left (its recap takes the focus, on purpose); put away, the focus is on Join.
  const recap = page.getByRole('dialog', { name: 'This meeting' })
  await expect(recap).toBeVisible()
  expect(await onPage(page)).toBe(false)
  await page.keyboard.press('Escape')
  await expect(recap).toHaveCount(0)
  await expect(dock(page).getByRole('button', { name: 'Join the room' })).toBeFocused()
  expect(await onPage(page)).toBe(false)
})

const toggle = (page: Page, panel: string) => page.locator(`.panel-toggles [data-panel="${panel}"]`)
const param = (page: Page, key: string) => new URL(page.url()).searchParams.get(key)

/** A new history entry at the same address, as the router pushes one (the fixture's views keep a single entry). */
const pushEntry = (page: Page) =>
  page.evaluate(() => {
    window.history.pushState(window.history.state, '', window.location.href)
    window.dispatchEvent(new Event('sophia:address-moved'))
  })

test('address · Back to an earlier Studio entry opens the panel its address names, never the one held since (Codex P2 on #545)', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await toggle(page, 'chat').click()
  await expect.poll(() => param(page, 'panel')).toBe('chat')
  await pushEntry(page)
  await toggle(page, 'people').click()
  await expect.poll(() => param(page, 'panel')).toBe('people')
  await page.goBack()
  await expect(toggle(page, 'chat')).toHaveAttribute('aria-pressed', 'true')
  expect(param(page, 'panel')).toBe('chat')
  await page.goForward()
  await expect(toggle(page, 'people')).toHaveAttribute('aria-pressed', 'true')
  expect(param(page, 'panel')).toBe('people')
})

test('address · Back and Forward show the Invite sheet as each entry’s address says (Codex P2 on #545)', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await pushEntry(page)
  await page.getByRole('button', { name: 'Invite' }).first().click()
  await page.getByRole('tab', { name: 'Members' }).click()
  await expect.poll(() => param(page, 'invite')).toBe('members')
  const sheet = page.getByRole('dialog', { name: 'Invite' })
  // Back to the entry that named no sheet: it closes.
  await page.goBack()
  await expect(sheet).toBeHidden()
  expect(param(page, 'invite')).toBeNull()
  // Forward to the one that names Members: it opens there again.
  await page.goForward()
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true')
  expect(param(page, 'invite')).toBe('members')
})
