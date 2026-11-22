import { expect, test, type Page } from '@playwright/test'
import { mockApi, projectRoute, v2 } from './api-fixture.ts'
import { fixedNavigation, navigationHash } from './preview.ts'

async function openPreview(page: Page, kind: 'early' | 'external' | 'local' | 'ancestor' | 'intrinsics') {
  const calls = await mockApi(page, { existingVersions: true })
  await page.route('**/preview-permits', (route) =>
    route.fulfill({
      json: {
        url: `http://localhost:5277/v1/previews/synthetic-${kind}/index.html`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        versionId: v2.id,
        entrySha256: navigationHash(kind),
        manifestSha256: v2.manifestSha256,
      },
    }),
  )
  await page.addInitScript(
    ({ versionId, entrySha256 }) => {
      const send = window.fetch.bind(window)
      window.fetch = async (input, init) => {
        const response = await send(input, init)
        if (!response.ok || !/\/sessions\/[^/]+$/u.test(new URL(response.url).pathname)) return response
        const json: unknown = await response.json()
        if (typeof json !== 'object' || json === null || !('versions' in json) || !Array.isArray(json.versions))
          return new Response(JSON.stringify(json), { headers: response.headers, status: response.status })
        const version: unknown = json.versions.find(
          (candidate: unknown) =>
            typeof candidate === 'object' && candidate !== null && 'id' in candidate && candidate.id === versionId,
        )
        if (version && typeof version === 'object') Object.assign(version, { entrySha256 })
        return new Response(JSON.stringify(json), { headers: response.headers, status: response.status })
      }
    },
    { versionId: v2.id, entrySha256: navigationHash(kind) },
  )
  await page.goto(projectRoute)
  await page.locator('.panel-toggles [data-panel="brief"]').click()
  await page.getByRole('button', { name: 'Explore with Codex' }).click()
  await page.getByRole('button', { name: 'Resume Explore' }).click()
  const workspace = page.getByRole('complementary', { name: 'Explore workspace' })
  await workspace.getByRole('button', { name: 'Open v2 · Latest' }).click()
  return {
    approve: workspace.getByRole('button', { name: 'Approve this version' }),
    document: workspace.locator('iframe').contentFrame().locator('iframe').contentFrame(),
    reads: () => calls.writes.filter(({ path }) => path.endsWith('/approvals')),
    workspace,
  }
}

test('early replacement cannot establish approval', async ({ page }) => {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const approves = document.querySelectorAll<HTMLButtonElement>('button')
      if (Array.from(approves).some((button) => button.textContent === 'Approve this version' && !button.disabled))
        document.documentElement.dataset.earlyApproval = 'enabled'
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] })
  })
  const { approve, reads, workspace } = await openPreview(page, 'early')
  await expect(approve).toBeDisabled()
  await expect(workspace.getByText('This version’s preview couldn’t be opened.')).toBeVisible({ timeout: 10_000 })
  expect(await page.locator('html').getAttribute('data-early-approval')).toBeNull()
  expect(reads()).toEqual([])
})

for (const kind of ['external', 'local'] as const) {
  test(`later ${kind} navigation permanently revokes approval for this frame`, async ({ page }) => {
    let outbound = 0
    await page.route(fixedNavigation, (route) => {
      outbound++
      return route.fulfill({ body: 'Fixed local test destination' })
    })
    const { approve, document, reads, workspace } = await openPreview(page, kind)
    await expect(approve).toBeEnabled()
    await document.getByRole('button', { name: 'Leave prototype' }).click()
    await expect(approve).toBeDisabled()
    await expect(workspace.getByText('This version’s preview couldn’t be opened.')).toBeVisible()
    expect(reads()).toEqual([])
    expect(outbound).toBe(0)
  })
}

test('an ordinary same-document link preserves approval', async ({ page }) => {
  const { approve, document, reads, workspace } = await openPreview(page, 'local')
  await expect(approve).toBeEnabled()
  await document.getByRole('link', { name: 'Jump to detail' }).click()
  await expect.poll(() => document.locator('body').evaluate(() => location.hash)).toBe('#detail')
  await approve.click()
  await expect(workspace.getByText('Approved · v2')).toBeVisible()
  expect(reads()).toHaveLength(1)
})

test('leaving while the final check is held sends no approval', async ({ page }) => {
  await page.addInitScript(() => {
    if (!location.pathname.endsWith('/synthetic-local/shell.html')) return
    const send: unknown = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'postMessage')?.value
    if (typeof send !== 'function') return
    let sent = 0
    MessagePort.prototype.postMessage = function (this: MessagePort, value: unknown) {
      if (++sent !== 2) Reflect.apply(send, this, [value])
    }
  })
  const { approve, document, reads, workspace } = await openPreview(page, 'local')
  await expect(approve).toBeEnabled()
  await approve.click()
  await expect(approve).toHaveAttribute('aria-disabled', 'true')
  await document
    .getByRole('button', { name: 'Leave prototype' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect(workspace.getByText('This version’s preview couldn’t be opened.')).toBeVisible()
  await expect(approve).toBeDisabled()
  expect(reads()).toEqual([])
  await workspace.getByRole('button', { name: 'Reopen this version' }).click()
  await expect(approve).toBeEnabled()
})

test('the opaque document cannot navigate its enclosing preview shell', async ({ page }) => {
  let outbound = 0
  await page.route(fixedNavigation, (route) => {
    outbound++
    return route.fulfill({ body: 'Fixed local test destination' })
  })
  const { approve, document, reads, workspace } = await openPreview(page, 'ancestor')
  await expect(approve).toBeEnabled()
  await document.getByRole('button', { name: 'Try to leave the outer frame' }).click()
  await expect(document.getByRole('status')).toHaveText('Browser refused outer-frame navigation')
  await expect(approve).toBeEnabled()
  expect(outbound).toBe(0)
  expect(reads()).toEqual([])

  // The browser enforces the inner attempt above. Independently exercise an actual outer document
  // replacement from the test driver to verify the Studio load fence if the shell ever changes.
  await workspace.locator('iframe').evaluate((frame: HTMLIFrameElement) => {
    frame.src = 'about:blank'
  })
  await expect(workspace.getByText('This version’s preview couldn’t be opened.')).toBeVisible()
  await expect(approve).toBeDisabled()
  expect(reads()).toEqual([])
})

test('retains document standards mode and attributes while using captured event primitives', async ({ page }) => {
  const { approve, document, reads, workspace } = await openPreview(page, 'intrinsics')
  await expect(approve).toBeEnabled()
  const result = await document.locator('html').evaluate((element) => ({
    mode: element.ownerDocument.compatMode,
    layout: element.ownerDocument.head.getAttribute('data-layout'),
    replacementCalled: element.hasAttribute('data-replaced-getter-invoked'),
  }))
  expect(result).toEqual({ mode: 'CSS1Compat', layout: 'compact', replacementCalled: false })
  await document.getByRole('button', { name: 'Run local interaction' }).click()
  await expect(document.getByRole('status')).toHaveText('Local interaction complete')
  await approve.click()
  await expect(workspace.getByText('Approved · v2')).toBeVisible()
  expect(reads()).toHaveLength(1)
})

test('the exact shell and inner URLs fail closed when navigated directly', async ({ page }) => {
  for (const name of ['shell', 'document']) {
    const response = await page.goto(`http://localhost:5277/v1/previews/synthetic-v2/${name}.html`)
    expect(response?.status()).toBe(404)
  }
  const download = page.waitForEvent('download')
  await page.goto('http://localhost:5277/v1/previews/synthetic-v2/index.html').catch(() => undefined)
  expect((await download).suggestedFilename()).toBe('index.html')
})
