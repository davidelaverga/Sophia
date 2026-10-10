# SDD-01 G7 voice qualification (product side), attempt 1

Goal and attempt: SDD-01 G7, the synthetic in-app voice episode of pack 03 (PRODUCTION_BATCH L3). Product-side wiring, source only and off by default, attempt 1.  
Human owner / executor resource: Davide (decides); Codex root (reviews and operates); this Claude Code session (writes the product voice lane), with delegated author and reviewer subagents.  
Native session: Claude Code session `6cb2da23-f2d9-5c82-9392-fa14408fb08e` (claude.ai/code session_0155SjcXhv87RErnWEBWxfBM).  
Starting worktree/commit: `953a4ca2ecd53b85826e405d6aac40233dd6481e` (the #107 head, tree `e0d1d8ed…`, merged as `b01768ac`).  
Ending commit/tree and changed files: resolve them from the commit that contains this record. The frozen review snapshots on the way, all immutable and each handed over as a bundle with SHA256SUMS:
- `2edd1fad` (integrated lane);
- `d9992cff` (R1);
- `07ed2624` (R2a);
- `04fac683` (R2 final: the R1 review's repairs, the voice-edit join `e85baa5f` and C5);
- `8e68b3cb` (merge of main `ab80958f`, PR #189);
- this record.

## Outcome

Every part is behind three switches, all off by default:
- an operator's grant in migration 0046;
- `SOPHIA_VOICE_QUALIFICATION=on` on the API;
- `SOPHIA_VOICE_EVIDENCE=on` on the media bridge.

With the switches off, the API serves no A15 route, needs nothing from 0046 or 0051 to be ready, and adds no `exchangeId` or `withdrawnSourceIds`. The bridge and the Studio also behave exactly as before.

What exists in source, under a grant:
- **Grant and guard (0046).** The guard ends a granted exchange at its deadline, at revocation or expiry, or at its connection, turn or budget limit. The evidence store keeps the bridge's receipts for 24 h, readable only by the principal. No free text and no speech are kept.
- **A durable spend bound per exchange** (`media_voice_reserve`). It holds across a same-exchange replacement and across a process restart: connections and generations are reserved atomically under the exchange's lock, and the bridge fails closed.
- **The media bridge's recorder**, sending receipts over `POST /v1/media/evidence-writes`, each under its own write identity, never a number. It records only the principal's own turns.
- **The service numbers the receipts (0051, Codex P1 r4232908444).** Under the project's and the exchange's locks, from a durable high-water counter per exchange and grant, never lowered and never read from the receipts kept: a repeat of a write is answered with its own number (`replayed`), another receipt under its identity is refused (409) and spends none, and a refused write spends none, so the numbers run densely from 1. A process started again mid-exchange, or two at once, take the next numbers. Writes are taken until 24 h less one minute after the exchange's first (before any identity expires), then refused; past 99,999, refused. The bridge's own numbering (`POST /v1/media/evidence`) answers 410 and keeps nothing.
- **The Studio's page receipts and build identity.**
  - Page receipts are window events fired only under a grant, only for Sophia's element, with listeners that end with her subscription and with the call.
  - The room token names the grant only while the room's open exchange, if any, is under it (0051, provisional number; Codex P1 r4232975804, root's option (b)): `voice_room_qualification` replaced with the same signature and authority. The transaction-start inversion (T4) is closed in 0051 (root's GO): `start_exchange`, `voice_qualification_grant` and `voice_qualification_revoke` stamp from one `clock_timestamp()` reading taken after the project's lock (revoke now takes it), so coverage follows the lock order. Assumed, not claimed: the database's wall clock does not step backward between lock holders.
  - The build identity is `<meta name="sophia-build">`.
- **Canonical joins for the Lab:**
  - `NativeTask.exchangeId`, linked by the transaction that inserted the command, never by key;
  - the per-call ledger, `GET /api/v1/exchanges/{id}/calls` with `readAt`/`?after=`/`answeredAt`/`outcome`. Recording is fenced against End (C5), so an ended exchange is a durable recording boundary;
  - live presence, as the member's own fresh `selfPresent`;
  - `withdrawnSourceIds` on the native task detail;
  - a voice edit's call joined to its edit (`live_call_design_edit`, `e85baa5f`): `revise_html_page` marks its own admission transaction, and the trigger links the call to the edit's design command only under that mark, for the same project, actor and key. A member's own edit through `POST /html-edits`, even under a recorded call's key, links nothing.
- **Voice tool calls, one attempt at a time** (voice qualification on; Codex P1 r4234393693, r4234782534, r4234782537). Each call is made under its key's fence, a session advisory lock, across API processes. The attempt holding it takes the key's next generation (0047, `live_call_fences`), and a recorded call's answer is written only under that generation: sealed in the transaction that writes what the call does, or marked on its own when it writes nothing. An attempt whose fence was lost answers `unknown` and commits nothing. **Bound:** at most 8 fence sessions per API process (`CALL_FENCE_SESSIONS`), beside the pool's connections, so the API's database sessions are at most its pool's max plus 8. A call that finds none free within 5 s answers `unknown` (`unconfirmed:busy`) and runs nothing; the fence's connect is bounded by the same 5 s (`unconfirmed:fence_timeout`), given up at once (socket destroyed, slot back), and a release is bounded at 1.25 s. An answer that could not be written answers `unknown` and leaves the call unanswered.
- **The bridge's tool call has a transport ceiling** (item 7 B): `TOOL_ATTEMPT_MS` = 20 s per attempt, then the call is sent again as the same call (at most twice; a write still unconfirmed is `unknown`). It is only a transport ceiling, NOT a proven worst-case handler or provider conversational deadline. A call in flight never holds a close, so the stop bound (`STOP_DEADLINE_MS` = 35 s) is unchanged. The quiesce acknowledgement, holder events and announcement records have `POST_ATTEMPT_MS` = 3 s per attempt (item 7 A).
- **Presence reports are ordered, then bounded** (item 7 C, root's option (b), refined; migration 0052 and the presence-order amendment, `packages/contracts/amendments/*-presence-order.json`, both numbers PROVISIONAL; issue #105's historical "A17", a passage becoming a task, is a separate proposal label and NOT this presence amendment). Each report carries `reportSeq` from one counter per bridge process, shared across its sessions (a replacement continues it) and bounded at `Number.MAX_SAFE_INTEGER`: past it the process sends no presence, logged once per session. A report is cut at `POST_ATTEMPT_MS` and never sent again; the next tick sends a new one with a higher number. Under the project's lock, a report not above its process's `last_seq` for the room is answered 204 and has no presence effect (no presence, liveness, guest assertion, pause, empty-room end, `empty_since`, presence event or `last_seq`); the independent voice-qualification guard, with voice qualification on, may still run on that request, end an exchange for its grant's deadline or limits and emit its own guard event (root kept it there: skipping it would bypass the grant's budget enforcement). An accepted report takes one `clock_timestamp()` after the lock, for every stamp and comparison; the wall clock is assumed, not claimed, not to step backward. Each process keeps its own guest assertion with its own time: another process never clears, refreshes or extends it, and it counts only while under 30 s old at an accepted report's reading. The room's guests are the aggregate of the fresh assertions, recomputed only when an accepted presence report is applied (no timer expires it); it also keeps an empty report from ending a room another process still sees a guest in. The unchanged start and resume checks (`start_exchange`, 0015's as 0051 replaces it for T4, and `control_exchange`'s resume) read the cached room flag `room_ai_presence.guests_present` with its `reported_at` freshness, not `room_guests_asserted`. A report without `reportSeq` (a bridge before this) is applied as before only while its process has sent no sequenced one.
- **The verified G7 lifecycle.** Runs on real PostgreSQL through the real routes (`apps/api/src/voice-episode.db.test.ts`), with the order the product supports: note; Create with Hold and Resume while the design runs; page published; an edit by voice, which names its call; the note withdrawn, which ends the edit; Stop on a separate research created by voice. The Lab's G7 run makes its edit through the member HTTP route instead (`POST /html-edits`, which G7 L3 allows). The plan is `docs/plans/voice-qualification-g7.md`.

Not done and not claimed:
- No live run against a real LiveKit, Supabase, Gemini or deployed Studio.
- No full G7 acceptance. That needs the Voice Lab (a separate repository, its own handoffs) and an operator batch.
- No production effects of any kind: no grant, deploy, migration application or spend.

## Evidence

Every frozen snapshot went out with its own receipts: the exact head and tree, raw logs and SHA256SUMS. The snapshots up to d9992cff each had at least one independent adversarial review; the review of 07ed2624..04fac683 was running when this record was committed. Every finding so far was fixed in an additive commit with a fail-before regression and killed mutants. Root reproduced the findings and ran its own checks on each snapshot.

| Snapshot | Checks | Notes |
|---|---|---|
| `2edd1fad` | `pnpm check` exit 0; `test:db` 626/626; `test:sql` exit 0 | Studio browser suite exit 1 with 3 failures. The Personal contrast test (`personal.spec.ts:382`) also fails at the base 953a4ca2, so it predates this lane. Home frame timing and the cross-tab failed send are suspected load flakes; they pass alone, and these runs did not reproduce them at the base. |
| `d9992cff` | `pnpm check` exit 0; `test:db` 639/639; `test:sql` exit 0; bridge 311/311; Studio voice e2e 4/4 | |
| `07ed2624` | author: episode test 3/3, focused suites 59/59, mutants W1–W3 | Root independently: `pnpm check` exit 0, actual PostgreSQL 59/59. |
| `04fac683` | author: `pnpm check` exit 0 (unit 2171 pass, 1 skipped; integration 99 pass, 2 skipped; artifacts reproduced); `test:db` 649/649; the voice and lock DB suites 48/48; bridge 320/320. Root independently: `pnpm check` exit 0 (unit 2,068 pass, 70 skipped; integration 86 pass, 2 skipped; artifacts reproduced); actual PostgreSQL 17.6 focused suites 66/66; C5 acceptance 3/3 (the same controls 1/3 at 07ed2624); R1 boundary and concurrency probes 11/11; bridge controls 6/6; a composed MediaBridge/RoomSession to SQL crossing 1/1 | Root reviewed `e85baa5f` and kept it. |
| combined head (this record) | Pending when this record was committed: fresh `pnpm check`, `test:db`, `test:sql`, the bridge, and the Studio browser suite with the voice e2e and app-auth, on this exact head. The results go with its receipts. | |

Reviews of the product lane, with their probes delivered to root:
- whole lane at 2edd1fad;
- c6a284e6..afe19111;
- R1 2edd1fad..d9992cff;
- R2 07ed2624..04fac683, with `e85baa5f` reviewed explicitly: running when this record was committed;
- the combined head's integration review: pending when this record was committed.

Corrections to commit messages, which stay as they are:
- `a508d3f0`: at d9992cff the recorder test loads and fails with a TypeError (`asked` is not a function); it does not fail to load.
- `f827befe`: not all of the 27 deadlocks at 2edd1fad in the control race came from the lock-order inversion; some came from the global guard. Mutants L4 and L5 isolate the inversion.

## Decisions and changes

- **Migrations.** 0046, 0047, 0051 and 0052 are added (0051's and 0052's numbers are provisional, pending owner/root confirmation on #198: CON-01's #199 holds 0048, and #198 records its proposed 0048–0050); 0001–0045 are blob-identical to the base. 0052 (`presence_order`) needs only 0013 and 0017: it adds `last_seq`, `guests_present` and `guests_at` to `room_bridge_reports`, the function `room_guests_asserted`, and replaces 0017's `media_report_presence` with the same signature. None is applied anywhere. 0046 is frozen. 0047 (`live_call_keys`, the call keys and their claims) was edited in place during the review to carry the call fences' generations (`live_call_fences`, Codex P1 r4234782534): no foreign key, no lock of its own beyond the rows it writes. 0051 (`voice_evidence_numbering`, root's GO on r4232908444: a local candidate) is additive and touches nothing of 0046: two tables (the counter and the write identities, both behind RLS with no policy, nothing granted) and one function, `media_record_evidence_write`, granted to the API's role, which calls 0046's `media_record_evidence` with the number it gives. Once applied, none is edited; any later change is an additive migration after them.
- **Contracts.** Amendment A15 adds the routes and fields, regenerated with `pnpm --filter @sophia/contracts generate`. The presence-order amendment (`*-presence-order.json`, number PROVISIONAL; not #105's historical "A17") adds the optional `reportSeq` to `MediaPresenceReport`. It follows #199's amendment, whose generated files it also touches (here `openapi.json` and `generated-types.ts`): whichever PR lands second merges main and regenerates with the generator, never by hand.
- **Product status codes, which the Lab follows:**
  - 422 `not_found` for a missing or foreign object;
  - 404 for a route the API does not serve;
  - 422 `invalid_request` for a malformed id.
- **The edit step.** The Lab's G7 run uses the member HTTP route (`POST /html-edits`), which G7 L3 allows. A voice edit's call is also joined to its edit (`e85baa5f`). That join was not asked for: the R2 author found the gap with the lifecycle test and kept the fix in a separate, droppable commit. Root reviewed its API and SQL delta and decided to keep it, subject to the independent review and final checks.
- **Main.** Merged in with a merge commit, never rebased, so every frozen snapshot's SHA stays valid. No conflict, and no file in common with PR #189's account-store change.

## Remaining obligations

- **Not verified:**
  - whether Gemini Live's `usageMetadata.totalTokenCount` is cumulative per provider session;
  - a model id outside A15's pattern, which would have every provider receipt refused.
- **The owner's batch, none of it done:**
  - Deploy order, on, as docs/plans/voice-qualification-g7.md gives it (each step needs the one before it):
    1. apply 0046, 0047, 0051, then 0052 [0051 and 0052 provisional: numbers pending owner/root confirmation on #198], before the API: with `pnpm db:migrate` (in order, none skippable), every switch off, before any API built from this change goes out, with any other migration the deployed head carries, in order of number (CON-01's 0048–0050 among them when they are there; the runner applies whatever its ledger lacks, so 0051 needs none of them);
    2. deploy the API, then the media bridge and the Studio built from this change (the bridge after the API: an API before the presence-order amendment refuses `reportSeq`, 422); the Studio with `build:release` (below);
    3. `SOPHIA_VOICE_QUALIFICATION=on` on the API;
    4. `SOPHIA_VOICE_EVIDENCE=on` on the bridge.
    Off: the reverse, flags first.
  - Readiness: the new API's `/ready` answers 503 `schema` without 0047's claim or 0052's column and function (`REQUIRED_SCHEMA`), whatever the flag says, and, with `SOPHIA_VOICE_QUALIFICATION=on`, without 0046's functions, 0047's fence functions and 0051's numbering (`VOICE_SCHEMA`).
  - Activation preconditions, for the operator, none of them set or sent by this change:
    - the bridge service's shutdown grace on Render (`maxShutdownDelaySeconds`) at least 40 s, checked, before step 4: a close may wait 35 s (`STOP_DEADLINE_MS`), and the default, 30 s, is not enough;
    - the database's connection limit allows, for each API process, its pool (`max`, 10 by default) plus the call fences' own sessions (`CALL_FENCE_SESSIONS`, 8): at most 18 sessions per API process with voice qualification on;
    - the Studio built with `pnpm --filter @sophia/studio build:release` at the deploy commit, so its page names that commit (`<meta name="sophia-build">`), and uploaded with `--meta commit=` that same commit.
  - Neither flag is set, and no Studio has been built with its commit yet.
  - No grant exists.
- **Fixed in the 0051 candidate (local, root's GO; the number provisional):** a bridge restarted mid-exchange began receipt numbers at 1 again, and the API refused the numbers already used (409, dropped and counted; Codex r4232908444). The service numbers them now (above). The bridge's own stop no longer depends on a receipt (`6262d61b`).
- **Closed in 0051 (root's C2, option (c)):** 0046's `media_record_evidence` is no longer executable by the API's login or PUBLIC: 0051 revokes it, and only the service's numbering (`media_record_evidence_write`, SECURITY DEFINER) calls it, so no direct call can wedge an exchange's counter. 0051 also refuses to apply (55000) if a bridge receipt numbered through 0046 is already kept; it takes the evidence table's lock (SHARE ROW EXCLUSIVE) before that count, so a writer's uncommitted receipt is waited for and counted. **The rollout requires quiescence:** every evidence-writing process must be stopped or drained before 0051, with no already-authorized old-function call in flight. The lock does not make an online migration beside old writers safe: it does not revoke a function invocation that passed its permission check before the migration and resumes later. 0046's own per-number tests run on a database migrated through 0047 (`packages/persistence/src/voice-qualification-legacy.db.test.ts`).
- **Wording, not changed:** after the withdrawal, Stop by voice is refused with "the report is still at version 1" while the page is at version 2. That is the report's version, not the page's.
- **Lab side.** Voice Lab deltas 1–6 are in `voice-lab/studio-livekit-g7`. They are handed over separately, each with its own review and receipts.

## Next bounded action

1. Root's integration review and checks on the frozen combined head.
2. Then root's decision on the PR. No push, merge or deploy until the final checks and reviews qualify that same head.
3. Then the operator batch for an actual G7 run, which needs the owner's authority for the grant, the deploy and the spend.
