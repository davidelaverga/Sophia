import { expect, type Locator, type Page } from '@playwright/test'

// What a fixture page shows once it has drawn (docs/plans/type-scale-drawn.md): a part for each read that fills it,
// the last of a chain included, so a check that measures the page measures it whole. Never «the network is idle»: a
// fixture page keeps loading as it draws, and a quiet moment may not come in time on a slow runner.

type Part = (page: Page) => Locator

/** A project's bar has drawn: its Invite, which the membership's read brings. */
const BAR: Part = (page) => page.getByRole('button', { name: 'Invite' })

export const DRAWN = {
  home: [
    // Work's index and «You and Sophia», each its own read.
    (page) => page.getByText('Launch plan').first(),
    (page) => page.getByText('1 note').first(),
  ],
  personal: [
    (page) => page.getByText('I have a pitch on Friday and I keep putting off the deck.').first(),
    (page) => page.getByText('1 note').first(),
  ],
  room: [BAR, (page) => page.getByText('The room is ready')],
  knowledge: [
    BAR,
    (page) => page.getByText('Pilot readout: what kept 12 of 14 teams').first(),
    // A cover draws three reads after the list (its versions, its content, its check), once in reach: on a wide
    // screen cards with written covers are (their words are measured); on a phone only the first, a designed page.
    (page) =>
      (page.viewportSize()?.width ?? 0) > 600
        ? page.locator('.report-cover-page').first()
        : page.locator('.report-cover:not([data-cover="waiting"])').first(),
  ],
  updates: [BAR, (page) => page.getByText('Reports open on the answer'), (page) => page.getByText('38 min')],
  conversations: [
    BAR,
    // A message no row shows as its last: only the thread's own read brings it.
    (page) => page.getByRole('region', { name: 'Messages' }).getByText('Added them, cited.'),
    (page) => page.getByText('Map first, list second'),
  ],
} satisfies Record<string, readonly Part[]>

/** Waits until every part of a page has drawn. */
export async function drawn(page: Page, parts: readonly Part[]) {
  for (const part of parts) await expect(part(page)).toBeVisible()
}
