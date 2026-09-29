# SMC-M01 progress: the mission-aware companion

The mission: [M01](../missions/2026-09-27-companion-research/missions/M01_MISSION_COMPANION.md), pack v1.1. Coordination: issue [#17](https://github.com/davidelaverga/Sophia/issues/17). Implementation PR: [#18](https://github.com/davidelaverga/Sophia/pull/18) (draft). Contract binding: [SMC-M01-contract-binding.md](SMC-M01-contract-binding.md), with its implementation notes in §10.

This record keeps source, tests, hosted evidence and human acceptance apart. A state changes only with the evidence named beside it.

**State on 2026-09-29, attempt 1: G1–G4 are implemented and tested; every review finding so far is fixed; G5 is prepared, not requested.** The candidate is on PR #18.
- **Codex's GitHub reviews.** The first (of `5382575`) found two P2 issues, fixed at `a0a1562`; the second (of `50ae500`) two P1 issues, fixed at `7fd4573`; the third (of `44513c8`) one P1 and three P2 issues, fixed at `f230848`; the fourth (of `ae6312a`) one P1, fixed at `dfee0bc`; the fifth (of `98a6373`) nothing new.
- **Codex's read-only reviews for OP-0002.**
  - [CX-0004](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5890130877), at `dfee0bc`: two P1 issues and one P2, all fixed at `5a03cfd`.
  - [CX-0005](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5894969768), Codex's check of those fixes at `5a03cfd`: it confirmed the current-floor fix, and found one P1 and two P2 issues. They are fixed at `421e535`, following Davide's two product decisions (§5).
  - [CX-0006](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5895490785), Codex's check of those at `421e535`: it confirmed the reach, the authorization and the stale replay, and found one P1 and one P2. Both are fixed at `f0ca9f0`.
  - [CX-0007](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5896824034), Codex's check of those at `f0ca9f0`: two P1 and two P2 findings about the Forget confirmation and the word matching. All four are fixed at `73308de`.
  - [CX-0008](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5897375359), Codex's check of those at `73308de`: F1–F3 closed; one P1 remains, a list built by hand without any preview. Fixed at `2d3549e` with a server-signed preview proof.
  - [CC-0012](../coordination/SMC-M01/SMC-M01-CC-0012.md) ([posted](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5897585965)) asked Codex to check it. [CX-0009](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5897807539) answered at `2d3549e`: no finding within the proof, the order and the key. OP-0002 has no open finding.

Nothing is merged, released or accepted. **Path B, a production test before merge,** is requested at Davide's wish: [CC-0013](../coordination/SMC-M01/SMC-M01-CC-0013.md) ([posted](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5898359269)) (OP-0004) binds PR #18's head `c429869`. Davide's request to deploy "the latest commit" is intent, not approval of that batch: Codex preflights on its own, then asks Davide for the exact approval. The post-merge release ([CC-0003](../coordination/SMC-M01/SMC-M01-CC-0003.md), not posted) still waits on Luis's review and R00's #16.

| Readiness | State |
|---|---|
| Source-ready | Candidate: G1–G4 implemented, local checks green (§2), every review finding fixed (§5). CI runs on each pushed head |
| Merge-ready | No: Luis's review of the Studio layout, and R00's #16 landing first. Codex's read-only reviews (OP-0002) have no open finding (CX-0009) |
| Release-ready | Requested, not approved: OP-0004 revision 2 ([CC-0014](../coordination/SMC-M01/SMC-M01-CC-0014.md)) puts `126cea3` in production before merge. Codex's preflight of revision 1 ([CX-0010](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5898465673)) is blocked on the migration-owner connection, which Davide supplies securely to Codex's host, and on Davide's exact approval. The post-merge release (CC-0003) is a draft |
| Hosted-verified | No |
| Product-accepted | No |

## 1. Identities

| Item | Value |
|---|---|
| Base | `main` `c683e6e60ff76004e8a06e71c368b718848b1687`: the merge of #15. CI push run 36357507466, all four jobs green |
| Not in the base | R00's closeout, PR #16, open at `86d35ad` (CX-0001). Its code commit `0391bc6` changes only the runtime host's profile reconciliation; M01 touches none of its files. The branch merges `main` once #16 lands |
| Branch | `claude/upbeat-feynman-d7jskb` (this session's designated branch, dedicated to M01) |
| Commits | `dc2d06e` G1 (docs) · `551a18f` G2 ledger · `39545f1` G3 guide and tools · `cfec301` G4 mission view · `8a4b6a7` G4 layout (T17) and parity · `5382575` checkpoint (docs) · `a0a1562` the first review's fixes · `7fd4573` the second review's fixes · `f230848` the third review's fixes · `dfee0bc` the fourth review's fix · `5a03cfd` CX-0004's fixes · `421e535` CX-0005's fixes · `f0ca9f0` CX-0006's fixes · `9a8082b` CX-0007's fixes · `73308de` the Forget list's layout · `2d3549e` CX-0008's fix · then their docs |
| Migration | `db/migrations/0018_mission_ledger.sql`, 59401 bytes, sha256 `d6e6598c3a4c4e1a9771c3ac8169fad5cca55d33c1f5a6cb119859e9a87aa181` (the ledger's checksum is the file's SHA-256: 0017 matches CX-0001's `0d0b929f…`) |
| Contract | amendment `A08-mission-ledger.json` sha256 `43df2cd7…0c7f`; generated `openapi.json` sha256 `976e57f8…301c` |
| Guide in the bridge | `apps/media-bridge/src/content/mission-guide/`: prompt `e4fb14d3…c44b` (9809 bytes), skill `2e746dfb…90d5` (14600 bytes), combined `7fe8f729…8f6d` (24410 bytes), manifest `a77cad01…9ba9`, each byte-identical to the pack |
| Pack | v1.1 (sha256 `8ad62933…802c`); `SHA256SUMS`, `validate_pack.py` and `validate_m01_assets.py` pass in place (rerun at this checkpoint) |
| Hosted, observed | CX-0003 (22:54 UTC): API `dep-dasrhht9fdbs73eolc40`, worker `dep-dasrio7pn0mc739nnetg`, runtime `dep-dasrjpt9fdbs73eour90`, bridge `dep-dasrlh17lnhs73agv6f0`, all live at `0391bc6`, tracking `claude/affectionate-cannon-496z9m`; Studio `dpl_7sUgFJnxvQGwaqxiNUpYijbVVFpp`; schema 0001–0017, no 0018 (CX-0001). **Since then**, reported to this session by Codex on 2026-09-29: API live at `0391bc6` with deploy `dep-dau0cdmk1f9s739st1mg`, bridge still `dep-dasrlh17lnhs73agv6f0`, schema 0001–0017, Auto-Deploy Off. CC-0013's preflight re-observes all of it |

## 2. Checks

**Baseline (at `c683e6e`):** `pnpm check` exit 0 (256 unit, 51 integration against the real pinned dsh); `pnpm test:sql` 17 migrations; `pnpm test:db` 147/147.

**Candidate (this session, Node 24.21.0, pnpm 11.7.0):**

| Check | Result |
|---|---|
| `pnpm check` on the final tree | exit 0: toolchain, format, lint, build, typecheck, `contracts:check`; 299 unit tests; artifacts reproduced; 56 integration tests against the real pinned dsh. That includes the 5-test runtime-service crossing (real API, PostgreSQL and worker), which runs when `SOPHIA_DISPOSABLE_DATABASE_URL` is set |
| `pnpm test:sql --source pack` | the pack's 4 migrations and its SQL test pass |
| `pnpm test:sql` | 18 migrations, including 0018, and the SQL test pass |
| `pnpm test:db` | 195/195 (baseline 147; the brief cases now expect 410) on the local `C.UTF-8` cluster, and 195/195 on an `en_US.UTF-8` cluster, production's `datctype` (CX-0006) |
| CI flake, found and fixed | `runtime-unit` failed on `750c3ff` (docs only) in two `room-session.test.ts` tests: a retry test waited a fixed 5 ms for two timer-driven retries, and its fake counted a late call into the next test. Reproduced under CPU load (1 of 15 runs). Fixed at `126cea3`, test-only: bounded waits for the answer and per-test fakes. Then 0 of 30 and 0 of 12 (whole file) under the same load. `pnpm check` at `126cea3`: exit 0, 299 unit and 56 integration; CI green on both runs |
| Rollback compatibility | Production's code (`0391bc6`) against migrations 0001–0018, rerun with 0018 at `d6e6598c…`: its own `test:sql` passes and `test:db` is 147/147. 0018 can be applied while the old API runs, and the API and bridge can go back without touching the schema |
| T17 in a browser | §4, T17; the Forget confirmation checked again at `2d3549e` (below) |

The database suites ran against a disposable local PostgreSQL 16.13 cluster through `SOPHIA_DISPOSABLE_DATABASE_URL`: this container has no Docker daemon. CI runs them on `postgres:16`. The `room-media` job (a real LiveKit server) exercises `rtc.ts` and the worker's removals, which M01 does not change.

## 3. Goals

| Goal | State | Evidence |
|---|---|---|
| G1 Bind current source and contracts | done | [binding](SMC-M01-contract-binding.md) (§10: implementation notes); OP-0001 answered (§5) |
| G2 Canonical ledger | source done | 0018, A08, `packages/persistence/src/{mission,mission-context}.ts`, `apps/api/src/routes/mission.ts`; §4 |
| G3 Voice notes and guide | source done | `apps/media-bridge/src/{guide,guide-context,tools,room-session,live-session}.ts`, `apps/api/src/{media-tools,mission-tools,voice-status,source-page}.ts`; §4 |
| G4 Mission experience | source done | `apps/studio/src/features/mission/`, Converse without the brief form; T17 checked in a browser (§4) |
| G5 Release and acceptance | prepared | [CC-0002](../coordination/SMC-M01/SMC-M01-CC-0002.md) and its revisions [CC-0004](../coordination/SMC-M01/SMC-M01-CC-0004.md) [CC-0005](../coordination/SMC-M01/SMC-M01-CC-0005.md), [CC-0006](../coordination/SMC-M01/SMC-M01-CC-0006.md), [CC-0007](../coordination/SMC-M01/SMC-M01-CC-0007.md) (answered by CX-0004) [CC-0008](../coordination/SMC-M01/SMC-M01-CC-0008.md), [CC-0009](../coordination/SMC-M01/SMC-M01-CC-0009.md), [CC-0010](../coordination/SMC-M01/SMC-M01-CC-0010.md), [CC-0011](../coordination/SMC-M01/SMC-M01-CC-0011.md) and [CC-0012](../coordination/SMC-M01/SMC-M01-CC-0012.md) (read-only checks), [CC-0003](../coordination/SMC-M01/SMC-M01-CC-0003.md) (release request, draft) |

## 4. Acceptance cases

"Source" names the tests that hold the case at this candidate (file and test title, abridged). Hosted evidence is G5; nothing is accepted yet.

| Case | Source evidence | Hosted | Accepted |
|---|---|---|---|
| T01 Clarify without a form | The brief form, its instruction and its checkboxes are gone (Studio); no `start_brief` declaration (`tools.test.ts`); the v1.1 prompt and skill are sent verbatim (T19). The clarifying itself is prompt behaviour | not run | no |
| T02 Empty, present, unavailable | persistence `mission.db.test.ts` "reads empty only when nothing exists…"; API `mission.db.test.ts` "project_status tells an empty project from one with history, and reports an outage as unavailable" | not run | no |
| T03 Durable, attributed note | persistence "a typed note is a source-backed, attributed entry…"; API "a voice note follows the note policy and is kept as the speaker's paraphrase" | not run | no |
| T04 Idempotent retry | persistence (same key, same receipt); API "a typed note is recorded once per key; a changed request under the same key is a conflict" | not run | no |
| T05 Concurrent writes | persistence "two proposals from one mission revision: the second acceptance is a conflict", "concurrent decisions on one proposal: exactly one commits", "concurrent corrections of one note…" | not run | no |
| T06 Proposal ≠ disagreement ≠ hypothesis ≠ decision | persistence "a proposal, a rejected alternative, a hypothesis and an accepted constraint stay distinct"; Studio labels (`mission-view.test.ts`) | not run | no |
| T07 Viewer or revoked editor cannot commit | persistence "a viewer cannot record, propose or decide; a revoked editor cannot either"; API `media.db.test.ts` "a viewer can take the floor… but cannot change the mission by voice" | not run | no |
| T08 Confirmation binding | persistence T08 suite (same utterance refused, next utterance commits once; speaker switch, restarted provider session, expired or replaced target, stale revision refused; a call from an epoch the floor has left refused, even by the same speaker; viewer refused); API "a proposal read back to the speaker becomes the target; their answer in a later utterance decides it" | not run | no |
| T09 Capture off, guest, private | persistence "capture off, consent unset or declined, a turn that binds someone else, or a paused exchange write nothing"; guests are not members and never reach the ledger | not run | no |
| T10 No raw speech kept | bridge `room-session.test.ts` "keeps no transcript: the holder's words reach no log, tool call or session state"; policy buffer 0/0/0 | not run | no |
| T11 Original expectation survives | persistence "an outcome links its expectation and leaves the original prediction and its time unchanged" | not run | no |
| T12 Revoked source does not re-enter | persistence "the text is erased, the source is ineligible…", "what was derived from the note goes with it…", "no digest of the forgotten text is left to guess it by; a replay under its key is stale…", "a member forgets back to their own earliest wording…", "a proposal that repeats a note's words cites it…", "the preview names exactly what the withdrawal then erases…", "a proposal decided after the preview is not erased under its unchanged id", "a withdrawal must name what the member was shown…", "compatibility forms stay other characters…", "a withdrawal needs the server's proof that this member was shown this list for this note"; API "a withdrawal forgets every version of the note", "before forgetting, a member sees exactly what goes with the note…"; Studio `mission-view.test.ts` (the Forget list, whole and with every field; the fail-closed controls; the citations line); media "forgetting a note wakes the bridge at once…" (after the rebuild, `project_status` and `read_selected_source` hold none of it); bridge "a narrowed eligibility drops the provider context and reconnects cold" | not run | no |
| T13 Paged source marked partial | API "a long source reads in pages marked partial, with a cursor to the rest" | not run | no |
| T14 Historical brief kept, new brief retired | API "new admission answers 410 before any write; an existing brief is still readable"; `runtime.db.test.ts` (410 for viewer and editor); integration `runtime-service.test.mjs` (410, then the historical brief runs); Studio has no brief form. Production holds 2 finished briefs and 0 in flight (CX-0002) | not run | no |
| T15 Controls unchanged | `control_work` unchanged; the bridge, exchange and runtime suites pass (unit 299, integration 56) | not run | no |
| T16 Hosted two-person EN/IT/ES episode | needs a live qualification approval (G5) | not run | no |
| T17 Viewport, zoom, a11y | Browser check at `8a4b6a7`, below | not run | no |
| T18 Only committed notes after a crash | bridge "a write whose reply is lost is retried with the same identity, then reported unknown"; reads return committed rows only | not run | no |
| T19 Exact setup payload | `guide.test.ts` (identities, the pack's bytes, §8's literal, one core and one skill); `live-session.test.ts` against the real `@google/genai` SDK and a local WebSocket: "carries exactly the checked M01 instruction, once, and the six declared operations" | not run | no |
| T20 Bad assets or unbound handlers block activation | `guide.test.ts` "a guide that cannot be activated" (missing file, flipped byte, BOM, CRLF, extra LF, manifest edits, declaration mismatch); bridge "does not connect Google until the API executes exactly the guide's operations"; the server exits when the guide fails to load | not run | no |
| T21 Reconnect and rebuild keep the static assets | `live-session.test.ts` "a resumed connection sends the same instruction bytes with its handle"; bridge "fresh, resumed and rebuilt connections all send the identical instruction" | not run | no |
| T22 Names match handlers, no future tools | `tools.test.ts` (declarations = manifest = contract enum; no retired or future tool); API "serves the guide's six operations to the bridge", "an operation the contract does not name is refused at the door"; the handler map is typed by the contract's union | not run | no |

**T17 evidence (this session, headless Chromium through Playwright on synthetic dev data; the real API on a seeded local database and the Studio in Vite):**
- **Found and fixed.** The mission view was sized to its whole content. At 1280×800 it left about 17 of the composer's 114 px in view, and on a phone about 35 of 153 px. It now gives way like the discussion: 107/114 px at 1280×800 and 125/153 px at 375×812. Its direction line stays in view, and its lower edge fades while there is more below. Opened, the conversation is the one scroller.
- **Measured at 1280×800, 1280×640, 375×812, 640×400 (200% zoom) and 320×256 (400% reflow):**
  - no horizontal overflow;
  - the dock never overlaps the lens (a 22–44 px gap);
  - no page errors apart from the Studio's missing favicon, which predates M01.
- **Keyboard, with reduced motion at the small sizes:**
  - every mission control is reachable in DOM order;
  - it shows a focus ring and is scrolled into view when focused;
  - none sits under the dock.
- **Manual controls through the UI, each confirmed in the API:** add, correct and forget a note (forgetting asks first); reject and accept proposals; withdraw and give consent; the admin's capture off and on.
- **The Forget confirmation, at `f0ca9f0`** (headless Chromium, the real API and Studio, synthetic data on an `en_US.UTF-8` database; 10/10 checks):
  - when the preview fails, the confirmation says so and "Forget it" stays disabled; "Check again" reads it;
  - the list names the note and the accepted direction citing it, each with its words;
  - a list that went stale (a proposal repeating the note arrived after it was shown) is refused, nothing is erased, and the refusal is in plain words, wrapped inside the panel at 1280 and 375 px wide;
  - asking again lists the new proposal, and confirming erases exactly that list;
  - forgetting the note the accepted direction cites erases both.
- **The Forget confirmation, at `73308de`** (the same setup; 26/26 checks):
  - A, B and C above, again with the list required; the accepted direction is listed with its purpose;
  - a constraint shown as proposed, then accepted before the member confirms, is refused with nothing erased; asking again shows it accepted, and confirming erases the note and it (CX-0007 F1);
  - a note of about 1,900 characters is listed whole, and a pending mission with its purpose, destination and starting point (CX-0007 F2);
  - at 1280×900, 1280×640 and 375×812 the list's heading is in view on opening; the list has no scroller of its own, and the conversation, the one scroller (T17), reaches its start and both buttons without sideways scroll. A first version gave the list its own 288 px scroller; the panel's scroller is 107–217 px tall, so that nested a scroll trap, and it was removed at `73308de`.
- **The Forget confirmation, at `2d3549e`** (the same setup; 27/27 checks): the checks above, each withdrawal now carrying the preview's proof, and a withdrawal built by hand, its list exactly the current reach, with a made-up proof, refused (422) with nothing erased (CX-0008 F1).
- **Limitation, predating M01.** At 200% zoom and 400% reflow the room stage leaves the lens 29–51 px tall. Its geometry is fixed by the light engine (`features/light/engine.ts`) and `theme.css` (`--ly`, `--lr`, `.stage-body`). Everything stays reachable by keyboard and scrolling, but it is cramped, for the composer as much as for the mission view. The fix belongs to the layout's owner, not to M01.

## 5. Operations

| Operation | Kind | Request | State |
|---|---|---|---|
| SMC-M01-OP-0001 | read-only preflight | [CC-0001](../coordination/SMC-M01/SMC-M01-CC-0001.md) | answered by [CX-0001](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5880038214) (`blocked`, partial), [CX-0002](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5880048077) and [CX-0003](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5880197156) (`reconciled`); read only, no effects |
| SMC-M01-OP-0002 | read-only source review and inspection | [CC-0002](../coordination/SMC-M01/SMC-M01-CC-0002.md), revision 2 [CC-0004](../coordination/SMC-M01/SMC-M01-CC-0004.md), revision 3 [CC-0005](../coordination/SMC-M01/SMC-M01-CC-0005.md), revision 4 [CC-0006](../coordination/SMC-M01/SMC-M01-CC-0006.md), revision 5 [CC-0007](../coordination/SMC-M01/SMC-M01-CC-0007.md), revision 6 [CC-0008](../coordination/SMC-M01/SMC-M01-CC-0008.md), revision 7 [CC-0009](../coordination/SMC-M01/SMC-M01-CC-0009.md), revision 8 [CC-0010](../coordination/SMC-M01/SMC-M01-CC-0010.md), revision 9 [CC-0011](../coordination/SMC-M01/SMC-M01-CC-0011.md), revision 10 [CC-0012](../coordination/SMC-M01/SMC-M01-CC-0012.md) | revision 5 answered by [CX-0004](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5890130877) (findings [F1](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5890111217), [F2](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5890116010), [F3](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5890119604)); revision 6 answered by [CX-0005](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5894969768) (findings [F1](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5894944525), [F2](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5894948663), [F3](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5894959050)); revision 7 answered by [CX-0006](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5895490785) (findings [F1](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5895469644), [F2](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5895476039)); revision 8 answered by [CX-0007](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5896824034) (findings [F1](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5896814543), [F2](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5896814805), [F3](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5896815109), [F4](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5896818285)); read only, no effects beyond one production metadata `SELECT` and a private SQL Editor draft CX-0006 reported. revision 9 answered by [CX-0008](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5897375359) (finding [F1](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5897370118)); revision 10 answered by [CX-0009](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5897807539), no finding. Read only throughout; no unknown effect |
| SMC-M01-OP-0003 | release batch, after merge | [CC-0003](../coordination/SMC-M01/SMC-M01-CC-0003.md) | draft, not posted, not approved; revised if OP-0004 runs (0018 then verify-only) |
| SMC-M01-OP-0004 | release batch: production test before merge (path B) | [CC-0013](../coordination/SMC-M01/SMC-M01-CC-0013.md) ([posted](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5898359269)), revision 1 at `c429869`; [CC-0014](../coordination/SMC-M01/SMC-M01-CC-0014.md), revision 2 at `126cea3` (a test-only change) | revision 1 preflighted by [CX-0010](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5898465673), `blocked`: every source, live, schema, settings and guide precondition held, but there is no migration-owner connection on Codex's host and no approval. Revision 2 keeps both blockers. No effect yet |

**Reviews of PR #18:**

| Review | Findings | Outcome |
|---|---|---|
| Codex GitHub review of `5382575` (review 5346100271, requested by Davide) | P2: a note-policy or consent change did not reach a live guide (`0018`, `set_mission_note_policy` and `set_mission_note_consent`). P2: the retired `POST …/native-tasks` still declared a 202 receipt | Both fixed at `a0a1562`, with tests; binding §10. 0018's hash changed, so CC-0002 is superseded by CC-0004 |
| Codex GitHub review of `50ae500` (review 5346285586, requested by Davide) | P1: the API's CORS preflight did not allow `PUT`, so the hosted Studio could not set note capture or consent (`apps/api/src/cors.ts`). P1: an accepted constraint or lesson naming the mission in `supersedesDecisionId` marked it superseded while the mission projection stayed (`0018`, `mission_accept`) | Both fixed at `7fd4573`, each with a test shown failing before the fix; binding §10. 0018's hash changed again, so CC-0005 supersedes CC-0004 |
| Codex GitHub review of `44513c8` (review 5346681863, requested by Davide) | P1: two replacements of one decision could both be accepted (`0018`, `mission_accept`). P2: an external change during the guide's own write was hidden by its receipt (`guide-context.ts`). P2: after an unconfirmed correction the Studio offered a fresh save with a new key (`MissionNotes.tsx`). P2: a correction dropped the note's links (`0018`, `record_mission_entry`) | All fixed at `f230848`, each with a test shown failing before the fix; the same retry rule also covers adding, forgetting and deciding in the Studio. 0018's hash changed again, so CC-0006 supersedes CC-0005 |
| Codex GitHub review of `ae6312a` (review 5346772180, requested by Davide) | P1: a withdrawal moved the eligibility revision but nothing woke the bridge's assignment poll, so a live provider context could keep the forgotten text for up to 25 s (`0018`) | Fixed at `dfee0bc`: a trigger notifies `sophia_media` for every live exchange of a project whose mission, ledger or eligibility revision moves. The end-to-end test (the real API and bridge, fake Live) fails without it. 0018's hash changed again, so CC-0007 supersedes CC-0006 |
| Codex GitHub end-to-end check of `98a6373` ([comment 5888764066](https://github.com/davidelaverga/Sophia/pull/18#issuecomment-5888764066), requested by Davide) | No new blocking source issue. It re-read the ledger, the tool boundary, the guide's freshness, the bridge's wake and the cold rebuild. It restated four open gates, all already recorded here: its runner had Node 24.15.0, not the pinned 24.21.0, so it did not rerun `pnpm check` (CI runs it on every head); hosted acceptance (§7); the forgotten note's SHA-256 (§7, CC-0002 §1.2); Luis's review | Nothing to fix; no code change. Its validators (`validate_m01_assets.py`, `validate_pack.py`) passed. This is a GitHub review, not OP-0002: CC-0007 is still unanswered |

**OP-0001, checked by Claude against CC-0001:**

| CC-0001 asked | Observed | What it means for M01 |
|---|---|---|
| 1. Live tuple | Four Render services live at `0391bc6` (CX-0003); Studio `dpl_7sUg…`, the deployment R00 verified at `0391bc6` (CX-0001); `/health` and `/ready` 200 | The release's starting point and its rollback targets |
| 2. Schema | 0001–0017, checksums matching `c683e6e`; 0 pending; no 0018 | 0018 is free and will be the only pending migration |
| 3. Counts | 6 projects; 7 active admins, 0 editors, 0 viewers; 0 `project_revisions` above 1; 0 non-empty frames; 0 decisions; 2 `draft_brief` jobs, both succeeded; 0 non-terminal native tasks (CX-0002); 2 non-terminal work attempts; 0 open exchanges | 0018's new `decisions` columns meet no existing row, and there is no legacy frame to carry. The two finished briefs must stay readable (T14), and no brief in flight is stranded by the 410. The two work attempts are not M01's; they are recorded, not touched |
| 4. Roles | `sophia_api_app` is not superuser, not BYPASSRLS, a member of `sophia_api`; migration-owner access through the SQL editor | The runbook's owner-connection migration step applies |
| 5. Triggers | Auto-Deploy and PR Previews Off on all four; Studio has no Git link | Merging deploys nothing |
| 6. Bridge setting | `GEMINI_API_KEY` and `SOPHIA_LIVE_MODEL` present; the model value is masked and **unverified** | The bridge logs its effective model on `bridge.start`: the release reads it there (CC-0003) |
| 7. R00's closeout | #16 open, head `86d35ad` | M01 merges after it |

**OP-0002 revision 5, checked by Claude against CC-0002 and CC-0007:**

| Asked | Codex's answer (CX-0004) | Claude's check and outcome |
|---|---|---|
| §1.1 Voice confirmation | The guards hold for the same utterance, another actor, a cold provider session, a replaced or expired target, a stale revision and a repeated key. **F1 (P1):** a call from an epoch the floor has left could still commit, because `media_tool_speaker` and `mission_turn` checked only that the speaker once held that epoch | Confirmed in `0018` (`mission_turn`) and reproduced by a test: a decision said in epoch 1 accepted after the floor moved. Fixed at `5a03cfd`: every voice write requires the current epoch; the project lock serializes it with floor changes. Codex's other remark, that the target is set when the proposal is read, before any proof it was heard, stands: the host proves a later utterance, not what was said. It is a G5 observation (§7) |
| §1.2 Forgetting | The note's own text, events and receipts are clean. **F2 (P1):** a proposal citing the note, and an accepted mission's frame, kept copies of its words. **F3 (P2):** the source tombstone and the request records kept a plain SHA-256. The rebuild after a forget is asynchronous, and provider-side history is not erased | F2 and F3 confirmed and reproduced by tests; fixed at `5a03cfd` (binding §10): forgetting reaches the note's versions and the proposals and decisions citing it, and leaves no digest. The timing remark stands as a limitation (§7) |
| §1.3 Note policy | Voice notes need capture on, the speaker's consent and a live, unpaused exchange. Voice proposals need consent but not capture, as the binding's explicit-proposal rule says; explicit intent is the guide's to enforce | Matches binding §4.2 and §10. F1 also covered voice notes and proposals; fixed with it |
| §1.4 0018 on production's data | No table rewrite of the existing rows is expected, but `ALTER TABLE` holds `ACCESS EXCLUSIVE` locks until commit, and constraints scan rows. A short run is plausible, not guaranteed; static reading cannot prove it applies cleanly | Recorded in CC-0003: 0018 runs in one transaction (`BEGIN` … `COMMIT`), so a failure changes nothing, and the release needs 0 open exchanges |
| §2 Dry run | **Blocked:** no migration-owner connection on Codex's host; not substituted. Even a clean dry run does not execute 0018 | CC-0003's step M1 starts with the dry run on the owner connection, at the reviewed commit, before applying |
| §3 Render | "Deploy a specific commit" (dashboard) or a deploy through the API with `commitId` deploys any commit of the linked repository, not only of the tracked branch. The dashboard route turns Auto-Deploy off, already Off here; "Deploy latest commit" would follow the old branch | CC-0003's R1 and R2 use a specific-commit deploy of the merged commit; no setting changes |

**OP-0002 revision 6, checked by Claude against CC-0008:**

| Asked | Codex's answer (CX-0005) | Claude's check and outcome |
|---|---|---|
| 1. F1, the current floor | Fixed for new commits: every voice write checks the current epoch under the project lock, which every floor change in 0013 takes first. A replay of a call that already committed may return its receipt after the handoff; it creates nothing | Agreed; nothing to change. A replay returning its stored receipt is idempotency, not a new effect |
| 2. F2, forgetting | The cascade works for a note a proposal names. **F2 (P1):** a proposal that repeats a note's words without naming it survives. **F3 (P2):** in an A1 → B2 → A3 correction chain, A forgetting A3 leaves A1. Keeping another member's earlier independent words is reasonable. Erasing other members' later corrections and a citing accepted mission needs Davide's explicit acceptance and a clear explanation in the UI | Both confirmed and reproduced by tests. Fixed at `421e535` after Davide's two decisions (below). The words a proposal repeats make it cite the note. The reach runs from the forgetter's earliest own version to the latest. The Forget confirmation lists exactly what goes, from the same function the withdrawal uses |
| 3. F3, digests and replay | No plain digest or length remains in the reviewed records. **F1 (P2):** after redaction, a retry under the same key, even with changed text, returns the old `committed` receipt | Confirmed and reproduced; fixed at `421e535`: such a retry is a stale conflict, "what it wrote has since been forgotten" |
| 4. 0018 on production's data | The `decisions_state_check` swap takes an `ACCESS EXCLUSIVE` lock and validates an empty table; no rewrite. The estimate is unchanged, and a quiet window still matters | Recorded; CC-0003 already requires 0 open exchanges |

**Davide's product decisions** were given in the implementation session on 2026-09-29, after CX-0005, in answer to two questions:
1. *"CX-0005 F2 (P1): forgetting only reaches proposals that cite the note. If a proposal repeats a note's words without citing it, the copy survives the forget. What should the forget guarantee cover?"* Davide chose **"Auto-cite literal copies (Recommended)"**. A proposal that repeats a current note's words (six in a row, or the whole of a note of three to five words) is recorded as citing it, and forgetting reaches it. A paraphrase that doesn't cite is outside the guarantee.
2. *"When a note is forgotten, what should happen to what was built on it by other people?"* Davide chose **"Erase them, warn first (Recommended)"**. The note's later versions and everything citing it go, the accepted mission included. The Forget confirmation lists exactly what will be erased before the member confirms.

These are product decisions about M01's behaviour, not release approvals.

**OP-0002 revision 7, checked by Claude against CC-0009:**

| Asked | Codex's answer (CX-0006) | Claude's check and outcome |
|---|---|---|
| 1. Repeated words | Voice and Studio proposals both cite what they repeat, across the four fields, from current and superseded notes. **F2 (P2):** there is no Unicode normalization, so a composed and a decomposed accent tokenize differently; and a six-word run can span two fields, which could cite, and later erase, an unrelated decision | Confirmed: in both `C.UTF-8` and `en_US.UTF-8`, `città` written with a combining accent splits as `citta`. Fixed at `f0ca9f0`: words are NFKC-normalized first, and a note is matched within one field at a time. The test fails on `421e535` |
| 2. Reach and replay | `mission_forget_reach` is right for admins, non-admins and mixed chains, and the preview and the withdrawal share it. Replays under a forgotten key are stale. Concurrent changes between the preview and the `POST` can change the list | Agreed; the concurrency point is part of F1 below |
| 3. Preview route and Studio | The `GET` is authorized as the withdrawal is and shows nothing a member can't already read. **F1 (P1):** on a failed preview the Studio enabled "Forget it" with a generic warning; on success it counted versions and clipped statements; and the `POST` did not use the preview | Confirmed. Fixed at `f0ca9f0`. The Studio fails closed and offers "Check again". The list names every version and decision with its words. The withdrawal carries the ids it showed (`expectedAffected`), and the server erases only if that is still exactly its reach, else a stale conflict explained in plain words. Browser-checked (§4, T17) |
| 4. Production locale | `en_US.UTF-8`, read with one `SELECT` in the signed-in SQL Editor, which also saved a private untitled draft; no database record changed | `test:db` now also runs on a local `en_US.UTF-8` cluster: 191/191 |

**OP-0002 revision 8, checked by Claude against CC-0010:**

| Asked | Codex's answer (CX-0007) | Claude's check and outcome |
|---|---|---|
| 1. F1, the confirmation | The Studio blocks confirmation until the preview is shown, and sends its list; an unconfirmed retry reuses its key. **F1 (P1):** the withdrawal compared ids only, so a proposal shown as pending and accepted before the member confirmed was erased as the accepted mission. **F2 (P2):** the list clipped words at 280 characters and left out a decision's purpose, destination and origin, all erased | Both confirmed, each by a test that fails at `f0ca9f0`. Fixed at `73308de`: the list carries each decision's revision, which every state change moves, and the withdrawal compares it under the project lock. The preview returns every field, and the Studio lists all the words whole, in the conversation's one scroller (binding §10). Browser-checked (§4, T17) |
| 2. F2, the word matching | Canonical accents and per-field matching are fixed. **F3 (P2):** NFKC also folds compatibility forms, so `plan ① now` cited `plan 1 now` | Confirmed at `f0ca9f0` for `①` and full-width forms. Davide's rule is literal copies, so NFC is the reading: fixed at `73308de`, with canonical accents still matched |
| 3. Scope | **F4 (P1):** a direct API call without `expectedAffected` erases the reach without any warning; not acceptable under "erase them, warn first" without an owner-approved exception | Agreed, no exception asked. Fixed at `73308de`: the list is required in A08, at the API and in SQL, and every caller sends it. The earlier flat list is refused too |

**OP-0002 revision 9, checked by Claude against CC-0011:**

| Asked | Codex's answer (CX-0008) | Claude's check and outcome |
|---|---|---|
| 1. F4, the list | A retry under an earlier key returns its receipt and erases nothing new. **F1 (P1):** the required list is not proof that the member saw it. A member who knows a note's id can send `{entryIds:[id], decisions:[]}` without calling the preview, and it matches the reach | Confirmed: at `73308de` such a hand-built list erased the note. Fixed at `2d3549e` as Codex proposed. The preview returns a proof valid 15 minutes: an HMAC, under a key only the database holds, of the member, project, note, expiry and exact reach. The withdrawal requires it, and checks it under the lock after the list. A hand-built list, a made-up or edited proof, or another member's or note's proof is refused; an expired one is stale (binding §10) |
| 2. F1, drift | Closed: every decision state change moves its revision, which the withdrawal compares under the lock; a note version's state cannot change without its id list changing; a role change removes permission or changes the reach | Agreed; nothing to change |
| 3. F2, the words | Closed in source: every version's words and every decision's four fields are listed whole, and the list flows before the buttons. Codex did not rerun the browser checks or check assistive technology | Agreed. Assistive technology has not been checked by anyone; that stays with Luis's review and G5 |
| 4. F3, NFC | Closed: canonical accent equivalence without compatibility folding; the thresholds and per-field matching unchanged | Agreed; nothing to change |

**OP-0004 revision 1, checked by Claude against CC-0013** ([CX-0010](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5898465673), `blocked`): each §4 precondition was answered.
- **Source:** `c429869`, CI green; later commits docs only then.
- **Migration:** 0018's bytes and hash as requested; the ledger 0001–0017, with 0017 `0d0b929f…`.
- **Live:** API `dep-dau0cdmk…`, a CLI-triggered redeploy of the same `0391bc6`. Bridge, worker (`srv-darv7snpn0mc73e6c240`) and runtime (`srv-darvmse0tbcc73d8kh3g`) as §2. Auto-Deploy Off; `/health` and `/ready` 200; Studio `dpl_7sUg…`.
- **Settings:** names present.
- **Quiet:** 0 open exchanges and 0 pending native jobs.
- **Backup:** 29 Sep 11:15:17 UTC.
- **Guide:** identical.

The blockers are real and are not mine to clear: no migration-owner connection on Codex's host (SQL Editor rightly not substituted), and no approval. Then CI's `runtime-unit` failed on a docs-only commit, from a timing race in two bridge tests (§2); fixed at `126cea3`, test-only. So [CC-0014](../coordination/SMC-M01/SMC-M01-CC-0014.md) is revision 2 at `126cea3`, adopting CX-0010's findings.

**OP-0002 revision 10, checked by Claude against CC-0012** ([CX-0009](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5897807539), `no_findings_in_scope`, at `2d3549e`, 0018 at `d6e6598c…`, identity matched):

| Asked | Codex's answer (CX-0009) | Claude's check and outcome |
|---|---|---|
| 1. The proof | `sophia_api` has no usage on `sophia_secrets`, and the signing and reach helpers are revoked from direct execution. The tag covers the project, note, member, expiry, the ordered version ids and each decision as id@revision. A caller may ask for a genuine preview as itself, but cannot derive a new valid tag from a response. The HMAC matches RFC 2104 with SHA-256's 64-byte block. The proof shows the preview was issued, not that a person read it | Agreed; nothing to change. What it proves is recorded in §7 |
| 2. The order | Under the project lock the list, the tag and the expiry are all checked before the first erasure. A committed key's replay returns its receipt and erases nothing new. A reach that changes and returns to the same ids and revisions before expiry accepts the same proof; any change to the bound list or a revision is refused | Agreed: the same reach is the list the member was shown |
| 3. The key | It is created and filled in 0018's transaction, and the migration runner commits the file and its checksum together, so a failure rolls both back. A backup after 0018 must keep the key row. Restoring a pre-0018 backup and applying 0018 mints a new key, so open proofs fail closed and members preview again. A missing key row cannot authorize an erase | Agreed. The runbook and CC-0003 now say a backup must keep `sophia_secrets` |

## 6. Ownership

Reserved on #17 (binding §8): migration `0018_mission_ledger.sql`, amendment `A08-mission-ledger`, the media bridge, the mission and media API routes, `packages/persistence/src/mission*.ts`, and the Studio conversation and mission features. M01 changes no dependency, lockfile or runtime identity. At this checkpoint it also updated [DESTINATION_MAP.md](../DESTINATION_MAP.md) and the release runbook's M01 notes ([deploy/S1-05A-release.md](../../deploy/S1-05A-release.md)); PR #16 touches neither.

## 7. Limitations of this candidate

- **Behaviour only a hosted episode can show.** T01 and T16 (clarifying without a form; the two-person EN/IT/ES episode) are prompt-level behaviour, not provable locally. They need a live qualification approval: named project and participants, Gemini Live calls with a spend ceiling, and what the notes may retain.
- **Setup against Google.** T19–T22 are proven with the real SDK against a local endpoint. Google's acceptance of the setup, and the hosted model value, are observed only at release.
- **Deploy order.** An old bridge rejects the new API's assignments, which gain three required revisions. The API and the bridge go out back to back, with nobody in a call. The new API's `/ready` requires 0018's functions, so the schema goes first.
- **Zoom.** The room stage's geometry at 200% zoom predates M01 (§4, T17).
- **Names.** The Studio names another member only when the room knows them; otherwise it says "A member". This predates M01 and applies to the discussion too.
- **Forgetting and a live session.** The bridge rebuilds the provider context as soon as it is notified of a forget, but that is asynchronous: a moment of old-context output between the commit and the rebuild is not excluded. Google's own copy of the dropped session is outside Sophia's reach (M01 §6: no promise about another party's copy).
- **What confirmation proves.** The host proves that the speaker said something after the proposal was put to them. It does not prove that they heard it, or what they said. Whether the words meant yes is the model's reading, checked in the hosted episode (G5).
- **What forgetting reaches.** A proposal cites the notes it names and the notes whose words one of its fields repeats: six words in a row, or the whole of a note of three to five words, with a composed or decomposed accent alike (NFC). Compatibility forms such as `①` or full-width letters are other characters. A paraphrase that does neither is not linked to the note, and stays; so does another member's note that happens to say the same thing. This is Davide's decision (§5).
- **What one member's forget can erase.** Forgetting erases the note's later versions and everything citing it, including other members' corrections and the team's accepted mission, even when the member who wrote the note is now a viewer. Davide accepted this, with the confirmation listing exactly what goes (§5). Every withdrawal must carry the list its preview showed, each decision at its revision, and the preview's proof, signed by the database for that member and note and valid 15 minutes. Anything added or decided in between is refused, not erased; a list without the server's proof is refused.
- **What the preview's proof proves.** That the server issued this list to this member for this note within 15 minutes, not that a person read it (CX-0009). The Studio shows the list and waits for a click; a direct API client can fetch it and send it back.
- **The preview key.** 0018 generates it inside the database (`sophia_secrets.mission_preview_keys`). A backup taken after 0018 must keep it; a restore without it leaves forgetting refused until a key is present, and never lets an erase through.
- **Reviews.** Luis has not reviewed the Studio layout yet. Nobody has checked the Forget confirmation with assistive technology.

## 8. Next action

OP-0004 revision 2 ([CC-0014](../coordination/SMC-M01/SMC-M01-CC-0014.md)) waits on two things only Davide can do: supply the migration-owner connection to Codex's host through a secure local path, and approve the exact batch with a quiet window and a Live ceiling. Codex re-checks the source part (`126cea3`) and every precondition before any effect; on its result, check it against CC-0013 and CC-0014 and record the tuple, schema, `guide.loaded`, `bridge.start` and usage. Meanwhile Luis reviews the Studio layout. When #16 has merged, merge `main`, rerun the checks, and revise CC-0003 for the merged commit (0018 verify-only if OP-0004 ran).

## 9. Mission state

```json
{
  "schema": "sophia.mission-state.v1",
  "mission_id": "SMC-M01",
  "current_goal": "M01-G5",
  "repository": "davidelaverga/Sophia",
  "branch": "claude/upbeat-feynman-d7jskb",
  "base_commit": "c683e6e60ff76004e8a06e71c368b718848b1687",
  "candidate_commit": "the head of PR #18: 126cea3 (code as 2d3549e, plus a test-only fix), then its docs",
  "implementation_pr": 18,
  "coordination_issue": 17,
  "status": {
    "source": "candidate_in_review",
    "merge": "not_requested",
    "release": "requested_not_approved",
    "hosted_verification": "not_run",
    "product_acceptance": "not_requested"
  },
  "owners": {
    "implementation": "Claude Code",
    "operations_support": "Codex",
    "product_authority": "Davide",
    "ui_review": "Luis_when_relevant"
  },
  "completed_goals": ["M01-G1", "M01-G2 (source)", "M01-G3 (source)", "M01-G4 (source)"],
  "test_evidence": [
    "baseline at c683e6e (section 2)",
    "candidate: pnpm check (299 unit, 56 integration with the runtime-service crossing), test:sql pack and repo, test:db 195/195 on C.UTF-8 and on en_US.UTF-8",
    "rollback: 0391bc6 code on 0001-0018, test:sql and test:db 147/147",
    "T17 browser check at 8a4b6a7, and the Forget confirmation at f0ca9f0, 73308de and 2d3549e (section 4)"
  ],
  "outstanding_operations": [
    "SMC-M01-OP-0002 revision 5: answered (CX-0004); findings F1-F3 fixed at 5a03cfd",
    "SMC-M01-OP-0002 revision 6: answered (CX-0005); findings F1-F3 fixed at 421e535 after Davide's product decisions",
    "SMC-M01-OP-0002 revision 7: answered (CX-0006); findings F1-F2 fixed at f0ca9f0",
    "SMC-M01-OP-0002 revision 8: answered (CX-0007); findings F1-F4 fixed at 73308de",
    "SMC-M01-OP-0002 revision 9: answered (CX-0008); finding F1 fixed at 2d3549e",
    "SMC-M01-OP-0002 revision 10: answered (CX-0009), no finding",
    "SMC-M01-OP-0003 revision 1: release batch after merge, drafted, not posted (CC-0003)",
    "SMC-M01-OP-0004 revision 1 at c429869 (CC-0013): preflighted by CX-0010, blocked (no migration-owner connection on Codex's host; no approval); superseded",
    "SMC-M01-OP-0004 revision 2 at 126cea3 (CC-0014): requested; blocked on the same two items; no effect"
  ],
  "unknown_effects": [],
  "hosted_tuple_ref": "SMC-M01-CX-0003 (four Render services at 0391bc6), SMC-M01-CX-0001 (Studio dpl_7sUg, schema); since reported by Codex: API dep-dau0cdmk1f9s739st1mg at 0391bc6, bridge dep-dasrlh17lnhs73agv6f0, schema 0001-0017",
  "migration_ledger_ref": "SMC-M01-CX-0001: 0001-0017 applied, no 0018",
  "approval_refs": [],
  "remaining_allowance_ref": null,
  "file_ownership": ["see section 6"],
  "next_action": "Davide supplies the migration-owner connection securely to Codex's host and approves OP-0004 revision 2 (CC-0014) exactly; then verify Codex's result. Luis reviews the Studio layout; after #16 merges, merge main, rerun the checks and revise CC-0003",
  "checkpoint_ref": "docs/handoffs/SMC-M01-attempt-1.md"
}
```
