import { readFile } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { PROJECT } from '../fixtures/data.ts'
import type { VerificationReceipt } from '../src/api/explore-build-handoff.ts'
import { buildReviewPath } from '../src/app/route.ts'
import { approval, fixtureSessionId, projectRoute } from './api-fixture.ts'
import {
  legacyDeploymentReference,
  mockBuild,
  returnId,
  source,
  target,
  verificationDeploymentReference,
} from './build-fixture.ts'

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

async function report(page: Page, deploymentReference = legacyDeploymentReference) {
  await page.getByLabel('Candidate commit').fill('B'.repeat(40))
  await page.getByLabel('Pull request number').fill('7')
  await page.getByLabel('Merge commit').fill('C'.repeat(40))
  await page.getByLabel('Deployment reference').fill(deploymentReference)
  await page.getByLabel('Deployed commit').fill('C'.repeat(40))
  await page.getByRole('button', { name: 'Save reported evidence' }).click()
  await expect(page.getByText('Reported evidence')).toBeVisible()
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
  await expect(evidence.getByText('Reported evidence')).toBeVisible()
  await expect(page.getByText('Independent verification status unavailable')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy reviewer link' })).toHaveCount(0)
  await expect(evidence.getByText('fixture-release-7')).toBeVisible()
  expect(fixture.calls).toHaveLength(4)
  await evidence.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('build-evidence.png') })
})

async function createReportedRelease(page: Page) {
  const fixture = await mockBuild(page, false, verificationDeploymentReference)
  fixture.dropBindReply = false
  await openHandoff(page)
  const handoff = page.getByRole('region', { name: 'Manual Build exchange' })
  await handoff.getByLabel('GitHub repository (owner/name)').fill(target.repository)
  await handoff.getByLabel('GitHub repository ID').fill(target.repositoryId)
  await handoff.getByLabel('Default branch').fill(target.defaultBranch)
  await handoff.getByLabel('Full README seed commit').fill(target.seedCommit)
  await handoff.getByRole('checkbox', { name: /confirm the repository is private/ }).check()
  await handoff.getByRole('button', { name: 'Bind repository' }).click()
  await handoff.getByRole('button', { name: 'Prepare export' }).click()
  await report(page, verificationDeploymentReference)

  return fixture
}

test('reads exact verification outcomes in the founder handoff and keeps earlier receipts with their reported return', async ({
  page,
}, info) => {
  const fixture = await createReportedRelease(page)
  const receipt = unknownReceipt(fixture.state.returns[0])
  fixture.state.verification = {
    status: 'awaiting_verification',
    currentReturnId: returnId,
    receipts: [receipt],
    checks: { sourceReview: 'unknown', deployedApp: 'pending' },
  }
  await openHandoff(page)
  await expect(page.getByText('Awaiting independent verification')).toBeVisible()
  const current = page.getByRole('region', { name: 'Current independent verification' })
  await expect(current.getByText('Unknown', { exact: true })).toBeVisible()
  await expect(current.getByText('Pending', { exact: true })).toBeVisible()
  await expect(page.getByText(verificationDeploymentReference, { exact: true })).toBeVisible()
  await expect(page.getByText('Source review · unknown')).toBeVisible()
  await page
    .locator('.build-evidence-history')
    .screenshot({ path: info.outputPath('founder-pending.png'), animations: 'disabled' })
  await expect(page.getByText('Verified in app')).toHaveCount(0)

  const address = { projectId: PROJECT, sessionId: fixtureSessionId, approvalId: approval.id, returnId }
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: () => Promise.reject(new Error('Synthetic clipboard refusal')),
    }),
  )
  await page.getByRole('button', { name: 'Copy reviewer link' }).click()
  await expect(page.getByLabel('Reviewer link')).toHaveValue(new URL(buildReviewPath(address), page.url()).href)

  fixture.state.verification = {
    status: 'verified_in_app',
    checks: { sourceReview: 'passed', deployedApp: 'passed' },
    currentReturnId: returnId,
    receipts: [
      receipt,
      { ...receipt, id: '00000000-0000-4000-8000-000000000952', outcome: 'passed' },
      {
        ...receipt,
        id: '00000000-0000-4000-8000-000000000953',
        kind: 'deployed_app',
        outcome: 'passed',
        mappingSourceSha: receipt.target.mergeSha,
        observedDeployedSha: receipt.target.deployedSha,
        observedDeploymentReference: receipt.target.deploymentReference,
      },
    ],
  }
  await openHandoff(page)
  await expect(page.getByText('Verified in app')).toBeVisible()
  await expect(page.getByText('Deployed app check · passed')).toBeVisible()
  await page
    .locator('.build-evidence-history')
    .screenshot({ path: info.outputPath('founder-verified.png'), animations: 'disabled' })
  await showWithdrawnAndEarlier(page, info, fixture)
})

async function showWithdrawnAndEarlier(page: Page, info: TestInfo, fixture: Awaited<ReturnType<typeof mockBuild>>) {
  const projection = fixture.state.verification
  if (!projection) throw new Error('Expected verification projection')
  fixture.state.verification = {
    ...projection,
    status: 'awaiting_verification',
    checks: { sourceReview: 'authority_withdrawn', deployedApp: 'passed' },
  }
  await openHandoff(page)
  const current = page.getByRole('region', { name: 'Current independent verification' })
  await expect(current.getByText('Reviewer authority withdrawn')).toBeVisible()
  await expect(current.getByText('Passed', { exact: true })).toHaveCount(1)
  await expect(current.getByText('Verified in app')).toHaveCount(0)
  const saved = page.getByRole('region', { name: 'Saved build evidence' })
  await expect(saved.getByText('Recorded observations')).toBeVisible()
  await expect(saved.getByText('Source review · passed')).toBeVisible()
  await page
    .locator('.build-evidence-history')
    .screenshot({ path: info.outputPath('founder-withdrawn.png'), animations: 'disabled' })
  const newId = '00000000-0000-4000-8000-000000000954'
  const older = fixture.state.returns[0]
  if (!older) throw new Error('Expected the saved founder return')
  fixture.state.returns.push({ ...older, id: newId, candidateSha: undefined })
  fixture.state.verification = { ...fixture.state.verification, status: 'reported', currentReturnId: newId }
  await openHandoff(page)
  await expect(page.getByText('An exact PR, merge and deployment are needed for verification')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy reviewer link' })).toHaveCount(0)
  await expect(page.getByText('Verified in app')).toHaveCount(0)
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Current return' }).getByText('Deployed app check · passed'),
  ).toHaveCount(0)
  await expect(page.getByText('Deployed app check · passed')).toBeVisible()
  expect(fixture.calls).toHaveLength(3)
}

function unknownReceipt(
  record: Awaited<ReturnType<typeof mockBuild>>['state']['returns'][number] | undefined,
): VerificationReceipt {
  if (
    !record?.candidateSha ||
    !record.pullRequestNumber ||
    !record.mergeSha ||
    !record.deployedSha ||
    !record.deploymentReference
  ) {
    throw new Error('Expected an exact reported release')
  }
  return {
    id: '00000000-0000-4000-8000-000000000951',
    kind: 'source_review',
    outcome: 'unknown',
    scenario: 'Inspect the exact fictional candidate.',
    expected: 'Only a chief engineer may submit an explanation.',
    observed: 'The source check was unavailable.',
    recordedAt: '2026-11-22T20:00:00Z',
    evidenceReference: undefined,
    mappingSourceSha: undefined,
    observedDeployedSha: undefined,
    observedDeploymentReference: undefined,
    target: {
      returnId: record.id,
      repository: target.repository,
      repositoryId: record.repositoryId,
      exportId: record.exportId,
      exportSha256: record.exportSha256,
      candidateSha: record.candidateSha,
      pullRequestNumber: record.pullRequestNumber,
      mergeSha: record.mergeSha,
      deployedSha: record.deployedSha,
      deploymentReference: record.deploymentReference,
    },
  }
}
