import type { Page } from '@playwright/test'

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
