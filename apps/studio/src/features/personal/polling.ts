// How often a client waiting for Sophia's reply reads the turns again: every 700 ms, and after failed reads less and
// less often (up to every 15 s), but never not at all: a reply, or a wait that lapsed, still shows once reads work again.
export const POLL_MS = 700
export const POLL_MAX_MS = 15_000

/** The wait before the next read, after `failures` failed in a row. */
export const pollEvery = (failures: number): number => Math.min(POLL_MS * 2 ** failures, POLL_MAX_MS)
