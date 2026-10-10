import { expect, type Locator, type Page } from '@playwright/test'

// What a fixture page shows once it has drawn (docs/plans/type-scale-drawn.md, ink-drawn.md): a part for each read that fills it,
// the last of a chain included, so a check that measures the page measures it whole. Never «the network is idle»: a
// fixture page keeps loading as it draws, and a quiet moment may not come in time on a slow runner.

/** A part shown (a locator), or a wait of its own for what no one locator says. */
type Part = (page: Page) => Locator | Promise<void>

/** A project's bar has drawn: its Invite, which the membership's read brings. */
const BAR: Part = (page) => page.getByRole('button', { name: 'Invite' })

export const DRAWN = {
  home: [
    // Work's index and «You and Sophia» (their own reads in the Studio; the fixture gives them on its first render).
    (page) => page.getByText('Launch plan').first(),
    (page) => page.getByText(/\b1 note\b/).first(),
  ],
  personal: [
    // The thread and its notes (given on the fixture's first render with `demo`).
    (page) => page.getByText('I have a pitch on Friday and I keep putting off the deck.').first(),
    (page) => page.getByText(/\b1 note\b/).first(),
  ],
  room: [BAR, (page) => page.getByText('The room is ready')],
  goals: [BAR, (page) => page.getByText('Roll the new onboarding out to every region').first()],
  // The board: its plan, and the tasks under it (the last read).
  tasks: [
    BAR,
    (page) => page.getByText('The translation passes its review'),
    (page) => page.getByText('Translate the checklist for the second region').first(),
  ],
  work: [
    BAR,
    (page) => page.getByText('A retry candidate passes its review'),
    (page) => page.getByText('Implement the PDF retry').first(),
  ],
  // The resources, and what each is doing (its own read).
  resources: [
    BAR,
    (page) => page.getByText('3 of 3 resources shown'),
    (page) => page.getByText('Asked to run pnpm --filter @sophia/report test').first(),
  ],
  signin: [(page) => page.getByRole('button', { name: 'Email me a link' })],
  // The invitation, read before the door shows.
  join: [
    (page) => page.getByText('Lucia invited you to the room'),
    (page) => page.getByRole('button', { name: 'Ask to come in' }),
  ],
  knowledge: [
    BAR,
    (page) => page.getByText('Pilot readout: what kept 12 of 14 teams').first(),
    // A cover draws its own reads after the list (its versions, then its page or its text), once in reach, each in
    // its own time: every cover on screen, never the first alone (docs/plans/knowledge-covers-drawn.md).
    coversDrawn,
  ],
  updates: [BAR, (page) => page.getByText('Reports open on the answer'), (page) => page.getByText('38 min')],
  conversations: [
    BAR,
    // A message no row shows as its last: only the thread's own read brings it.
    (page) => page.getByRole('region', { name: 'Messages' }).getByText('Added them, cited.'),
    (page) => page.getByText('Map first, list second'),
  ],
} satisfies Record<string, readonly Part[]>

/** The covers on screen, by what each shows (`data-cover`: waiting, page, lines, mark). */
export function coversOnScreen(page: Page) {
  return page.locator('.report-cover').evaluateAll((covers) =>
    covers
      .filter((c) => {
        const r = c.getBoundingClientRect()
        return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
      })
      .map((c) => c.getAttribute('data-cover')),
  )
}

/**
 * Every cover on screen has drawn: none waits for its reads, and one at least shows words (covers that couldn't be
 * read, marks alone, would leave the checks nothing to measure).
 */
async function coversDrawn(page: Page) {
  await expect
    .poll(async () => {
      const covers = await coversOnScreen(page)
      return !covers.includes('waiting') && covers.some((c) => c === 'page' || c === 'lines')
    })
    .toBe(true)
}

/** Waits until every part of a page has drawn. */
export async function drawn(page: Page, parts: readonly Part[]) {
  for (const part of parts) {
    const shown = part(page)
    if (shown instanceof Promise) await shown
    else await expect(shown).toBeVisible()
  }
}
