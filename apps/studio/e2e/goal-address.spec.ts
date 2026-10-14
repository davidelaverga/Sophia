// A goal named in the address is followed once (Codex P2 on #300): «Open in Tasks» chooses it; choosing another goal in
// the rail, going to Goals and back, keeps the one chosen, never the address that has gone.
import { expect, test } from '@playwright/test'

const FIRST = 'Reports export to PDF reliably'
const SECOND = 'The report pane says what an export is doing'

test('goals · after «Open in Tasks», another goal chosen in the rail stays chosen across a visit to Goals', async ({
  page,
}) => {
  await page.goto('/work.html?two=1&view=goals')
  await page.getByRole('button', { name: FIRST, exact: true }).click()
  await page.getByRole('dialog', { name: FIRST }).getByRole('button', { name: 'Open in Tasks' }).click()
  await expect(page.getByRole('tab', { name: new RegExp(FIRST) })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: new RegExp(SECOND) }).click()
  await expect(page.getByRole('tab', { name: new RegExp(SECOND) })).toHaveAttribute('aria-selected', 'true')
  const views = page.getByRole('navigation', { name: 'Project views' })
  await views.getByRole('link', { name: 'Goals' }).click()
  await expect(page.getByRole('heading', { name: 'Goals', level: 2 })).toBeVisible()
  await views.getByRole('link', { name: 'Tasks' }).click()
  await expect(page.getByRole('tab', { name: new RegExp(SECOND) })).toHaveAttribute('aria-selected', 'true')
})
