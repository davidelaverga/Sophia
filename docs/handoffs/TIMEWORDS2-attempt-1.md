# Implementation-session handoff

Goal and attempt: one way to say when, part 2 of 3, dates and clocks (`docs/plans/time-words.md`, «Part 2, as built»), attempt 1. Stacked on part 1 (#144).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `polish/time-words-2` on `polish/time-words`, 2026-10-07
Ending commit/tree: the commits on `polish/time-words-2`, read one by one (a squash folds them into one).

## Outcome

**Added to `app/time-words.ts`,** in English with a 24-hour clock, in the viewer's own time zone:

- `dayOf`, `clock`, `when`;
- `dayLabel`, both ways from today («Yesterday», «Tomorrow», a weekday within six days), with `{ past: true }` for what has happened: never said to be ahead;
- `dayInSentence`: only «today», «yesterday» and «tomorrow» drop the capital;
- `sameDay`.

A malformed time says nothing rather than breaking the page.

**Moved onto them:**

- Knowledge: a card's date, a description's edit, carried in;
- a report's history (the year only when it isn't this one);
- the Slack update's day;
- a link's last day;
- Conversations' «Oct 6, 09:12» (`messageWhen` goes);
- Updates and search;
- what came after a meeting;
- Personal's day labels, clock and «today at 16:00»;
- the passkeys (`app/days-ago.ts` goes);
- a research card's «asked 09:12»;
- resources' exact time on hover (the viewer's zone, no longer UTC).

**Left as they are:** a session's range and Personal's long date line, which already follow these rules; zone names; the form fields' values.

**Independent review:** no P1. Two P2s, fixed: the passkeys could say «Added tomorrow» from a fast server clock (now `{ past: true }`, with Personal's labels), and that rule had no check. P3s fixed: the hover in the viewer's zone, malformed times, `sameDay` in place of comparing words, `dayAhead` no longer exported. P3s left: a research card's «asked 09:12» has no day (as before); `carriedBy`, the after-meeting times and the passkey sentences have no unit check of their own.

## Evidence

- **Unit:** `time-words.test.ts` 17 of 17, checked by the reviewer in five zones (UTC, Santiago across its DST midnight, Kiritimati, New York, Kolkata); the touched modules' tests pass.
- **Browser** (under the guard, the whole suite before the review's fixes): 778 of 782. The 4 that fail are `report-page.spec.ts`, failing here alone too:
  - three because pdfjs on Windows rejects a backslash path («must include trailing slash»);
  - one because of Windows font metrics (57 characters a line).

  The report page comes from `@sophia/report`, untouched. After the review's fixes, the affected specs again.
- **Mutations** (unit), 9 of 9 killed, and the control survives:
  - the year always shown;
  - a 12-hour clock;
  - no «Tomorrow»;
  - the week only backwards;
  - every label lowercased;
  - `when` without its day;
  - a past time said ahead;
  - a malformed time breaking the page;
  - the same day by its month.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass on the touched files.

**Source-register IDs consulted:** none.

## Remaining obligations

- **Part 3:** one `useNow` in place of the six ticking hooks and the `Date.now()` passed at the calls; pin `personal.spec.ts:616`'s clock (it splits at midnight UTC).
- **`report-page.spec.ts` on Windows:** pdfjs's standard-fonts path needs a trailing slash.

## Next bounded action

Part 3, one clock.
