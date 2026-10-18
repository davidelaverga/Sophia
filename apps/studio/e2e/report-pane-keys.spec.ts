import { expect, test } from '@playwright/test'

// The report pane's call switches show their keys (docs/plans/report-pane-keys.md; Codex P2 on #326): at 760 px or
// less a report covers the mini dock, whose keys still work; the pane's switches say them.

const PAGE = '/room.html?call=on&exchange=open&place=work&report=00000000-0000-4000-8000-0000000000b1'

test('report keys · outside the Studio, the pane’s microphone tip shows the key that works', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 800 })
  await page.goto(PAGE)
  const mic = page.locator('.report-pane-call').getByRole('button', { name: 'Microphone' })
  await expect(mic).toBeVisible()
  const key =
    (await page.locator('.mini-dock').getByRole('button', { name: 'Microphone' }).locator('kbd').textContent()) ?? ''
  expect(key).not.toBe('')
  await expect(mic.locator('kbd')).toHaveText(key)
  const pressed = await mic.getAttribute('aria-pressed')
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('ControlOrMeta+d')
  await expect(mic).not.toHaveAttribute('aria-pressed', pressed ?? '')
})
