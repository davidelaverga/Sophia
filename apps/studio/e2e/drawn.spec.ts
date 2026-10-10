import { expect, test } from '@playwright/test'
import { coversOnScreen, DRAWN, drawn } from './drawn.ts'

// drawn.ts's own check (docs/plans/knowledge-covers-drawn.md): Knowledge has drawn once every cover on screen has, not
// the first alone, so the checks that measure it (ink, type scale) measure every cover's words. With `covers=slow` the
// library's covers read 400 ms apart.

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

for (const phone of [false, true]) {
  test(`drawn${phone ? ' @phone' : ''} · Knowledge waits for every cover on screen`, async ({ page }) => {
    await page.goto('/room.html?demo=1&place=knowledge&covers=slow')
    // The covers do come after the list (else this checks nothing).
    await expect(page.getByText('Pilot readout: what kept 12 of 14 teams').first()).toBeVisible()
    expect(await coversOnScreen(page)).toContain('waiting')
    await drawn(page, DRAWN.knowledge)
    const covers = await coversOnScreen(page)
    expect(covers.length).toBeGreaterThan(phone ? 0 : 1)
    expect(covers).not.toContain('waiting')
  })
}
