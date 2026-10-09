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

With the switches off, the API serves no A15 route, needs nothing from 0046 to be ready, and adds no `exchangeId` or `withdrawnSourceIds`. The bridge and the Studio also behave exactly as before.

What exists in source, under a grant:
- **Grant and guard (0046).** The guard ends a granted exchange at its deadline, at revocation or expiry, or at its connection, turn or budget limit. The evidence store keeps the bridge's receipts for 24 h, readable only by the principal. No free text and no speech are kept.
- **A durable spend bound per exchange** (`media_voice_reserve`). It holds across a same-exchange replacement and across a process restart: connections and generations are reserved atomically under the exchange's lock, and the bridge fails closed.
- **The media bridge's recorder**, sending receipts over `POST /v1/media/evidence`. It records only the principal's own turns.
- **The Studio's page receipts and build identity.**
  - Page receipts are window events fired only under a grant, only for Sophia's element, with listeners that end with her subscription and with the call.
  - The build identity is `<meta name="sophia-build">`.
- **Canonical joins for the Lab:**
  - `NativeTask.exchangeId`, linked by the transaction that inserted the command, never by key;
  - the per-call ledger, `GET /api/v1/exchanges/{id}/calls` with `readAt`/`?after=`/`answeredAt`/`outcome`. Recording is fenced against End (C5), so an ended exchange is a durable recording boundary;
  - live presence, as the member's own fresh `selfPresent`;
  - `withdrawnSourceIds` on the native task detail;
  - a voice edit's call joined to its edit (`live_call_design_edit`, `e85baa5f`): `revise_html_page` marks its own admission transaction, and the trigger links the call to the edit's design command only under that mark, for the same project, actor and key. A member's own edit through `POST /html-edits`, even under a recorded call's key, links nothing.
- **Voice tool calls, one attempt at a time** (voice qualification on; Codex P1 r4234393693, r4234782534, r4234782537). Each call is made under its key's fence, a session advisory lock, across API processes. The attempt holding it takes the key's next generation (0047, `live_call_fences`), and a recorded call's answer is written only under that generation: sealed in the transaction that writes what the call does, or marked on its own when it writes nothing. An attempt whose fence was lost answers `unknown` and commits nothing. **Bound:** at most 8 fence sessions per API process (`CALL_FENCE_SESSIONS`), beside the pool's connections, so the API's database sessions are at most its pool's max plus 8. A call that finds none free within 5 s answers `unknown` (`unconfirmed:busy`) and runs nothing.
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

- **Migrations.** Only 0046 is added. 0001–0045 are blob-identical to the base. 0046 is applied nowhere and was edited in place until handover; once applied it is never edited.
- **Contracts.** Amendment A15 adds the routes and fields, regenerated with `pnpm --filter @sophia/contracts generate`.
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
  - Deploy order, on: the bridge and the Studio first, then 0046, then `SOPHIA_VOICE_QUALIFICATION`, then `SOPHIA_VOICE_EVIDENCE`. Off: the reverse.
  - Nothing sets `VITE_SOPHIA_COMMIT` or either flag yet.
  - No grant exists.
- **Known and not fixed:** a bridge restarted mid-exchange begins receipt numbers at 1 again, and the API refuses the numbers already used (409, dropped and counted). The bridge's own stop no longer depends on a receipt (`6262d61b`).
- **Wording, not changed:** after the withdrawal, Stop by voice is refused with "the report is still at version 1" while the page is at version 2. That is the report's version, not the page's.
- **Lab side.** Voice Lab deltas 1–6 are in `voice-lab/studio-livekit-g7`. They are handed over separately, each with its own review and receipts.

## Next bounded action

1. Root's integration review and checks on the frozen combined head.
2. Then root's decision on the PR. No push, merge or deploy until the final checks and reviews qualify that same head.
3. Then the operator batch for an actual G7 run, which needs the owner's authority for the grant, the deploy and the spend.
