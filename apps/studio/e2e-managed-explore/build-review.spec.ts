import { expect, test, type Page } from '@playwright/test'
import { PROJECT } from '../fixtures/data.ts'
import type { VerificationKind } from '../src/api/explore-build-handoff.ts'
import { buildReviewPath } from '../src/app/route.ts'
import { approval, fixtureSessionId } from './api-fixture.ts'
import { exportId, returnId, target, verificationDeploymentReference } from './build-fixture.ts'

const address = { projectId: PROJECT, sessionId: fixtureSessionId, approvalId: approval.id, returnId }
const path = buildReviewPath(address)
const apiPath = `/api/v1/projects/${PROJECT}/explore/sessions/${fixtureSessionId}/handoff/${approval.id}/verifications`
const exactTarget = {
  returnId,
  exportId,
  exportSha256: 'a'.repeat(64),
  repository: target.repository,
  repositoryId: target.repositoryId,
  candidateSha: 'b'.repeat(40),
  pullRequestNumber: 7,
  mergeSha: 'c'.repeat(40),
  deploymentReference: verificationDeploymentReference,
  deployedSha: 'c'.repeat(40),
}
const sourceScenario = {
  scenario: 'Inspect the final candidate for the fictional vessel release.',
  expected: 'The release enforces the chief engineer role.',
  observed: 'The check output was unavailable.',
}
const authorizations = new Map<string, VerificationKind>([
  ['Bearer synthetic-source-reviewer', 'source_review'],
  ['Bearer synthetic-deployment-verifier', 'deployed_app'],
])

async function routeReview(page: Page, dropNextReply = false) {
  const traffic: string[] = []
  const posts: { key: string; body: unknown }[] = []
  const receipts = new Map<string, object>()
  let revision = 4
  let rejectNext: { status: 403 | 409; revision: number } | null = null
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      traffic.push(url.pathname)
      const kind = authorizations.get(request.headers()['authorization'] ?? '')
      if (url.pathname !== apiPath || !kind) return route.fulfill({ status: 404 })
      if (request.method() === 'GET') {
        if (url.searchParams.get('returnId') !== returnId) return route.fulfill({ status: 404 })
        return route.fulfill({ json: { revision, kind, target: exactTarget } })
      }
      const key = request.headers()['idempotency-key'] ?? ''
      const body: unknown = request.postDataJSON()
      if (!body || typeof body !== 'object') throw new Error('Expected verification request body')
      posts.push({ key, body })
      const saved = receipts.get(key)
      if (saved) return route.fulfill({ json: saved })
      expect(body).toMatchObject({ returnId, kind, expectedRevision: revision })
      if (rejectNext) {
        const refusal = rejectNext
        rejectNext = null
        revision = refusal.revision
        return route.fulfill({ status: refusal.status })
      }
      const receipt = {
        ...body,
        id: `00000000-0000-4000-8000-${String(revision).padStart(12, '0')}`,
        target: exactTarget,
        recordedAt: '2026-11-22T20:00:00Z',
      }
      receipts.set(key, receipt)
      revision++
      if (dropNextReply) {
        dropNextReply = false
        return route.abort()
      }
      return route.fulfill({ json: receipt })
    },
  )
  return {
    traffic,
    posts,
    receipts,
    loseNextReply: () => {
      dropNextReply = true
    },
    rejectNextPost: (status: 403 | 409, nextRevision = revision) => {
      rejectNext = { status, revision: nextRevision }
    },
  }
}

async function signInAs(page: Page, identity: string) {
  await page.addInitScript((name) => sessionStorage.setItem('sophia.dev.identity', name), identity)
}

async function fillObservation(page: Page, outcome: 'unknown' | 'passed' | 'failed') {
  await page.getByLabel('Outcome').selectOption(outcome)
  await page.getByLabel('Role and scenario').fill(sourceScenario.scenario)
  await page.getByLabel('Expected behavior').fill(sourceScenario.expected)
  await page.getByLabel('Observed behavior').fill(sourceScenario.observed)
}

test('requires sign-in, scopes source review to the exact return and retries an unconfirmed save once', async ({
  page,
}) => {
  const fixture = await routeReview(page, true)
  await page.goto(path)
  await expect(page.getByRole('button', { name: /Source reviewer/ })).toBeVisible()
  expect(fixture.traffic).toEqual([])
  await page.getByRole('button', { name: /Source reviewer/ }).click()
  await expect(page).toHaveURL(new RegExp(`${path}$`, 'u'))
  await expect(page.getByRole('heading', { name: 'Source review' })).toBeVisible()
  await expect(page.getByText(exactTarget.candidateSha)).toBeVisible()
  await expect(page.getByRole('group', { name: 'Measured deployment identities' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download approved source' })).toHaveCount(0)
  await fillObservation(page, 'unknown')
  await page.getByRole('button', { name: 'Save verification' }).click()
  await expect(page.getByText('Sophia hasn’t confirmed the save.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Sophia hasn’t confirmed the save.')).toBeVisible()
  await page.getByRole('button', { name: 'Retry same request' }).click()
  await expect(page.getByText('Verification saved · unknown')).toBeVisible()
  expect(fixture.posts).toHaveLength(2)
  expect(fixture.posts[0]).toEqual(fixture.posts[1])
  expect(fixture.posts[0]?.body).toEqual({
    ...sourceScenario,
    kind: 'source_review',
    outcome: 'unknown',
    returnId,
    expectedRevision: 4,
  })
  expect(fixture.receipts.size).toBe(1)
  fixture.loseNextReply()
  await fillObservation(page, 'passed')
  const retestObservation = 'The recovered check output confirms the role restriction.'
  await page.getByLabel('Observed behavior').fill(retestObservation)
  await page.getByRole('button', { name: 'Save verification' }).click()
  await expect(page.getByText('Sophia hasn’t confirmed the save.')).toBeVisible()
  await expect(page.getByText('Verification saved · unknown')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save verification' })).toBeDisabled()
  await page.getByRole('button', { name: 'Retry same request' }).click()
  await expect(page.getByText('Verification saved · passed')).toBeVisible()
  expect(fixture.posts).toHaveLength(4)
  expect(fixture.posts[2]).toEqual(fixture.posts[3])
  expect(fixture.posts[2]?.key).not.toBe(fixture.posts[0]?.key)
  expect(fixture.posts[2]?.body).toMatchObject({ expectedRevision: 5, outcome: 'passed', observed: retestObservation })
  expect(fixture.receipts.size).toBe(2)
  expect(new Set(fixture.traffic)).toEqual(new Set([apiPath]))
})

test('a founder and a different return get the restricted door without any founder data reads', async ({ page }) => {
  const fixture = await routeReview(page)
  await signInAs(page, 'Founder')
  await page.goto(path)
  await expect(page.getByText('This Build return is unavailable to this account.')).toBeVisible()
  await expect(page.getByText(target.repository)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save verification' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('button', { name: /Source reviewer/ }).click()
  await expect(page.getByRole('heading', { name: 'Source review' })).toBeVisible()
  await signInAs(page, 'Source reviewer')
  await page.goto(buildReviewPath({ ...address, returnId: approval.id }))
  await expect(page.getByText('This Build return is unavailable to this account.')).toBeVisible()
  expect(new Set(fixture.traffic)).toEqual(new Set([apiPath]))
  expect(fixture.posts).toEqual([])
})

test('a deployment verifier confirms the exact mapping without overflowing a phone', async ({ page }, info) => {
  const fixture = await routeReview(page)
  await signInAs(page, 'Deployment verifier')
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Deployed app check' })).toBeVisible()
  await expect(page.getByText(exactTarget.deploymentReference)).toBeVisible()
  await page.screenshot({ path: info.outputPath('scoped-reviewer.png'), fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  )
  await fillObservation(page, 'passed')
  const mapping = page.getByLabel('Mapped source commit')
  await page.getByLabel('Observed deployed commit').fill(exactTarget.deployedSha)
  await page.getByLabel('Observed deployment URL').fill(exactTarget.deploymentReference)
  await mapping.fill('d'.repeat(40))
  await page.getByRole('button', { name: 'Save verification' }).click()
  await expect(page.getByText(/the measured deployment identities must match the return/)).toBeVisible()
  expect(fixture.posts).toEqual([])
  await mapping.fill(exactTarget.mergeSha)
  const save = page.getByRole('button', { name: 'Save verification' })
  await page.getByLabel('Role and scenario').fill('é'.repeat(2001))
  await save.click()
  await expect(page.getByText(/within 2,000 characters/)).toBeVisible()
  expect(fixture.posts).toEqual([])
  const scenario = '🧪'.repeat(2000)
  await page.getByLabel('Role and scenario').fill(scenario)
  await save.click()
  await expect(page.getByText('Verification saved · passed')).toBeVisible()
  expect(fixture.posts[0]?.body).toMatchObject({
    kind: 'deployed_app',
    mappingSourceSha: exactTarget.mergeSha,
    observedDeployedSha: exactTarget.deployedSha,
    observedDeploymentReference: exactTarget.deploymentReference,
    scenario,
  })
  expect(new Set(fixture.traffic)).toEqual(new Set([apiPath]))
})

test('a failed deployment check can record the different deployed commit without inventing a mapping', async ({
  page,
}) => {
  const fixture = await routeReview(page)
  await signInAs(page, 'Deployment verifier')
  await page.goto(path)
  await fillObservation(page, 'failed')
  const actualCommit = 'd'.repeat(40)
  await page.getByLabel('Observed deployed commit').fill(actualCommit)
  await page.getByRole('button', { name: 'Save verification' }).click()
  await expect(page.getByText('Verification saved · failed')).toBeVisible()
  expect(fixture.posts[0]?.body).toEqual({
    ...sourceScenario,
    expectedRevision: 4,
    returnId,
    kind: 'deployed_app',
    outcome: 'failed',
    observedDeployedSha: actualCommit,
  })
})

test('keeps the previous receipt through a stale withdrawal and saves with the latest revision', async ({ page }) => {
  const fixture = await routeReview(page)
  await signInAs(page, 'Deployment verifier')
  await page.goto(path)
  const save = page.getByRole('button', { name: 'Save verification' })
  const outcome = page.getByLabel('Outcome')
  const observed = page.getByLabel('Observed behavior')
  const mapping = page.getByLabel('Mapped source commit')
  const deployed = page.getByLabel('Observed deployed commit')
  const reference = page.getByLabel('Observed deployment URL')
  const evidence = page.getByLabel('Evidence URL (optional)')
  await fillObservation(page, 'passed')
  await mapping.fill(exactTarget.mergeSha)
  await deployed.fill(exactTarget.deployedSha)
  await reference.fill(exactTarget.deploymentReference)
  await evidence.fill('https://fictional.example.test/checks/first')
  await save.click()
  const passed = page.getByText('Verification saved · passed')
  await expect(passed).toBeVisible()
  await expect(outcome).toBeFocused()
  await expect(outcome).toBeInViewport()
  await expect(save).toBeDisabled()
  for (const field of [outcome, observed, mapping, deployed, reference, evidence]) await expect(field).toHaveValue('')

  fixture.rejectNextPost(409, 8)
  await fillObservation(page, 'failed')
  const loss = 'The deployment now fails the role check.'
  await observed.fill(loss)
  await page.route(
    (url) => url.pathname === apiPath && url.searchParams.has('returnId'),
    (route) => route.fulfill({ status: 503 }),
    { times: 1 },
  )
  await save.click()
  await expect(
    page.getByText('The Build return changed or this evidence already exists.', { exact: false }),
  ).toBeVisible()
  const checkAgain = page.getByRole('button', { name: 'Check again' })
  await expect(passed).toBeVisible()
  await expect(observed).toHaveValue(loss)
  await expect(save).toBeDisabled()
  await checkAgain.click()
  await save.click()
  await expect(page.getByText('Verification saved · failed')).toBeVisible()
  await expect(passed).toHaveCount(0)
  expect(fixture.posts.map(({ body }) => body)).toMatchObject([
    { expectedRevision: 4, outcome: 'passed' },
    { expectedRevision: 5, outcome: 'failed', observed: loss },
    { expectedRevision: 8, outcome: 'failed', observed: loss },
  ])
  expect(new Set(fixture.posts.map(({ key }) => key)).size).toBe(3)
  expect(fixture.receipts.size).toBe(2)

  fixture.rejectNextPost(403)
  await fillObservation(page, 'unknown')
  await save.click()
  await expect(page.getByText('This Build return is unavailable to this account.')).toBeVisible()
  await expect(page.getByText('Verification saved · failed')).toHaveCount(0)
  await expect(save).toHaveCount(0)
  await expect(page.getByText(target.repository)).toHaveCount(0)
  expect(fixture.receipts.size).toBe(2)
})

test('malformed and promotion-off reviewer links make no project requests', async ({ page }) => {
  const fixture = await routeReview(page)
  await signInAs(page, 'Source reviewer')
  await page.goto('/build-review/malformed')
  await expect(page.getByRole('heading', { name: 'Build review is unavailable' })).toBeVisible()
  await page.goto(`http://127.0.0.1:5278${path}`)
  await expect(page.getByRole('heading', { name: 'Build review is unavailable' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to Sophia' })).toBeVisible()
  expect(fixture.traffic).toEqual([])
})
