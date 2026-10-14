// Who accepts a direction (docs/plans/direction-who-accepts.md): the form says it in Save's tip and to a screen reader
// (its description), not as a sentence under the button — «Say less» (CONTRIBUTING.md, Codex P1s on #331).
import { expect, test } from '@playwright/test'

const NOTE = 'Saving proposes it. Any editor or admin can accept it, you included.'

test('direction · Save says who accepts it in its tip and its description, with no sentence under it', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&exchange=open')
  await page.getByRole('button', { name: 'Brief', exact: true }).click()
  await page.getByRole('button', { name: /^(Edit|Add) direction$/ }).click()
  const save = page.getByRole('button', { name: 'Save direction' })
  await expect(save).toHaveAccessibleDescription(NOTE)
  await save.focus()
  await expect(save.locator('.tip')).toHaveText(NOTE)
  // The words are the tip's and the description's alone: no paragraph under the button says them.
  await expect(page.locator('p', { hasText: NOTE })).toHaveCount(0)
})
