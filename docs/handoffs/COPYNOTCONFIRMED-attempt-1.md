# Implementation-session handoff

Goal and attempt: an outcome nobody knows is said one way, «Not confirmed», then the next step
(`docs/plans/copy-not-confirmed.md`), attempt 1. The microcopy review's fifth pattern; Luis: «Empieza con el 3 y el 2,
luego sigue la cola».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a copy fix named in «Goal and attempt».
Writable scope: `apps/studio/src/features/artifacts/{PassageTask.tsx,TaskList.tsx,ReviewRow.tsx,passage.ts}`, `apps/studio/src/features/conversation/{Composer.tsx,ContinuityChoice.tsx,chat-view.ts,chat-view.test.ts,useRoomMessage.ts}`, `apps/studio/src/features/voice/useTypedChat.ts`, `apps/studio/src/app/what-is-read.test.ts` (renamed from `no-team-names.test.ts`), `apps/studio/e2e/{room-passage-task,room-review,room-passage,room-discussion}.spec.ts`, `docs/plans/{room-passage-task,room-review,room-discussion,copy-no-team-names}.md` (quotes only), the design note and this handoff.
Runtime unit: the Studio's words (`apps/studio`); no API, contract, bridge or data change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `copy/not-confirmed` from `main` (`a66aa9ec`), 2026-10-10
Ending commit/tree: `466f052a985e0f40df9e8d6642d2b163ffab259d` (tree `d647bc31684a36da56f7cfda5d32340b073a5ec5`). The commit after it adds only this handoff.

## Outcome

- A press with no reply says «Not confirmed. Try again.» (a task's Create and Done, a review), never «Not sent»; a
  message to the room, «Not confirmed: “…”»; a kept or withdrawn passage, «Not confirmed: it may already be kept.» /
  «…out of the brief.»; typing to Sophia in the room, «Not confirmed: your message may have arrived. Nothing is sent
  again on its own.» (one constant) and «Not confirmed: her reply may not come. …»; a continuity choice, «Not
  confirmed: check the brief before trying again.»
- A refusal stays a refusal where the code tells it apart; a one-word «unconfirmed» label stays.
- One check reads what the Studio says for both microcopy patterns that have one (`what-is-read.test.ts`).

## Evidence

- Written first and seen failing: the check, on exactly the old strings (ten, then the room's message the review
  found); `room-passage-task`, `room-review`, `room-passage`, `room-discussion` on the old words.
- Under the machine's guard (1 worker, low priority, beside AION2): `room-passage-task`, `room-review`,
  `room-passage`, `room-discussion`, `room`, `room-chat-replies`, `voice-chat`: 90 of 91 passed on the final code. The
  one that failed, `room-passage-task:171` (a Done with no reply, then Try again), is flaky on `main` too: on `main`
  (`a66aa9ec`), repeated 6 times, it failed once at the same step (the Try again button gone before the click); on
  this branch, 2 of 5. Not this change's; offered as its own task.
- The Studio's unit tests: 1019 passed. Prettier, `pnpm run lint` (whole repo), `tsc --noEmit` for the Studio.
- Mutants with a passing control: each old wording put back fails the check (8 of 8: «Not sent. Try again.» in each
  of three places, «Not sent to the room», «Delivery unconfirmed», «Reply unconfirmed», «Your choice is
  unconfirmed», «Not confirmed it was kept»); a chip's one-word «Unconfirmed» passes. In the browser, the kept
  passage's and the room message's old words fail their spec; the review's old words failed its spec in the first
  run and passed it in the next two: the fixture server those runs reused (another session's, on :5199) served a
  stale module, as it did once for `passage.ts` (fixed by touching the file). The check holds that mutant regardless.
- Independent review (committed objects): no P1. Its two P2s: the room's message still said «Not sent to the room»
  (fixed, with its check); the media bridge sends its own «Delivery is unconfirmed…» / «Reply unconfirmed…» as a
  `refused` packet, which the Studio shows as it comes (named in the note as out of this change, for Davide). Its P3s
  taken: stale comments, older notes quoting the old words, «your message» as the subject, other unknown outcomes left
  named in the note. A second review of the fixes: no P1 or P2; its P3s taken (the bridge's third text and when each
  arrives, one more stale comment, two long lines in the notes, two more «Sophia didn’t answer.» named).

## Limitations and next action

- The bridge's words for typing to Sophia, and an unknown outcome travelling as `refused`, are the bridge's and its
  contract's (Davide's).
- `ContinuityChoice` doesn't tell a refusal from no reply (as before); «Sophia didn’t answer.» (`AdmissionNote`) is
  pattern D's.
- Next: merge on green CI with no Codex P1.
