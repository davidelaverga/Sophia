import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import type { ExploreAccountSnapshot } from '../src/api/managed-explore.ts'
import { brief, fixtureSessionId, mockApi, projectRoute } from './api-fixture.ts'

const balance = 'Reported account balance'
const recharge = 'Auto-recharge'
const observedAt = '2026-11-22T11:45:00.000Z'
const asOf = { currency: 'USD', observedAt } as const
const zero = { ...asOf, balanceCents: 0, autoRechargeEnabled: false }
const positive = { ...asOf, balanceCents: 3475, autoRechargeEnabled: true }
const billingUrl = 'https://platform.openai.com/settings/organization/billing/overview'
const actionEffect = 'Sends this brief to the Explore queue. Codex uses your OpenAI API credits when it runs.'
const waiting = 'Request saved. Waiting for Codex.'
const fundingName = 'Open OpenAI billing (opens in a new tab)'

async function openPreflight(page: Page) {
  await page.goto(projectRoute)
  await page.locator('.panel-toggles [data-panel="brief"]').click()
  await page.getByRole('button', { name: 'Explore with Codex' }).click()
  return page.getByRole('region', { name: 'Confirm the saved brief' })
}

const snapshot = (page: Page) => page.getByRole('region', { name: 'API billing snapshot' })
const value = (page: Page, term: string) => snapshot(page).getByText(term, { exact: true }).locator('..').locator('dd')
const workspace = (page: Page) => page.getByRole('complementary', { name: 'Explore workspace' })
const disclosure = (page: Page) => workspace(page).getByText('Funding details', { exact: true })
const composer = (page: Page) => workspace(page).getByRole('textbox', { name: 'Message Codex' })

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: info.outputPath(`synthetic-funding-${name}.png`),
    style: `:root::after {
      content: 'Synthetic billing fixture'; position: fixed; right: 14px; bottom: 96px; z-index: 1000;
      padding: 5px 8px; border-radius: 4px; color: #e6f4ff; background: #18344c; font: 12px system-ui;
      pointer-events: none;
    }`,
  })
}

async function expectObservation(page: Page) {
  await expect(value(page, balance)).toHaveText('$0.00')
  await expect(value(page, recharge)).toHaveText('Off')
  await expect(snapshot(page).locator('time')).toHaveAttribute('datetime', observedAt)
  await expect(snapshot(page).getByText(/Reported by the account operator/)).toBeVisible()
}

async function openDetails(page: Page, mobile: boolean) {
  if (mobile) return disclosure(page).tap()
  await disclosure(page).focus()
  await page.keyboard.press('Enter')
}

async function openBilling(page: Page, link: Locator, mobile: boolean) {
  await expect(link).toHaveAttribute('href', billingUrl)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await page.context().route(billingUrl, (route) => route.fulfill({ body: 'Synthetic billing destination' }))
  const newTab = page.waitForEvent('popup')
  if (mobile) await link.tap()
  else {
    await link.focus()
    await page.keyboard.press('Enter')
  }
  const popup = await newTab
  await popup.waitForURL(billingUrl)
  await popup.close()
}

test('explains the queue on the Brief and keeps a synthetic saved request readable with funding closed or open', async ({
  page,
  isMobile,
}, info) => {
  const calls = await mockApi(page, { fundingSnapshot: zero, initialTurn: { status: 'queued', error: null } })
  const preflight = await openPreflight(page)
  await expect(preflight.getByText(brief)).toBeVisible()
  await expect(preflight.getByText('Saved note · revision 3')).toBeVisible()
  await expect(preflight.getByText('OpenAI API credits', { exact: true })).toBeVisible()
  await expectObservation(page)
  await openBilling(page, snapshot(page).getByRole('link', { name: fundingName }), isMobile)
  const start = preflight.getByRole('button', { name: 'Start Explore' })
  await expect(start).toHaveAccessibleDescription(actionEffect)
  await expect(preflight.getByText(actionEffect)).toBeVisible()
  expect(calls.writes).toEqual([])
  await screenshot(page, info, 'brief')
  await start.click()
  await expect(workspace(page).getByText(waiting)).toBeVisible()
  expect(calls.writes).toHaveLength(1)
  await (await openPreflight(page)).getByRole('button', { name: 'Resume Explore' }).click()
  await expect(workspace(page).getByText('OpenAI API credits', { exact: true })).toBeVisible()
  await expect(workspace(page).getByText('Queued', { exact: true })).toBeVisible()
  await expect(workspace(page).getByText(waiting)).toBeVisible()
  await expect(workspace(page).getByText(brief, { exact: true }).last()).toBeVisible()
  await expect(snapshot(page)).toHaveCount(0)
  await expect(composer(page)).toBeInViewport()
  await screenshot(page, info, 'resumed-closed')
  await openDetails(page, isMobile)
  await expectObservation(page)
  await openBilling(page, snapshot(page).getByRole('link', { name: fundingName }), isMobile)
  await expect(composer(page)).toBeInViewport()
  await screenshot(page, info, 'resumed-open')
  await openDetails(page, isMobile)
  await expect(snapshot(page)).toHaveCount(0)
  expect(calls.writes).toHaveLength(1)
  expect(new Set(calls.sessionReads)).toEqual(new Set([fixtureSessionId]))
  if (isMobile) {
    await workspace(page).getByRole('button', { name: 'Room', exact: true }).tap()
    await expect(workspace(page)).toHaveCount(0)
  } else {
    const back = workspace(page).getByRole('button', { name: 'Back to Brief' })
    await back.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Explore with Codex' })).toBeVisible()
  }
  expect(calls.writes).toHaveLength(1)
})

const balances: { name: string; wire?: ExploreAccountSnapshot | null; balance: string; recharge: string }[] = [
  { name: 'a positive balance and enabled auto-recharge', wire: positive, balance: '$34.75', recharge: 'On' },
  { name: 'zero balance and disabled auto-recharge', wire: zero, balance: '$0.00', recharge: 'Off' },
  {
    name: 'a negative balance and unknown auto-recharge',
    wire: { ...asOf, balanceCents: -215, autoRechargeEnabled: null },
    balance: '-$2.15',
    recharge: 'Unavailable',
  },
  {
    name: 'an unknown balance and enabled auto-recharge',
    wire: { ...asOf, balanceCents: null, autoRechargeEnabled: true },
    balance: 'Unavailable',
    recharge: 'On',
  },
  {
    name: 'a balance at the safe integer limit',
    wire: { ...asOf, balanceCents: Number.MAX_SAFE_INTEGER, autoRechargeEnabled: false },
    balance: '$90,071,992,547,409.91',
    recharge: 'Off',
  },
  { name: 'a null snapshot', wire: null, balance: 'Unavailable', recharge: 'Unavailable' },
  { name: 'an omitted snapshot', balance: 'Unavailable', recharge: 'Unavailable' },
]

for (const sample of balances) {
  test(`distinguishes ${sample.name} without changing admission`, async ({ page }) => {
    const calls = await mockApi(page, sample.wire === undefined ? {} : { fundingSnapshot: sample.wire })
    const preflight = await openPreflight(page)
    await expect(value(page, balance)).toHaveText(sample.balance)
    await expect(value(page, recharge)).toHaveText(sample.recharge)
    await expect(snapshot(page).locator('time')).toHaveCount(sample.wire ? 1 : 0)
    if (sample.wire) await expect(snapshot(page).locator('time')).toHaveAttribute('datetime', observedAt)
    else await expect(snapshot(page).getByText('No account report available')).toHaveCount(1)
    await expect(preflight.getByRole('button', { name: 'Start Explore' })).toBeEnabled()
    expect(calls.writes).toEqual([])
  })
}

test('wraps a large report in the session and preserves the composer and return controls', async ({
  page,
  isMobile,
}) => {
  await mockApi(page, {
    existingSession: true,
    fundingSnapshot: { ...asOf, balanceCents: Number.MAX_SAFE_INTEGER, autoRechargeEnabled: null },
  })
  await (await openPreflight(page)).getByRole('button', { name: 'Resume Explore' }).click()
  await openDetails(page, isMobile)
  await expect(value(page, balance)).toBeInViewport()
  await expect(workspace(page).getByRole('button', { name: 'Back to Brief' })).toBeInViewport()
  await expect(composer(page)).toBeInViewport()
})

test('opaque admission denial hides a positive report and offers a focused return to Brief', async ({ page }) => {
  const calls = await mockApi(page, { preflightUnavailable: 'opaque', fundingSnapshot: positive })
  const preflight = await openPreflight(page)
  await expect(preflight.getByText('Explore is unavailable for this note.')).toBeVisible()
  await expect(snapshot(page)).toHaveCount(0)
  await expect(preflight.getByRole('button', { name: 'Start Explore' })).toHaveCount(0)
  await expect(preflight.getByRole('button', { name: 'Check again' })).toHaveCount(0)
  const reads = calls.preflights
  await preflight.getByRole('button', { name: 'Back to Brief' }).click()
  await expect(preflight).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Explore with Codex' })).toBeFocused()
  expect(calls.writes).toEqual([])
  expect(calls.preflights).toBe(reads)
})

test('a recoverable preflight failure retries the read only', async ({ page }) => {
  const calls = await mockApi(page, { preflightUnavailable: 'temporary', fundingSnapshot: zero })
  const preflight = await openPreflight(page)
  await expect(preflight.getByText('Explore is unavailable for this note.')).toBeVisible()
  const reads = calls.preflights
  calls.preflightTemporary = false
  await preflight.getByRole('button', { name: 'Check again' }).click()
  await expectObservation(page)
  expect(calls.preflights).toBeGreaterThan(reads)
  expect(calls.writes).toEqual([])
})

test('a different funding route has no report in the Brief or resumed session', async ({ page, isMobile }) => {
  await mockApi(page, { existingSession: true, fundingRouteMismatch: true, fundingSnapshot: positive })
  const preflight = await openPreflight(page)
  await expect(snapshot(page).getByText('No account report available')).toBeVisible()
  await preflight.getByRole('button', { name: 'Resume Explore' }).click()
  await openDetails(page, isMobile)
  await expect(snapshot(page).getByText('No account report available')).toBeVisible()
  await expect(value(page, balance)).toHaveText('Unavailable')
  await expect(value(page, recharge)).toHaveText('Unavailable')
})

test('a lost start response resumes the same queued request without another write', async ({ page }) => {
  const calls = await mockApi(page, {
    fundingSnapshot: zero,
    startReplyLost: true,
    initialTurn: { status: 'queued', error: null },
  })
  const preflight = await openPreflight(page)
  await preflight.getByRole('button', { name: 'Start Explore' }).click()
  await expect(preflight.getByRole('button', { name: 'Resume Explore' })).toBeVisible()
  await (await openPreflight(page)).getByRole('button', { name: 'Resume Explore' }).click()
  await expect(workspace(page).getByText(waiting)).toBeVisible()
  expect(calls.writes).toHaveLength(1)
  expect(new Set(calls.sessionReads)).toEqual(new Set([fixtureSessionId]))
})

for (const status of ['running', 'outcome_unknown'] as const) {
  test(`does not claim a provider run from ${status}`, async ({ page }) => {
    await mockApi(page, { existingSession: true, initialTurn: { status, error: null } })
    await (await openPreflight(page)).getByRole('button', { name: 'Resume Explore' }).click()
    await expect(workspace(page).getByText('Checking whether Codex started.')).toBeVisible()
  })
}

test('shows an authoritative persistent funding failure beside its turn and a return action', async ({ page }) => {
  await mockApi(page, {
    existingSession: true,
    fundingSnapshot: positive,
    initialTurn: { status: 'failed', error: 'funding_unavailable' },
  })
  await (await openPreflight(page)).getByRole('button', { name: 'Resume Explore' }).click()
  const discussion = workspace(page).getByRole('region', { name: 'Codex discussion' })
  await expect(
    discussion.getByText('Funding verification needed. Ask the account operator to check Explore funding.'),
  ).toBeVisible()
  await discussion.getByRole('button', { name: 'Back to Brief' }).click()
  await expect(page.getByRole('button', { name: 'Explore with Codex' })).toBeVisible()
})
