# Implementation-session handoff: INC03-DES-001

Goal: the production controlled Personal reader in the Studio (#514's P2 4561086642, its Studio half), LOCAL candidate
Human owner / executor resource: Davide / the dedicated Claude Code designer (cloud session)
Native session: `session_01FGXfrKKdKs2Y9XbfrHzs3s`
Base: `1203c682307b9eda9976b9bc7b94d17d5f288c84` (tree `130831c6`, sole parent `332dc7b0`), the A3-R3 backend candidate
with A55, imported from the supplied bundle into the local branch `inc03-des-001-controlled-reader`.

Assignment `INC03-DES-001-CONTROLLED-PERSONAL-READER-001` (`9a670021…0513`), context `08919166…6e` (backend CORE
`22aaeefa`, PRE `0408c573`, root decisions `f9f77f67`, `5ee77000`, freshness corrigendum `6233fe90`, typed seam
handoff `df74bde3`). The implementation plan was sealed before code (`44305546…f34ef60`). Three implementation
precisions were adopted during it (review `2945730c…8036`, root `196669fc…41ff7b1`): P1 held wording only while held,
after_launch says work may have started, kept time is retention time; P2 the pin's lifetime; P3 per-read provenance and
complete Copy.

## Outcome

- `api/personal.ts`: the read model (`SpaceRead`: A10's space, or `ControlledRead`, A55 as parsed with the windows read
  back, every input's view, and when each read answered), legacy-first selection at C5 only, the pin
  (`pinControlled`: gcTime Infinity for its key), the coherent round, and the controlled export with each page's time.
- `usePersonal.ts`: the pinned query, its refresh (pending: `pollEvery`; else every 20 s, only unlocked and in sight),
  nothing old shown once pinned, and the controlled read-back joined only at the same revision and epoch.
- `conversation-view.ts`, `Conversation.tsx`: one quiet status row per controlled message, the kept answer's
  read-only disclosure, the stale line with Try again; Ask again only where retry is accepted; the welcome by activity.
- `PersonalSpace.tsx`, `Places.tsx`, `DataSheet.tsx`, `data-view.ts`, `arrive.ts`, `places-view.ts`: the union
  carried through; Copy's controlled text.
- Tests: the reader (selection, no downgrade, pin, coherence, provenance, export, the pin's lifetime), the model, Copy,
  a new app-level crossing (`e2e/app-personal-controlled.spec.ts`), and the fixture's `controlled=1` presentation.

## As it happened

1. Plan sealed before code; base imported and verified (bundle requires `953e5dc3`; protected 499/501 absent).
2. Lint first refused: complexity in five functions, a shadowed name, an unmodified loop condition, two inconsistent
   returns; split into helpers, behaviour unchanged.
3. P1–P3 arrived mid-implementation and were bound before freeze.
4. **Pin lifetime, reached mutant.** Without the key's gcTime default the pin is collected after five minutes ("the pin
   stays": false); restored, 14/14. A first run aimed at a wrong test path is kept, void.
5. **App crossing, first run 10 of 11 failed (kept).** The app's first load asks its reads twice (a read called off as
   it mounts again, before any answer), so "one legacy read" was the wrong expectation: corrected to "no legacy read
   after the first controlled one". Quote marks are CSS; the failed notice shows in two places; after unlocking, the
   test opens Personal again. Second run 11/11.
6. **Fail-before on 1203's production bytes** (all ten production paths at HEAD, the new spec unchanged): the cold
   controlled open shows "Couldn’t load your personal space." with Try again and never the conversation; the
   uncontrolled control passes. Restored exactly.

## Limits

- Synthetic routed answers and a labelled fixture: no real API, PostgreSQL, account, native or deployed read.
- The read-back crossing covers one window; deeper windows are bounded (20) and unit-checked, not browser-checked.
- This base lacks the accepted catalog (8c), REC01 and e15: they join later in a coherent candidate and are rechecked
  there. Nothing here is published; the material working UI awaits Davide's approval after the review packet.

## Remaining obligations

- The same reviewer's whole-candidate CORE/PRE; Davide's working-candidate approval if material; then publication,
  current automatic review and CI, the coherent join and its own checks, and the native/owner/deployed/app gates.

## R1, a controlled read whole or said stale, as it happened (a child of `360176e4`)

The same reviewer's whole-source review of `360176e4` (`df064b29`) was NEEDS_REVISION, and root adopted R01, R02, R03
and the fixture correction (`d0153c26`; task `a1be08d6…f9ab2`). The repair ran only after `360176e4`'s fresh ordinary
ended with exit 0 and its FINAL was delivered (`ea7ab350…9b2b`). The plan was sealed before any edit (`1c9aa056…a138`).
The work is on the new branch `inc03-des-001-reader-r1`, in its own worktree; `360176e4` and its packets are unchanged.

1. **R01.** `viewHolds` binds each view to its page's turn: input, turn and seq, at the same control revision and state.
   It applies to A55's inputs, to read-back windows (`readControlledWindow`) and to Read more. A round that doesn't
   hold is read once more, then `NotCoherent`. Read more that doesn't hold isn't joined; the space is read whole
   instead.
2. **R02.** The 20-window cap is gone. A round reads back to the oldest seq loaded, bounded by that range through strict
   progress. A page breaking its order raises `ReadBackMalformed`.
   - Neither error is retried by the query: the round already was, and the next refresh reads it again.
3. **R03.** Copy has a `Control:` line with the exact state, phase and held reason.
4. **Fixtures.** Never-admitted held Y and cancelled Z have no call and an original request of none/none/none, and held
   Y is excluded from the prompt, in the app spec, the presentation fixture and the unit data.
5. **First failures, kept.**
   - The app spec's first run failed twice. One cause was my own test data: a page at control revision 0 against a view
     at revision 1, which the new binding rightly refused. The other was a still-open menu.
   - The second run showed the refresh test waiting on the query's retries; local read errors are no longer retried.
     Escape had also taken the read-more test to Home.
   - The third run passed 13 of 13.
