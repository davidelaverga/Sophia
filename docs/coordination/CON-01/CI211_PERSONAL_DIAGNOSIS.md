# #211's red room job: the two personal-space failures, split (CON-01, CC-0164)

**Status: a diagnosis and a hand-off.**
- CON writes no personal-space source. It is not CON's, and CON's source windows are closed.
- There is no CI re-run and no waiver; the failing job 114554922957 stays recorded.
- **This supersedes** the closed-out wording of CC-0163 ([#198 comment 6115983631](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6115983631)) and the "proposed fix" in [#211 comment 6115958328](https://github.com/davidelaverga/Sophia/pull/211#issuecomment-6115958328). Both presented a fixture clock change as the fix for both tests. It is a fix for one only (CX-0134, [#211 comment 6116061885](https://github.com/davidelaverga/Sophia/pull/211#issuecomment-6116061885)).

## 1. What is established

**The trigger.** `apps/studio/fixtures/personal.tsx` dates its demo exchange in minutes before now: `ago(14)`, `ago(13)`, `ago(6)`, `ago(5)`.
- Between 00:00 and about 00:06 local time, the person's latest turn falls on the previous day. They haven't written "today", so the view adds the day's openers (`c3-starters`, 132 px), and the list overflows.
- On desktop at 1280×800, `.msgs` measures 666 against 622 at 00:02, and 622 against 622 at 12:00.

**Who showed it:**
- **CI:** five room jobs failed `personal.spec.ts:583` and `:905` on five branches, main `b69a6a0b` among them. All ran between 00:01 and 00:06 UTC; runs a few minutes either side passed.
- **Codex, independently** (packet `257cfa55`), reproduced it in a browser on a byte-identical baseline (`93e9313d`). It used only the fixture's existing `?at=00:02` and `?at=12:00`.

**#211 introduced neither failure.** The personal fixture, component and theme source are byte-identical to main.

## 2. Two conclusions, kept apart

### 2a. `personal.spec.ts:583`, "a short conversation rests on the field": a fixture assumption

The test asserts that the default fixture's conversation fits without scrolling. After midnight the openers make that conversation overflow, so the fixture's intended short list is no longer short.

Pinning the clock addresses this test: either `?at=12:00` for it, or the fixture keeping its `NOW` out of the first minutes of a day. Which one is the owner's call.

### 2b. `personal.spec.ts:905`, "Ctrl F finds in the conversation": a product defect

**The defect.** Find's current match ends out of view when the list overflows. [`docs/plans/personal-moments.md:45`](../../plans/personal-moments.md) promises the current one "in her light and in sight". **Pinning the clock must not be applied to this test as its fix: it would hide the defect.**

**Instrumented on desktop 1280×800,** with `?at=00:02` and no `Date` override or route. Every programmatic scroll of `.msgs` was logged with the source line that made it:

| Moment | What happened |
|---|---|
| Loaded | `scrollHeight` 666, `clientHeight` 622; the list kept at its end (scroll top 44) |
| Ctrl F | the find line opens and the list's height becomes 560; the list is kept at its end (scroll top 106) |
| "keep" typed | `Find.tsx:219` calls `scrollIntoView({ block: 'center' })` on `mark.current`. Within 5 ms, `PersonalSpace.tsx:399` (`useEndKept`'s `ResizeObserver`) calls `scrollTo({ top: scrollHeight, behavior: 'instant' })` four times |
| After | no `scroll` event fired between those calls. `atEnd`, which only the scroll listener updates (`PersonalSpace.tsx:388`, `:391`), stayed true. The list ends at scroll top 106 of 106, with the current match (139–158) above the visible list (173–733); the count says "1 of 5" |

**The same sequence elsewhere:**
- **`?at=12:00`, desktop:** the four snap-back calls follow Find's scroll the same way. The list doesn't overflow (560 against 560), so nothing moves and the match stays in sight (289–308).
- **`?at=12:00`, phone project (390×844):** the list overflows (687 against 564), and Find works. Its scroll animates to 0, emitting `scroll` events, and no snap-back follows.

**What that shows.** Find's scroll and the end-keeper compete. The match is lost when a resize of the list or its rows follows Find's scroll before a `scroll` event clears `atEnd`. That was seen on desktop in the overflowing 00:02 state, so it is not about midnight as such.

**Not established:**
- which resize fires there;
- whether other overflowing states hit it;
- a fix.

## 3. Hand-off to the existing personal-space owner (@EdX2C, the latest author of these files)

Three pieces of work, for the owner:
- **Correct Find** so the current match stays in sight when the list overflows and the reader was at the end. One way is for Find's own scroll to end the "at the end" state the resize watcher acts on. The design is the owner's.
- **Adverse coverage:** Find in an overflowing list with the reader at the end, on desktop, including the openers state (`?at=00:02`): the current match in sight. Plus the phone case as a control.
- **Keep `:583`'s short-list assumption** as its own fixture or clock change, separate from the Find correction.

CON makes none of these changes, and there is no reviewer-authored fix.

## 4. Evidence (CON's owned scratch, local only; the worktree at `7d8f415f` unchanged)

| File | SHA-256 (first 16) | What |
|---|---|---|
| `personal-find-scrolls.spec.ts` | `81e8a2a09914674e` | the scroll instrumentation. Its desktop run predates two option flags, `PROBE_ATS` and `PROBE_PHONE`; with neither set, it runs as it did |
| `r211-find-scrolls.log` | `beb2fd8a9ed4c8dd` | desktop, `?at=00:02` and `?at=12:00` |
| `r211-find-scrolls-phone.log` | `9937eef951653270` | phone, `?at=12:00` |
| `personal-mechanism.spec.ts` | `816ab7904bf749f8` | the layout at 00:02 and 12:00, with the `Date` overridden, and the fixture change served by a route |
| `r211-personal-mechanism.log` | `dad3d5556e76f31f` | that run |
| `r211-personal-mechanism-run1.log` | `5fe98e23625ec9fb` | void: its route matched nothing |
| `personal-timing.spec.ts` | `ebd7a1df81bad371` | copies of the two test bodies under a fixed `Date` |
| `r211-personal-clock.log`, `r211-personal-window.log`, `r211-personal-at.log` | `e42de1720e069caf`, `9193b0e6af88d7ef`, `58dfa7501465aaa0` | the clock times, the failing window, and `?at=12:00` |

**My earlier reproductions overrode the browser's `Date`.** Codex's used only the fixture's `at` knob, as do the scroll logs above.
