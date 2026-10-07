# Implementation-session handoff

Goal and attempt: one way to say when, part 3 of 3, one clock (`docs/plans/time-words.md`, «Part 3, as built»), attempt 1. Stacked on part 2 (#145).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `polish/time-words-3` on `polish/time-words-2`, 2026-10-07
Ending commit/tree: the commits on `polish/time-words-3`, read one by one (a squash folds them into one).

## Outcome

**`app/use-now.ts`:** `useNow(every = 60 s)` on `useSyncExternalStore`.

- One interval a pace, shared by every view that reads it, running only while one does.
- A clock idle for a pace or more is read afresh, so a view shown again never paints old words.
- A view that joins a running clock reads its last tick.

**The six clocks of their own go:** Work's pulse, Places, the lobby, the join page, the room, a research card. Their paces are kept.

**Views whose relative words never moved now do:** the calendar's «starts in» and its lines, the invitation lists' «ago», the passkeys, Personal's memory, Work's cards and order (one clock for all the cards).

**Invitations:** whether one is open is read from the same clock as its words, so an invitation that just expired never folds under closed while its row still says «email sent».

**Left as they are:**

- one-second countdowns with their own logic;
- resources' `useClock`;
- `Date.now()` for absolute dates (it only decides the year).

**Codex on #145 (P2):** `when` said «, » for a malformed time; it now says nothing, with a check.

**Independent review:** no P1. Three P2s, fixed: an idle clock's first read, invitations open or closed by another clock, and no browser check that a view's words move. P3s fixed: one subscriber for Work's cards, the clock checks cleaning up whatever fails. Left: a finished research card re-renders once a minute (one shared interval).

## Evidence

- **Unit:** `use-now.test.ts` 4 of 4 (Node's mock timers).
- **Browser** (under the guard): the whole suite before the review's fixes, 779 of 784. The 5 that fail fail on this Windows machine on main too:
  - four in `report-page.spec.ts`: pdfjs's backslash path, font metrics;
  - one in `report-reading.spec.ts`: the five-column table's sub-pixel width.

  After the fixes, Personal, home, the room, people, work and sign-in again (294 of 294).
- **New check** (`room-made.spec.ts`): a session's «starts in 10 min» in the room reads «9 min» a minute on.
  - It goes through the room, because the Personal and home fixtures render their views with a fixed `now`.
  - It moves time with `fastForward`: `runFor` runs every animation frame of a minute and takes the page down.
- **Mutations:**
  - **unit, 6 of 6 killed:**
    - a clock for each reader;
    - never stopping;
    - restarting with the old time;
    - one clock for every pace;
    - an idle clock read stale;
    - read afresh at every read.
  - **browser,** against the new check: the room's clock never moving; the shared clock never telling its readers.
  - The control survives each.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass on the touched files.

**Source-register IDs consulted:** none.

## Remaining obligations

- `report-page.spec.ts` on Windows (pdfjs's standard-fonts path needs a trailing slash), and the five-column sub-pixel check, both on this machine only.

## Next bounded action

Phone layout fixes (Luis's list), or what Luis says next.
