import { expect, test, type Page } from '@playwright/test'

// Archiving a project (docs/plans/archive-project.md, A30): an admin archives it from the project's menu, after a
// question; it leaves the lists, stays readable, says so inside, and an admin brings it back. Every name is synthetic.

const header = (page: Page) => page.locator('header').first()
const menu = (page: Page) => page.getByRole('menu', { name: 'Project' })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Archive project' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
/** Each Unarchive's Idempotency-Key on Work's own page (fixtures/work-space.tsx), in the order sent. */
const workKeys = (page: Page) => page.evaluate(() => [...(window.workSpaceFixture?.keys ?? [])])
const OLD_PILOT = '00000000-0000-4000-8000-00000000c003'

declare global {
  interface Window {
    archiveKeys?: string[]
    releaseArchive?: () => void
  }
}

/**
 * The archive writes' Idempotency-Keys, from the page's own fetch, wrapped: the first one lands and its reply is lost,
 * as a write whose answer never comes back.
 */
const firstArchiveReplyLost = (page: Page) =>
  page.evaluate(() => {
    const own = window.fetch
    const keys: string[] = []
    window.archiveKeys = keys
    window.fetch = async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input), window.location.href).pathname
      if (!path.endsWith('/archive')) return own(input, init)
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '')
      const answer = await own(input, init)
      if (keys.length === 1) throw new TypeError('Failed to fetch')
      return answer
    }
  })

/** The archive writes land, but their replies wait in the page's own fetch until `window.releaseArchive`. */
const archiveRepliesHeld = (page: Page) =>
  page.evaluate(() => {
    const own = window.fetch
    const released = new Promise<void>((resolve) => {
      window.releaseArchive = resolve
    })
    window.fetch = async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input), window.location.href).pathname
      if (!path.endsWith('/archive')) return own(input, init)
      const answer = await own(input, init)
      await released
      return answer
    }
  })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('archive · an admin archives from the project’s menu, after a question, and goes to Work', async ({ page }) => {
  await page.goto('/room.html')
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    'Rename…',
    'Activity',
    'Archive project…',
    'Leave project…',
  ])
  await menu(page).getByRole('menuitem', { name: 'Archive project…' }).click()
  await expect(sheet(page)).toContainText('leaves everyone’s list')
  await expect(sheet(page).getByRole('button', { name: 'Cancel' })).toBeFocused()
  await sheet(page).getByRole('button', { name: 'Archive' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect.poll(() => served(page)).toEqual(expect.arrayContaining(['archive:true', 'went:work']))
})

test('archive · after no reply, the sheet opened again sends the same write, under the same key (Codex on #368)', async ({
  page,
}) => {
  await page.goto('/room.html')
  await expect.poll(() => served(page)).toContain('projects:archived')
  await firstArchiveReplyLost(page)
  const archive = async () => {
    await header(page).getByRole('button', { name: 'Fixture project' }).click()
    await menu(page).getByRole('menuitem', { name: 'Archive project…' }).click()
    await sheet(page).getByRole('button', { name: 'Archive' }).click()
  }
  await archive()
  await expect(sheet(page).getByRole('alert')).toHaveText('No reply from Sophia')
  // Put away and asked again: the write that may have landed goes again as itself, never as a second one.
  await sheet(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await archive()
  await expect.poll(() => served(page)).toContain('went:work')
  const keys = await page.evaluate(() => [...(window.archiveKeys ?? [])])
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
})

test('archive · after no reply, landed and then brought back elsewhere, Archive is a new write, not the lost one’s (Codex on #471)', async ({
  page,
}) => {
  await page.goto('/room.html')
  await expect.poll(() => served(page)).toContain('projects:archived')
  await expect(header(page).locator('.connection')).toHaveAttribute('data-state', 'live')
  await firstArchiveReplyLost(page)
  const archive = async () => {
    await header(page).getByRole('button', { name: 'Fixture project' }).click()
    await menu(page).getByRole('menuitem', { name: 'Archive project…' }).click()
    await sheet(page).getByRole('button', { name: 'Archive' }).click()
  }
  await archive()
  await expect(sheet(page).getByRole('alert')).toHaveText('No reply from Sophia')
  await sheet(page).getByRole('button', { name: 'Cancel' }).click()
  // It landed: the project's event has the list read again, which says so (the API's write sends one; the fixture's
  // doesn't, so an update stands in for it).
  const line = page.getByRole('status').filter({ hasText: 'This project is archived' })
  await page.evaluate(() => window.fixture?.update())
  await expect(line).toBeVisible()
  // Another admin brings it back: read again, the line goes and Archive is offered. The lost write's key replayed now
  // would be answered with its old receipt, archiving nothing, yet the sheet would close and go to Work.
  await page.evaluate(() => window.fixture?.unarchivedElsewhere())
  await expect(line).toHaveCount(0)
  await archive()
  await expect.poll(() => served(page)).toContain('went:work')
  // Archived anew, not answered with the lost write's receipt (the fixture replays a key sent again, as 0059 does).
  expect((await served(page)).filter((s) => s.startsWith('archive:'))).toEqual(['archive:true', 'archive:true'])
  const keys = await page.evaluate(() => [...(window.archiveKeys ?? [])])
  expect(keys).toHaveLength(2)
  expect(keys[1]).not.toBe(keys[0])
})

for (const [how, close] of [
  ['Cancel', (page: Page) => sheet(page).getByRole('button', { name: 'Cancel' }).click()],
  ['Escape', (page: Page) => page.keyboard.press('Escape')],
] as const) {
  test(`archive · ${how} during «Archiving…» keeps the person in the project and the call, and a late archive shows as the line (#368)`, async ({
    page,
  }) => {
    await page.goto('/room.html?call=on')
    const inCall = page.getByRole('button', { name: 'Leave the room' }).first()
    await expect(inCall).toBeVisible()
    await expect.poll(() => served(page)).toContain('projects:archived')
    await archiveRepliesHeld(page)
    await header(page).getByRole('button', { name: 'Fixture project' }).click()
    await menu(page).getByRole('menuitem', { name: 'Archive project…' }).click()
    await sheet(page).getByRole('button', { name: 'Archive' }).click()
    await expect(sheet(page).getByRole('button', { name: 'Archiving…' })).toBeVisible()
    await expect.poll(() => served(page)).toContain('archive:true')
    // Walked away from the write: the sheet goes now; the write may have landed, and isn't taken back.
    await close(page)
    await expect(sheet(page)).toHaveCount(0)
    await page.evaluate(() => window.releaseArchive?.())
    // It landed: the lists are read again and the line says so, as when archived elsewhere; nobody is moved.
    await expect(page.getByRole('status').filter({ hasText: 'This project is archived' })).toBeVisible()
    await header(page).getByRole('button', { name: 'Fixture project' }).click()
    await expect(menu(page).getByRole('menuitem')).toHaveText(['Rename…', 'Activity', 'Leave project…'])
    await expect(inCall).toBeVisible()
    expect(await served(page)).not.toContain('went:work')
  })
}

test('archive · an editor is offered no Archive', async ({ page }) => {
  await page.goto('/room.html?role=editor')
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText(['Leave project…'])
})

test('archive · an admin of an archived project is offered no Archive, only the line’s Unarchive (Codex on #368)', async ({
  page,
}) => {
  await page.goto('/room.html?archived=1')
  // Archived as read: archiving it again would change nothing, yet end the call and go to Work.
  await expect(page.getByRole('status').filter({ hasText: 'This project is archived' })).toBeVisible()
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText(['Rename…', 'Activity', 'Leave project…'])
})

test('archive · Archive is offered only once the project is known not archived, never while its list loads (Codex on #469)', async ({
  page,
}) => {
  const unknown = ['Rename…', 'Activity', 'Leave project…']
  await page.goto('/room.html?archived=1&hold=archived')
  await expect.poll(() => served(page)).toContain('projects:archived')
  // Archived, its list not read yet: archiving it again would change nothing, yet end the call and go to Work.
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText(unknown)
  await page.evaluate(() => window.fixture?.releaseArchived())
  await expect(page.getByRole('status').filter({ hasText: 'This project is archived' })).toBeVisible()
  await expect(menu(page).getByRole('menuitem')).toHaveText(unknown)
  // Not archived: offered once the list says so, and not before.
  await page.goto('/room.html?hold=archived')
  await expect.poll(() => served(page)).toContain('projects:archived')
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText(unknown)
  await page.evaluate(() => window.fixture?.releaseArchived())
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    'Rename…',
    'Activity',
    'Archive project…',
    'Leave project…',
  ])
})

test('archive · inside an archived project a line says so, and Unarchive brings it back', async ({ page }) => {
  await page.goto('/room.html?archived=1')
  const line = page.getByRole('status').filter({ hasText: 'This project is archived' })
  await expect(line).toBeVisible()
  await line.getByRole('button', { name: 'Unarchive' }).click()
  await expect.poll(() => served(page)).toContain('archive:false')
  await expect(page.getByText('This project is archived')).toHaveCount(0)
})

test('archive · a viewer reads the line, with nothing to press', async ({ page }) => {
  await page.goto('/room.html?archived=1&role=viewer')
  const line = page.getByRole('status').filter({ hasText: 'This project is archived' })
  await expect(line).toBeVisible()
  await expect(line.getByRole('button')).toHaveCount(0)
})

test('archive · archived elsewhere, the line says so as the event arrives, with no return to the tab (Codex on #368)', async ({
  page,
}) => {
  await page.goto('/room.html')
  // The archived list read, and the feed up to date: only the event can tell the page now.
  await expect.poll(() => served(page)).toContain('projects:archived')
  await expect(header(page).locator('.connection')).toHaveAttribute('data-state', 'live')
  await page.evaluate(() => window.fixture?.archivedElsewhere())
  await expect(page.getByRole('status').filter({ hasText: 'This project is archived' })).toBeVisible({ timeout: 2000 })
})

test('archive · Work keeps archived projects folded under «Archived»: each opens, and an admin brings one back', async ({
  page,
}) => {
  await page.goto('/work-space.html?archived=1')
  const fold = page.getByRole('button', { name: 'Archived (1)' })
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('Old pilot')).toHaveCount(0)
  await fold.click()
  const row = page.getByRole('listitem').filter({ hasText: 'Old pilot' })
  await row.getByRole('button', { name: 'Old pilot' }).click()
  await row.getByRole('button', { name: 'Unarchive' }).click()
  await expect.poll(() => page.evaluate(() => window.workSpaceFixture?.unarchived)).toEqual([OLD_PILOT])
  expect(await page.evaluate(() => window.workSpaceFixture?.opened)).toEqual([OLD_PILOT])
})

test('archive · in Work, Unarchive after no reply sends the same write again, under the same key (Codex on #368)', async ({
  page,
}) => {
  await page.goto('/work-space.html?archived=1&unarchive=lost')
  await page.getByRole('button', { name: 'Archived (1)' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Old pilot' })
  await row.getByRole('button', { name: 'Unarchive' }).click()
  await expect.poll(() => workKeys(page)).toHaveLength(1)
  // No reply: the row stays, and its press is the same write again.
  await row.getByRole('button', { name: 'Unarchive' }).click()
  await expect.poll(() => workKeys(page)).toHaveLength(2)
  const [first, second] = await workKeys(page)
  expect(second).toBe(first)
})

test('archive · in Work, Unarchive waits on its row, «Bringing back…», and a second press sends nothing (Codex on #368)', async ({
  page,
}) => {
  await page.goto('/work-space.html?archived=1&unarchive=hold')
  await page.getByRole('button', { name: 'Archived (1)' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Old pilot' })
  await row.getByRole('button', { name: 'Unarchive' }).click()
  const waiting = row.getByRole('button', { name: 'Bringing back…' })
  await expect(waiting).toHaveAttribute('aria-disabled', 'true')
  await waiting.click({ force: true }) // waiting: nothing more is sent
  await page.evaluate(() => window.workSpaceFixture?.release())
  // Answered: the lists are read again, and it has left the archived ones.
  await expect(row).toHaveCount(0)
  expect(await workKeys(page)).toHaveLength(1)
})

test('archive · in Work, an Unarchive refused says so on its row, and its press is offered again (Codex on #368)', async ({
  page,
}) => {
  await page.goto('/work-space.html?archived=1&unarchive=fails')
  await page.getByRole('button', { name: 'Archived (1)' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Old pilot' })
  await row.getByRole('button', { name: 'Unarchive' }).click()
  await expect(row.getByRole('alert')).toHaveText('That didn’t go through. Try again.')
  await expect(row.getByRole('button', { name: 'Unarchive' })).not.toHaveAttribute('aria-disabled')
  // Pressed again, the failure goes with the press, and this time it lands.
  await row.getByRole('button', { name: 'Unarchive' }).click()
  await expect(row).toHaveCount(0)
  expect(await workKeys(page)).toHaveLength(2)
})

test('archive · Work says its archived projects couldn’t be read where «Archived» goes, with Try again (Codex on #368)', async ({
  page,
}) => {
  await page.goto('/work-space.html?archived=1&archivedFails=1')
  const failed = page.getByRole('alert').filter({ hasText: 'Couldn’t load your archived projects.' })
  // A bodiless 503 is a proxy's: the read is asked three more times before it is said (#470).
  await expect(failed).toBeVisible({ timeout: 15_000 })
  // After the list, where the fold would be: nothing that failed to load looks like none archived.
  await expect(page.locator('.c3-projects > *').last()).toContainText('Couldn’t load your archived projects.')
  await expect(page.getByRole('button', { name: /^Archived/ })).toHaveCount(0)
  await page.evaluate(() => window.workSpaceFixture?.recover())
  await failed.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: 'Archived (1)' })).toBeVisible()
  await expect(failed).toHaveCount(0)
})

test('archive · inside an archived project whose archived list can’t be read, no line claims anything, and no Archive is offered (Codex on #469)', async ({
  page,
}) => {
  await page.goto('/room.html?archived=1&archivedFails=1')
  // Archived, yet every read of the list refused, its three retries too: the page can't know either way.
  const refused = async () => (await served(page)).filter((s) => s === 'projects:archived:refused').length
  await expect.poll(refused, { timeout: 15_000 }).toBeGreaterThanOrEqual(4)
  await expect(page.getByText('This project is archived')).toHaveCount(0)
  await expect(page.getByText('Couldn’t load your archived projects.')).toHaveCount(0)
  await header(page).getByRole('button', { name: 'Fixture project' }).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText(['Rename…', 'Activity', 'Leave project…'])
})

test('archive · an editor opens an archived project, with nothing to bring back; none archived, no fold', async ({
  page,
}) => {
  await page.goto('/work-space.html?archived=1&role=editor')
  await page.getByRole('button', { name: 'Archived (1)' }).click()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Old pilot' }).getByRole('button', { name: 'Unarchive' }),
  ).toHaveCount(0)
  await page.goto('/work-space.html')
  await expect(page.getByRole('button', { name: /^Archived/ })).toHaveCount(0)
})
