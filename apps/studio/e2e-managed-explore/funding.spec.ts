import { expect, test, type Page, type TestInfo } from '@playwright/test'
import type { ExploreAccountSnapshot } from '../src/api/managed-explore.ts'
import { mockApi, projectRoute } from './api-fixture.ts'

const balance = 'API credit balance'
const recharge = 'Auto-recharge'
const observedAt = '2026-11-22T11:45:00.000Z'
const asOf = { currency: 'USD', observedAt } as const
const billingUrl = 'https://platform.openai.com/settings/organization/billing/overview'

async function openPreflight(page: Page) {
  await page.goto(projectRoute)
  await page.locator('.panel-toggles [data-panel="brief"]').click()
  await page.getByRole('button', { name: 'Explore with Codex' }).click()
  return page.getByRole('region', { name: 'Confirm the saved brief' })
}

const snapshot = (page: Page) => page.getByRole('region', { name: 'API billing snapshot' })
const value = (page: Page, term: string) => snapshot(page).getByText(term, { exact: true }).locator('..').locator('dd')

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

test('shows the same last-checked funding facts in the Brief confirmation and session', async ({ page }, info) => {
  const calls = await mockApi(page, { fundingSnapshot: { ...asOf, balanceCents: 3475, autoRechargeEnabled: true } })
  const preflight = await openPreflight(page)
  await expect(value(page, balance)).toHaveText('$34.75')
  await expect(value(page, recharge)).toHaveText('On')
  await expect(snapshot(page).locator('time')).toHaveAttribute('datetime', observedAt)
  await expect(snapshot(page).getByText(/Last checked/)).toBeVisible()
  const link = snapshot(page).getByRole('link', { name: 'Manage auto-recharge on OpenAI Platform' })
  await expect(link).toHaveAttribute('href', billingUrl)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(calls.writes).toEqual([])
  await screenshot(page, info, 'brief')
  await preflight.getByRole('button', { name: 'Start Explore' }).click()
  const workspace = page.getByRole('complementary', { name: 'Explore workspace' })
  await expect(workspace.getByRole('region', { name: 'API billing snapshot' })).toBeVisible()
  await expect(value(page, balance)).toHaveText('$34.75')
  await expect(value(page, recharge)).toHaveText('On')
  await expect(snapshot(page).locator('time')).toHaveAttribute('datetime', observedAt)
  await screenshot(page, info, 'session')
})

const balances: { name: string; wire?: ExploreAccountSnapshot | null; balance: string; recharge: string }[] = [
  {
    name: 'zero balance and disabled auto-recharge',
    wire: { ...asOf, balanceCents: 0, autoRechargeEnabled: false },
    balance: '$0.00',
    recharge: 'Off',
  },
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
    await expect(preflight.getByRole('button', { name: 'Start Explore' })).toBeEnabled()
    expect(calls.writes).toEqual([])
  })
}

test('unavailable admission exposes no funding figures or paid action', async ({ page }) => {
  const calls = await mockApi(page, {
    ineligible: true,
    fundingSnapshot: { ...asOf, balanceCents: 3475, autoRechargeEnabled: true },
  })
  const preflight = await openPreflight(page)
  await expect(preflight.getByText(/Explore is unavailable/)).toBeVisible()
  await expect(snapshot(page)).toHaveCount(0)
  await expect(preflight.getByRole('button', { name: 'Start Explore' })).toHaveCount(0)
  expect(calls.writes).toEqual([])
})
