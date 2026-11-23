import { expect, test, type Page } from '@playwright/test'
import { mockApi, projectRoute, v2 } from './api-fixture.ts'

// Safari 16.4 has the URL constructor and lacks this static parser.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(URL, 'parse')
  })
})

async function openPreview(page: Page) {
  await page.goto(projectRoute)
  expect(await page.evaluate(() => typeof URL.parse)).toBe('undefined')
  await page.locator('.panel-toggles [data-panel="brief"]').click()
  await page.getByRole('button', { name: 'Explore with Codex' }).click()
  await page.getByRole('button', { name: 'Resume Explore' }).click()
  const workspace = page.getByRole('complementary', { name: 'Explore workspace' })
  await workspace.getByRole('button', { name: 'Open v2 · Latest' }).click()
  return workspace
}

test('opens, exercises and approves the exact prototype without the static URL parser', async ({ page }) => {
  const calls = await mockApi(page, { existingVersions: true })
  const workspace = await openPreview(page)
  const frame = workspace.locator('iframe').contentFrame().locator('iframe')
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
  const prototype = frame.contentFrame()
  await prototype.getByRole('textbox', { name: 'Chief engineer explanation' }).fill('Waiting for the berth.')
  await prototype.getByRole('button', { name: 'Submit explanation' }).click()
  await expect(prototype.getByRole('button', { name: 'Assign follow-up' })).toBeEnabled()
  await workspace.getByRole('button', { name: 'Approve this version' }).click()
  await expect(workspace.getByText('Approved · v2')).toBeVisible()
  const approvals = calls.writes.filter(({ path }) => path.endsWith('/approvals'))
  expect(approvals).toHaveLength(1)
  expect(approvals[0]?.request).toMatchObject({ prototypeVersionId: v2.id, expectedManifestDigest: v2.manifestSha256 })
})

for (const [condition, url] of [
  ['malformed', 'https://[invalid'],
  ['off-origin', 'https://blocked-preview.example.test/v1/previews/synthetic-v2/index.html'],
] as const) {
  test(`keeps approval disabled for a ${condition} URL without the static parser`, async ({ page }) => {
    const calls = await mockApi(page, { existingVersions: true })
    const contact = [] as string[]
    await page.route('https://blocked-preview.example.test/**', (route) => {
      contact.push(route.request().url())
      return route.abort()
    })
    await page.route('**/preview-permits', (route) =>
      route.fulfill({
        json: {
          url,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          versionId: v2.id,
          entrySha256: v2.entrySha256,
          manifestSha256: v2.manifestSha256,
        },
      }),
    )
    const workspace = await openPreview(page)
    await expect(workspace.getByText('This version’s preview couldn’t be opened.')).toBeVisible()
    await expect(workspace.locator('iframe')).toHaveCount(0)
    await expect(workspace.getByRole('button', { name: 'Approve this version' })).toBeDisabled()
    expect(contact).toEqual([])
    expect(calls.writes.some(({ path }) => path.endsWith('/approvals'))).toBe(false)
  })
}
