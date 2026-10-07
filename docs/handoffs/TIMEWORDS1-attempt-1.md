# Implementation-session handoff

Goal and attempt: one way to say when, part 1 of 3, relative words (`docs/plans/time-words.md`), attempt 1. Luis's «unificación de time words».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `polish/time-words` on `main` `aa5065c`, 2026-10-07
Ending commit/tree: the commits on `polish/time-words`, read one by one (a squash folds them into one).

## Outcome

**One module, `app/time-words.ts`:** `ago` (with a seconds mode for live readings), `lasted`, `roughly` (its largest unit, for a tight place), `about`, `inTime`. Pure, given `now`. Units short and spaced, days spelled. The past rounds down and is said in days from a day on; what is ahead rounds to the nearest and is said in hours up to two days.

**Moved onto it:**

- access: «ago» and the session countdown;
- resources: «ago», observed readings, «resets in», pace and a history's span;
- Work's pulse;
- the lobby's wait;
- a research card's elapsed time;
- Updates' meeting rows;
- the recap's head;
- «You joined … in»;
- Personal's «starts in».

The old local implementations are gone; resources keeps thin wrappers for its `Date` and «never observed».

**Words that change, on purpose:** «38 minutes» → «38 min»; «2 d ago» → «2 days ago»; «Offline · 26 h» → «Offline · 1 day»; «45s ago» → «45 s ago»; the pulse after an hour «2 h ago», not «09:12 AM»; «You joined 1 h 30 min in.»; «6 readings in 3 h» (largest unit, rounded down).

**Independent review:** no P1. Four P2s, fixed:

- estimates in hours up to two days;
- a past span rounded down;
- Personal's countdown moved too;
- the note matched to the code.

P3s fixed: the tile's string surgery, a re-export kept for a test, edge tests. P3s left: invalid dates read «NaN days» (as before); the lobby's wait has no check of its own.

## Evidence

- **Unit:** `time-words.test.ts` 9 of 9; the touched modules' tests pass, their words updated where they change.
- **Browser** (under the guard): resources, work, Updates, search, so far, recap, home, Personal, people and the room, 417 tests. One failed, a review asked «just now» (its check now takes that), and two resource checks changed with the words; then the affected specs again.
- **Mutations** (unit, on `time-words.ts`): 8 of 8 killed, and the control survives:
  - the past rounded rather than down;
  - hours past a day;
  - no seconds for live readings;
  - minutes spelled;
  - the estimate rounded down;
  - «in a moment» never said;
  - one day said as days;
  - estimates in days from a day (rather than two).
- **Not covered by a browser check:** the pulse's and the lobby's words. Both are one-line uses of tested functions.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass on the touched files.

**Source-register IDs consulted:** none.

## Remaining obligations

- **Part 2:** dates and clocks (`dayOf`, `clock`, `when`, `dayLabel`), with the passkeys' and Personal's day words.
- **Part 3:** one `useNow` in place of six hooks and the clock reads while rendering.
- **CI flake seen on #143:** `personal.spec.ts:616` counts exchanges from fixture messages dated against now; just after midnight UTC a day divider splits them. Pin its clock in part 3.

## Next bounded action

Part 2, dates and clocks.
