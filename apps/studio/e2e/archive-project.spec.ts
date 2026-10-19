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
