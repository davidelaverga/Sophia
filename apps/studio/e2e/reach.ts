import type { Locator } from '@playwright/test'

/** Whether a press `by` px above an element still reaches it (its touch target, past what it draws). */
export const reaches = (l: Locator, by: number) =>
  l.evaluate((e, dy) => {
    const r = e.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top - dy)
    return Boolean(hit && (hit === e || e.contains(hit)))
  }, by)
