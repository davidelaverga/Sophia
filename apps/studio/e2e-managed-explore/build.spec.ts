import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { projectRoute } from './api-fixture.ts'
import { mockBuild, source, target } from './build-fixture.ts'

async function openHandoff(page: Page) {
  await page.goto(projectRoute)
  await page.locator('.panel-toggles [data-panel="brief"]').click()
  await page.getByRole('button', { name: 'Explore with Codex' }).click()
  await page.getByRole('button', { name: 'Resume Explore' }).click()
  await page.getByRole('button', { name: 'Open v2 · Latest · Approved' }).click()
  await page.getByRole('button', { name: 'Open in Build' }).click()
  await expect(page.getByRole('heading', { name: 'Build handoff' })).toBeVisible()
}

async function bind(page: Page) {
  const form = page.getByRole('region', { name: 'Manual Build exchange' })
  await form.getByLabel('GitHub repository (owner/name)').fill(target.repository)
  await form.getByLabel('GitHub repository ID').fill(target.repositoryId)
  await form.getByLabel('Default branch').fill(target.defaultBranch)
  await form.getByLabel('Full README seed commit').fill(target.seedCommit.toUpperCase())
  const action = form.getByRole('button', { name: 'Bind repository' })
  await expect(action).toBeDisabled()
  await form.getByRole('checkbox', { name: /confirm the repository is private/ }).check()
  await action.click()
  await expect(form.getByRole('button', { name: 'Retry same request' })).toBeVisible()
}

async function report(page: Page) {
  await page.getByLabel('Candidate commit').fill('B'.repeat(40))
  await page.getByLabel('Pull request number').fill('7')
  await page.getByLabel('Merge commit').fill('C'.repeat(40))
  await page.getByLabel('Deployment reference').fill('fixture-release-7')
  await page.getByLabel('Deployed commit').fill('C'.repeat(40))
  await page.getByRole('button', { name: 'Save reported evidence' }).click()
  await expect(page.getByText('Reported · independent verification pending')).toBeVisible()
}

test('approved Build remains readable when the exchange route is unavailable', async ({ page }) => {
  const fixture = await mockBuild(page, true)
  await openHandoff(page)
  await expect(page.getByText('Manual Build exchange is unavailable.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bind repository' })).toHaveCount(0)
  expect(fixture.calls).toEqual([])
})

test('binds once, verifies exact source bytes, and restores reported evidence after reload', async ({ page }, info) => {
  const fixture = await mockBuild(page)
  await openHandoff(page)
  expect(fixture.calls).toEqual([])
  await bind(page)
  await openHandoff(page)
  await page.getByRole('button', { name: 'Retry same request' }).click()
  await expect(page.getByRole('heading', { name: target.repository })).toBeVisible()
  expect(fixture.calls).toHaveLength(2)
  expect(fixture.calls[0]).toEqual(fixture.calls[1])
  fixture.corruptManifest = true
  await page.getByRole('button', { name: 'Prepare export' }).click()
  await expect(page.getByText('The prepared export could not be verified.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download approved source' })).toHaveCount(0)
  fixture.corruptManifest = false
  const handoff = page.getByRole('region', { name: 'Manual Build exchange' })
  await handoff.getByRole('button', { name: 'Check again' }).click()
  const downloadButton = page.getByRole('button', { name: 'Download approved source' })
  const saved: string[] = []
  page.on('download', (file) => saved.push(file.suggestedFilename()))
  const fileReply = Promise.withResolvers<void>()
  fixture.holdFile = fileReply.promise
  await downloadButton.click()
  await page.getByRole('button', { name: 'Cancel download' }).click()
  await expect(downloadButton).toBeEnabled()
  fixture.holdFile = null
  fileReply.resolve()
  fixture.corrupt = true
  await downloadButton.click()
  await expect(page.getByText('The approved file could not be verified. Try the download again.')).toBeVisible()
  expect(saved).toEqual([])
  fixture.corrupt = false
  const downloader = page.waitForEvent('download')
  await downloadButton.click()
  const file = await downloader
  expect(file.suggestedFilename()).toEqual('index.html')
  expect(await readFile(await file.path())).toEqual(source)
  await report(page)
  await openHandoff(page)
  const evidence = page.getByRole('region', { name: 'Saved build evidence' })
  await expect(evidence.getByText('Reported · independent verification pending')).toBeVisible()
  await expect(evidence.getByText('fixture-release-7')).toBeVisible()
  expect(fixture.calls).toHaveLength(4)
  await evidence.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('build-evidence.png') })
})
