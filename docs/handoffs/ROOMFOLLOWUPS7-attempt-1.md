# Implementation-session handoff

Goal and attempt: follow-ups to #130 (`docs/plans/room-follow-ups-7.md`), WBC-02-CC-0039, attempt 1, behind the vision flag.
Human owner / executor resource: Davide (coordinated by Codex) / Claude Code on the web, the existing WBC-02 sole-writer session
Native session: https://claude.ai/code/session_0155SjcXhv87RErnWEBWxfBM
Starting worktree/commit: `/home/user/Sophia`, branch `room/followups-130-fixes`, 2026-10-06. It was written on freshly fetched `origin/main` `1b4e08d88d96e5f3ba5f3ac6a596795657cf18db` (#135), then moved, before committing, onto `acd394a3a08613237703a594d534fac5d6354682` (#133). #133 touches none of this PR's files. The five Room paths Codex assigned (`StagePresent.tsx`, `useProjectRoom.ts`, `MeetingRecap.tsx`, `AfterMeeting.tsx`, `following-signal.ts`) were rechecked byte-identical to `52819159` on both bases.
Ending commit/tree: the content commit «Room: follow-ups to #130», the parent of this handoff's commit.

## Outcome

Codex's four P2s on #130, each reproduced by Codex on merged main:
- **Each call has its own following** (`useFollowing`). A changed call key reloads what that call followed, and resets the focus owed to Follow. The old call's choice is never written under the new key.
- **The reconnect resync keeps answers heard since the drop** (`following-signal.ts`). Each word is numbered by a receive sequence that only grows (not `Date.now`). The resync forgets only entries numbered at or before the drop's end, so a same-value answer in the same clock tick is kept. Retries, fencing by a later drop or the call's end, and guest exclusion are unchanged.
- **A recap not yet read is not the running meeting's** (`RecapSheet`): unknown is not running. Search reads the latest meeting as a recap hit opens and passes what it learns (`hitRunning`). Updates still passes its list's answer.
- **«After the meeting» waits for every task running at close** (`AfterMeeting`, `pollAfter`). The task ids are frozen when the sheet opens. It polls until each has its own `work_finished` after the close, or for ten minutes. No new words on screen.

Preserved: the call key's restoration (back to a call, and back from another view); the explicit current-meeting and Leave duplicate suppression, from Updates' list and now from Search's read.

Codex's automatic review of the first head (`02b7b3c`) found two P2s, both fixed in the next content commit:
- **A Leave before Search can tell opened a second recap of the running meeting** (r4200242782). A sheet now says what it recaps (`recapping`): running, past, or can't tell yet. It goes by its recap once read, else by its opener, and a recap that can't be read is past. A leave's recap waits while any sheet can't tell (`onLeave`, `useLeftCall`), so an unknown sheet neither takes nor doubles it.
- **A remounted room reused a call's number** (review 5434386199). `room.call` restarted at 0 with each mount of the room, so a later call could find the following kept under an earlier one's key. Call numbers now come from one page-wide counter (`newCall`), so they are never reused.

## Evidence

Node 24.21.0, pnpm 11.7.0, Chromium (the container's pre-installed build, through a local-only Playwright wrapper config, since the pinned Playwright expects a newer build). The results below come from the working tree on `1b4e08d`, before the move to `acd394a`. The exact commit's results are in the PR, not here. Mutants were run by swapping a file in place and putting it back (each restored file compared byte for byte). A full-suite run that overlapped them was stopped and discarded.

- **Units:** `following-signal.test.ts` 15/15, `recap-view.test.ts` 8/8, `search-view.test.ts` 3/3.
- **Unit mutants, each killed:**
  - main's `following-signal.ts`: 3 of the new tests fail (changed version; same version in the same tick; second member; refused-then-published ask);
  - `pollAfter` as «any finish stops»: 2 tests fail.
- **Browser, with the fix:**
  - `room-following.spec.ts` 6/6;
  - `room-following-keys.spec.ts` 3/3;
  - `room-search.spec.ts` 10/10, and both recap controls 10/10 over `--repeat-each=5`;
  - `room-return.spec.ts` 5/5.
- **Browser mutants, each killed:**
  - main's `StagePresent.tsx`: the rejoin control fails (Follow not offered), and all 3 key controls fail («Call B · following», and the focus still owed in call C);
  - unknown recap as running: the past-meeting Search control fails (1 dialog, not 2);
  - main's `SearchSheet.tsx`: the running-meeting Search control fails (no latest read);
  - main's polling in `AfterMeeting.tsx` and `MeetingRecap.tsx`: the two-task control fails («Work finished» never comes).
- **Gates:** `pnpm check` and the full Studio browser suite, on the exact commit, as recorded in the PR.

The second content commit (Codex's two P2s on #138) was written in an isolated worktree, so the suite still running on `02b7b3c` was not disturbed. What has run on it, before publication:
- **Units:** 14 in `recap-view.test.ts` and `new-call.test.ts`. They cover `recapping` (true, false or unknown, and failed is past) and `leaveRecap` (wait; open or not as the sheet tells; open once it closes; a second leave takes the wait over). They also check that `newCall` never repeats.
- **Gates:** `tsc` and `oxlint --type-aware .`.
- **Pending at publication:** the new browser checks and their mutants, `pnpm check`, and the full browser suite on that commit. They run once the port is free, and their outcomes are reported on the PR.

**Source-register IDs consulted:** none.

## Decisions and changes

- **Fixture ownership (Codex, 2026-10-06):** the open Project PRs change `fixture-api.ts` and `room.tsx` (#133, #134), `meeting-data.ts` and `room.tsx` (#136), and `fixture-api.ts` (#117). None of them is touched here. The Room checks use what the fixture already answers, plus two things owned by this PR:
  - a dedicated fixture page, `fixtures/following-keys.html` and `.tsx`. It renders the stage's own `useFollowing`, now exported for it.
  - spec-local wrappers of the page's fetch. `room-search.spec.ts` counts and holds the latest-meeting reads. `room-return.spec.ts` adds a second task to the recap and its `work_finished` to «after».
- **Crossing for later integration:** if a later fixture change answers a second task natively, `room-return.spec.ts` can drop its wrapper. Nothing here needs those PRs, and they need nothing here.
- **Not checked in a browser:** the reconnect resync. The fixture's LiveKit stand-in replaces `livekit-room.ts`, the only place `followingSignal` is wired. The resync is checked on the real module with controlled events and promises, the same scope as Codex's reproduction.
- No paid provisioning, access grants, migrations, deployment, or production or native writes.

## Remaining obligations

This PR is a draft for Codex's independent review, then the automatic reviews and CI. Merging is Davide's decision. Original #107 stays held at `29371f5`, and #119 unchanged at `ad749f1`. #117 is not incorporated until Codex's explicit acceptance notice.

## Next bounded action

Codex reviews the exact head. Once accepted and merged, the combined #107 integration (CC-0032, CC-0039) runs against refreshed main, by the same sole writer.
