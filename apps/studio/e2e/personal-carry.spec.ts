import { expect, test, type Page } from '@playwright/test'

// Carry only what you choose (docs/plans/personal-carry-package.md, Davide's chapter 1): a reviewed package of notes,
// carried from Personal to a project, behind the vision flag the fixture pages set. Every word is synthetic.

const PAGE = '/personal.html?notes=open&ready=1&many=1'
const panel = (page: Page) => page.locator('#c-notes')
const pkg = (page: Page) => panel(page).getByRole('group', { name: 'Carry only what you choose' })
const carried = (page: Page) => page.evaluate(() => [...(window.personalFixture?.carried ?? [])])
const takenBack = (page: Page) => page.evaluate(() => [...(window.personalFixture?.takenBack ?? [])])
const PROJECT = '00000000-0000-4000-8000-000000000004'

async function openPackage(page: Page, query = '') {
  await page.goto(`${PAGE}${query}`)
  await panel(page).getByRole('button', { name: 'Review what to carry' }).click()
  await expect(pkg(page)).toBeVisible()
}

test('carry · the package opens with nothing chosen, and Carry unavailable until something is', async ({ page }) => {
  await openPackage(page)
  await expect(pkg(page).getByRole('checkbox')).toHaveCount(3)
  for (const box of await pkg(page).getByRole('checkbox').all()) await expect(box).not.toBeChecked()
  await expect(pkg(page).getByText('Stays here: this conversation, and every note you leave out.')).toBeVisible()
  const carry = pkg(page).getByRole('button', { name: /^Carry/ })
  await expect(carry).toHaveAttribute('aria-disabled', 'true')
  // Pressed anyway: nothing goes.
  await carry.click({ force: true })
  expect(await carried(page)).toEqual([])
})

test('carry · what is chosen is what the team will receive, exactly as written; the rest stays', async ({ page }) => {
  await openPackage(page)
  await pkg(page).getByRole('checkbox', { name: 'Start the deck from one number I trust' }).check()
  await pkg(page).getByRole('checkbox', { name: 'Ask finance for the March close' }).check()
  const receive = pkg(page).getByRole('list', { name: 'The team will receive' })
  await expect(receive.getByRole('listitem')).toHaveText([
    'Start the deck from one number I trust',
    'Ask finance for the March close',
  ])
  await expect(receive).not.toContainText('Unfinished: whether the pilot needs a second region')
  await expect(pkg(page).getByRole('button', { name: 'Carry 2 notes to Product launch' })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

test('carry · Carry carries those notes once each, says so, and Take back takes them all back', async ({ page }) => {
  await openPackage(page)
  await pkg(page).getByRole('checkbox', { name: 'Start the deck from one number I trust' }).check()
  await pkg(page).getByRole('checkbox', { name: 'Ask finance for the March close' }).check()
  await pkg(page).getByRole('button', { name: 'Carry 2 notes to Product launch' }).click()
  await expect(pkg(page).getByRole('status')).toHaveText(
    'Carried 2 notes to Product launch. Your team sees them as yours, exactly as written.',
  )
  expect(await carried(page)).toEqual([`note-1>${PROJECT}`, `note-2>${PROJECT}`])
  await pkg(page).getByRole('button', { name: 'Take back' }).click()
  await expect(pkg(page).getByRole('status')).toHaveText('Taken back from Product launch.')
  expect(await takenBack(page)).toEqual(['release-note-1', 'release-note-2'])
})

test('carry · a carry that fails stops the package, says how many went, and Try again carries the rest', async ({
  page,
}) => {
  await openPackage(page, '&carryFails=2')
  for (const name of ['Start the deck from one number I trust', 'Ask finance for the March close']) {
    await pkg(page).getByRole('checkbox', { name }).check()
  }
  await pkg(page).getByRole('button', { name: 'Carry 2 notes to Product launch' }).click()
  await expect(pkg(page).getByRole('status')).toContainText('Carried 1 of 2 to Product launch. The rest wasn’t sent.')
  await pkg(page).getByRole('button', { name: 'Try again' }).click()
  await expect(pkg(page).getByRole('status')).toHaveText(
    'Carried 2 notes to Product launch. Your team sees them as yours, exactly as written.',
  )
  expect(await carried(page)).toEqual([`note-1>${PROJECT}`, `note-2>${PROJECT}`])
})

test('carry · Cancel keeps nothing; with no project, the package isn’t offered', async ({ page }) => {
  await openPackage(page)
  await pkg(page).getByRole('checkbox', { name: 'Ask finance for the March close' }).check()
  await pkg(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(pkg(page)).toHaveCount(0)
  expect(await carried(page)).toEqual([])
  await page.goto('/personal.html?notes=open&many=1')
  await expect(panel(page).getByText('Start the deck from one number I trust')).toBeVisible()
  await expect(panel(page).getByRole('button', { name: 'Review what to carry' })).toHaveCount(0)
})

test('carry · carrying every note keeps the package, which says what went, as the notes leave the list', async ({
  page,
}) => {
  await openPackage(page)
  for (const box of await pkg(page).getByRole('checkbox').all()) await box.check()
  await pkg(page).getByRole('button', { name: 'Carry 3 notes to Product launch' }).click()
  await expect(pkg(page).getByRole('status')).toHaveText(
    'Carried 3 notes to Product launch. Your team sees them as yours, exactly as written.',
  )
  await expect(pkg(page).getByRole('status')).toBeFocused()
  await expect(pkg(page).getByRole('button', { name: 'Take back' })).toBeVisible()
})

test('carry · a take-back that fails says what is still in the project, and Try again takes it back', async ({
  page,
}) => {
  await openPackage(page, '&takeBackFails=1')
  await pkg(page).getByRole('checkbox', { name: 'Ask finance for the March close' }).check()
  await pkg(page).getByRole('button', { name: 'Carry 1 note to Product launch' }).click()
  await pkg(page).getByRole('button', { name: 'Take back' }).click()
  await expect(pkg(page).getByRole('status')).toContainText('Not all taken back: 1 note still in Product launch.')
  await pkg(page).getByRole('button', { name: 'Try again' }).click()
  await expect(pkg(page).getByRole('status')).toHaveText('Taken back from Product launch.')
  expect(await takenBack(page)).toEqual(['release-note-2'])
})

test('carry · a take-back whose reply was lost is asked again under its own key, and says it came back', async ({
  page,
}) => {
  await openPackage(page, '&takeBackLost=1')
  await pkg(page).getByRole('checkbox', { name: 'Ask finance for the March close' }).check()
  await pkg(page).getByRole('button', { name: 'Carry 1 note to Product launch' }).click()
  await pkg(page).getByRole('button', { name: 'Take back' }).click()
  await expect(pkg(page).getByRole('status')).toContainText('Not all taken back: 1 note still in Product launch.')
  await pkg(page).getByRole('button', { name: 'Try again' }).click()
  // It had come back: asked again under the same key, the API answers as it did (a new key would be «not found»).
  await expect(pkg(page).getByRole('status')).toHaveText('Taken back from Product launch.')
  expect(await takenBack(page)).toEqual(['release-note-2'])
})

test('carry · while notes are on their way, Cancel waits', async ({ page }) => {
  await openPackage(page)
  await pkg(page).getByRole('checkbox', { name: 'Ask finance for the March close' }).check()
  await pkg(page).getByRole('button', { name: 'Carry 1 note to Product launch' }).click()
  await expect(pkg(page).getByRole('status')).toContainText('Carried 1 note')
  expect(await carried(page)).toEqual([`note-2>${PROJECT}`])
})

test('carry · a note whose reply was lost may have gone: never carried again, and the rest goes on Try again', async ({
  page,
}) => {
  await openPackage(page, '&carryLost=2')
  for (const box of await pkg(page).getByRole('checkbox').all()) await box.check()
  await pkg(page).getByRole('button', { name: 'Carry 3 notes to Product launch' }).click()
  await expect(pkg(page).getByRole('status')).toContainText(
    'Carried 1 of 3 to Product launch. 1 note may already be there: see Work.',
  )
  await expect(pkg(page).getByRole('status')).not.toContainText('wasn’t sent')
  await pkg(page).getByRole('button', { name: 'Try again' }).click()
  await expect(pkg(page).getByRole('status')).toContainText('Carried 2 notes to Product launch.')
  await expect(pkg(page).getByRole('status')).toContainText('1 note may already be there: see Work.')
  expect(await carried(page)).toEqual([`note-1>${PROJECT}`, `note-2>${PROJECT}`, `note-3>${PROJECT}`])
})

test('carry · Done after every note went puts the focus on the notes, never the page', async ({ page }) => {
  await openPackage(page)
  for (const box of await pkg(page).getByRole('checkbox').all()) await box.check()
  await pkg(page).getByRole('button', { name: 'Carry 3 notes to Product launch' }).click()
  await pkg(page).getByRole('button', { name: 'Done' }).click()
  await expect(panel(page)).toBeFocused()
})

// Codex on #131 (follow-ups).

test('carry · with the package open, the notes’ own Carry is put away: one way to carry at a time', async ({
  page,
}) => {
  await openPackage(page)
  await expect(panel(page).locator('[data-carry]')).toHaveCount(0)
  await pkg(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(panel(page).locator('[data-carry]')).toHaveCount(3)
})

test('carry · a release already taken back elsewhere is said taken back', async ({ page }) => {
  await openPackage(page, '&takenElsewhere=1')
  await pkg(page).getByRole('checkbox', { name: 'Ask finance for the March close' }).check()
  await pkg(page).getByRole('button', { name: 'Carry 1 note to Product launch' }).click()
  await pkg(page).getByRole('button', { name: 'Take back' }).click()
  await expect(pkg(page).getByRole('status')).toHaveText('Taken back from Product launch.')
})

test('carry · while notes are on their way, the notes stay open: Close and Esc wait', async ({ page }) => {
  await openPackage(page, '&carrySlow=1')
  await pkg(page).getByRole('checkbox', { name: 'Ask finance for the March close' }).check()
  await pkg(page).getByRole('button', { name: 'Carry 1 note to Product launch' }).click()
  const close = panel(page).getByRole('button', { name: 'Close notes' })
  await expect(close).toHaveAttribute('aria-disabled', 'true')
  await close.click({ force: true })
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeVisible()
  await expect(pkg(page).getByRole('status')).toContainText('Carried 1 note')
  await expect(close).not.toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
})

// Codex on #135 (follow-ups 2).

test('carry · when the account goes mid-carry, nothing more goes under it', async ({ page }) => {
  await openPackage(page, '&carrySlow=1')
  for (const box of await pkg(page).getByRole('checkbox').all()) await box.check()
  await pkg(page).getByRole('button', { name: 'Carry 3 notes to Product launch' }).click()
  await expect.poll(() => carried(page)).toHaveLength(1)
  await page.evaluate(() => window.personalFixture?.signOut?.())
  // The note on its way lands; none after it is asked for under the account that left.
  await page.waitForTimeout(4000)
  expect(await carried(page)).toHaveLength(1)
})

test('carry · the notes closed mid-step (their toggle), the chosen notes still all go', async ({ page }) => {
  await openPackage(page, '&carrySlow=1')
  for (const box of await pkg(page).getByRole('checkbox').all()) await box.check()
  await pkg(page).getByRole('button', { name: 'Carry 3 notes to Product launch' }).click()
  await expect.poll(() => carried(page)).toHaveLength(1)
  await page.locator('[aria-controls="c-notes"]').click()
  await expect(panel(page)).toHaveCount(0)
  // Nothing chosen stops halfway: the package goes with the notes, its batch doesn't.
  await expect.poll(() => carried(page), { timeout: 8000 }).toHaveLength(3)
})

test('carry · after leaving Personal and coming back mid-step, Esc still waits', async ({ page }) => {
  await openPackage(page, '&carrySlow=1')
  await pkg(page).getByRole('checkbox', { name: 'Ask finance for the March close' }).check()
  await pkg(page).getByRole('button', { name: 'Carry 1 note to Product launch' }).click()
  // Two renders apart, as leaving and coming back are: the notes' layer goes, then opens again after the package's.
  await page.evaluate(() => window.personalFixture?.away?.())
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50))))
  await page.evaluate(() => window.personalFixture?.back?.())
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50))))
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeVisible()
  await expect(pkg(page).getByRole('status')).toContainText('Carried 1 note')
})
