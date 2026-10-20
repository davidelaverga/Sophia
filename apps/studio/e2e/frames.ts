import { expect, type Page } from '@playwright/test'

// The browser's frames as a loaded machine draws them (docs/plans/voice-amplitude.md, «Slow frames»): CI's room run of
// #462 drew about 8 a second, and what follows a voice or a spring must still keep to the clock there.

/** Each frame asked for runs 125 ms later: 8 a second. */
const slow = () => {
  window.requestAnimationFrame = (run) => window.setTimeout(() => run(performance.now()), 125)
  window.cancelAnimationFrame = (id) => window.clearTimeout(id)
}

/** Frames at 8 a second from the page's first script. */
export const slowFrames = (page: Page) => page.addInitScript(slow)

/** Frames at 8 a second from now on, on a page already open: what was drawn before drew at the browser's own rate. */
export const slowFramesFromNow = (page: Page) => page.evaluate(slow)

/**
 * After a refusal shows: at least `floorMs`, then until more than `frames` frames have run since the client saw it
 * (`counted`, read from the spec's own trace), however slowly the machine draws. A fixed wait alone counted 7 to 10 on
 * CI's runners (docs/plans/ci-home-needs-refusal-flake.md).
 */
export async function framesAfterRefusal(page: Page, counted: () => Promise<number>, frames = 10, floorMs = 400) {
  await page.waitForTimeout(floorMs)
  await expect.poll(counted).toBeGreaterThan(frames)
}
