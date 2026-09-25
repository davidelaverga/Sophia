# Sophia — progress, Luis changes and alignment ledger

**Version:** 1.0 · **Date:** 25 September 2026 · **State:** source-grounded assessment and proposed next assignment; not executed.

**Repository:** `https://github.com/davidelaverga/Sophia`. **Main inspected:** `01d9117bdcf9ec8ee18cd5414aa08ee4f24265a3`. **Cumulative integration head:** `29a570c33feb97a6bc04ea357c84087a47c9b055` (`studio/qol`).

## 1. Decision summary

Preserve the existing runtime repairs and Luis's Studio work. The next product goal is **S1-05A: a real shared Sophia conversation that starts and follows one authorized dsh task inside Luis's room**. It closes the actual API/runtime boundary, reuses A01–A03 and the new room, and adds the first real media integration. It does not restart the architecture, duplicate the room or reopen the harness selection.

The immediate operational risk is the reported Render auto-deploy branch: it still points to a pre-room branch. The immediate implementation gap is equally specific: the merged dsh bridge calls `/v1/runtime/*` endpoints not registered by the cumulative API. The visible room and passing native-loop fixtures therefore do not yet form a working product path.

Claude Code is the implementation lead under its current permissions. Codex is a separately initialized, owner-authorized operations executor for scoped hosted changes. Luis reviews integrations and visual changes. This division is a temporary development workflow, not a claim that Sophia's S1-09/S1-10 executor orchestration already exists.

## 2. What was examined

All 12 visible remote branch heads; 64 unique reachable commit records; all PR descriptions #1–#12; current working-head CI; the key runtime, API, room and access code; the original goals and active v0.4 bindings; all six pages of Luis's PDF; the complete mailbox reference; visual samples spanning both supplied clips.

See [source register](SOURCE_REGISTER.md), [full branch/commit register](evidence/BRANCH_COMMIT_REGISTER.md), and [video review](evidence/VIDEO_REVIEW.md). A metadata/source audit is not full execution verification. No tests, provider calls, deployment or schema changes were run by this review.

The older `Sophia-Agent` repository is not this target. Its unresolved obligations are neither inherited nor declared closed by editing this new repository.

## 3. Repository and deployment truth

| Layer | Observed or reported state | Meaning |
|---|---|---|
| Main | PRs #1 and #2 merged; head `01d9117b` | Reproducible runtime and S1-03 control/supervisor code. Main does not contain Luis's complete API/Studio stack. |
| Cumulative working branch | `studio/qol` at `29a570c3`; 45 commits ahead, zero behind main | Contains main plus all other visible branch heads. It is the correct inspection/base reference for preserving completed work. |
| Review stack | #3–#7 open; #8–#12 draft | Feature code existing and CI passing is not merge approval. Review and integrate in the existing dependency order. |
| CI | Successful runtime-unit, PostgreSQL and local-Supabase-auth jobs at working head | Meaningful execution evidence for those scopes; not actual Gemini audio or production runtime integration. |
| Hosted API/Studio | Luis's PDF reports both at `29a570c3` and migrations 0009–0011 applied | Latest supplied operator report, not independently confirmed here. |
| Auto-deploy | PDF reports Render still tracks `deploy/render-vercel` | A later push can replace the new API with an older one. Operator must inspect and correct this before release-related pushes. |
| Owner settings | LiveKit Cloud, invitation secret, guest auth and optional email configuration still need owner actions in the report | A deployed web shell does not establish a usable hosted media room. |

**Read-time is not event-time.** An older runbook retrieved today does not outweigh a later dated deployment report. Preserve disagreements in the record and ask the operator to resolve them against actual service/deployment/migration receipts.

## 4. Progress against the existing goals

| Goal/work | Assessment | Remaining boundary |
|---|---|---|
| S1-01 | Implemented and merged; reproducible unit and pin checks have recorded evidence | Preserve identity and toolchain while changing the bundle; do not treat runtime identity as product readiness. |
| S1-02 | Substantial implementation in PRs #3/#4/#6/#7: schema, restricted DB access, JWTs, admission, snapshot/SSE, response validation and hosted auth | Integrate the stack; complete actual runtime dispatch and any domain operations needed for the next real task. |
| S1-03 | Merged implementation: public Agent bridge, role guards, journal, leases, cancellation and recovery; two rounds of independent review fixes | PR explicitly leaves live acceptance open. The API half, actual source/context delivery, and real-provider integrated evidence are not established. |
| S1-04 | Studio, viewer-local lenses/drafts, project feed, human room and input-floor implementation exist on stack | Actual two-founder audio and connection to AI remain to be exercised. Contribution composer is not a working conversation yet. |
| S1-04A | New implemented room access goal: guest/member invitations, lobby and sessions | Confirm hosted owner setup; address live removal/audience consequences before project-aware AI speaks. |
| S1-05 | Media bridge and Google connection are not implemented at inspected head | Implement the next bounded voice/work episode; do not start the room or floor again. |
| S1-06–S1-08 | Images, prototypes and broader imports/context remain future implementation | Existing placeholders are not completed capabilities; use minimal current authorized context for this next slice. |
| S1-09–S1-11 | External-resource adapters, peer integration and product supervision are not delivered | This packet's Claude/Codex operations protocol is not a substitute for those product goals. |
| S1-12–S1-14 | Full app co-review, renderers and integrated founder release remain future work | Early hosted deployment does not close all release criteria. |

Do not compute a sprint completion percentage from merged PR count or code volume. Track accepted user episodes and explicit remaining boundaries. Frozen `docs/pack/delivery/planning.json` status is a design baseline; write current progress outside the byte-frozen pack.

## 5. Luis's changes: disposition

### Keep and incorporate

**A01 / migration 0009:** moving `transferInputFloor` and room state into S1-04 is justified by the shell's own acceptance needs. S1-05 must consume this implementation rather than create another floor owner.

**A02 / migration 0010:** room links, email-bound member invitations, guests, lobby and sessions make the room accessible. Preserve the narrow guest routes and separation from project records.

**A03 / migration 0011:** decline versus block is clearer than one ambiguous refusal. Keep the one-minute re-request behavior, undo affordance and explicit unblock. Do not describe an anonymous-identity block as permanently banning a real person across devices/accounts.

**Visual language:** keep Geist/Mono, the restrained dark surface, squared controls, tips/shortcuts, the light, gallery/presentation modes and the persistent mini dock. Avoid a parallel redesign. The light should later make space for the actual artifact.

**QOL and correctness:** keep readable sign-in failures, cross-device codes, invitation context, copy-link fallback, exact CORS, SSE cleanup/recovery and generated response validators. Keep scoped clean-code checks without reformatting runtime-owner areas as an incidental task.

### Change the integration meaning, not the feature

Camera/screen publication to humans is not permission to send those tracks to Google. Room participation, publishing media, speaking to Sophia, reading project context, changing project state and deploying are different permissions.

The animated light's current `listen` mode is derived from LiveKit room status. Connect it to actual exchange/input/playback state before using it as an indicator that Sophia hears someone. A reconnecting room must not claim that a model is listening successfully.

A03 commits a database denial/block and then requests provider removal. Failure of the removal helper is not surfaced as a durable unfinished obligation. Add denial of future tokens immediately plus reliable provider-removal reconciliation and honest pending UI. A 600-second join-token TTL is not a deadline that automatically removes an already connected participant. [R07–R09, E01]

Guest isolation currently protects project-record HTTP access. It does not prevent a guest subscribed to the room from hearing a future project-aware Sophia audio track. Address this before activating the voice bridge. [R07–R08]

## 6. Explicit product decisions proposed for this assignment

These are recommendations recorded for approval with the goal launch, not retroactive statements of what Luis or Davide already accepted.

| Question | Proposed decision | Implementation timing |
|---|---|---|
| Can viewer members speak? | Yes, in the human room. They can address Sophia for authorized read-only conversation. They cannot admit work, accept decisions or control a worker through voice. | Next goal, through a reviewed amendment and role tests. |
| Can guests speak/share? | Retain human-room participation. Guest arrival suspends project-aware Sophia input/output before the guest token is issued. Project-aware exchanges resume only when the room is again member-only and someone explicitly starts one. | Next goal. A separate guest-safe context mode is future work. |
| What is the floor called? | Use “Speak with Sophia” and “Sophia listens to …” only when the real exchange is active. Before that show “Sophia voice not connected”; keep internal floor terms out of routine UI. | Next goal. |
| Holder leaves? | Stop forwarding its track immediately. Reconcile confirmed departure with the current revision/epoch, with a short reconnect grace; no stale leave callback may clear a new holder. Require explicit transfer/resume. | Next goal. |
| Composer? | Preserve local draft. Wire attributed discussion with an actual receipt; explicit work intent is separately admitted. No fake send success, and no silent build from a discussion sentence. | Next goal. |
| Coming pages/lenses? | Keep stable routes and the three-lens structure. Do not emphasize nonfunctional top-level destinations; show a compact availability explanation and a useful way back. Restore destinations when real records exist. | Small next-goal integration, not a redesign. |
| Invite-only? | Founder pilot remains invite-only. Existing owners provision member accounts; project invitations attach approved users. Do not enable general public account/project signup as a side effect. Anonymous guest mode is separately owner-enabled with its narrow scope. | Operator configuration; record actual chosen Auth settings. |
| Cross-device project list? | Add an authenticated membership-scoped list in a small S1-04 follow-up; per-device recents can remain a cache. It is not a blocker for the first voice/work episode. | Named follow-up after next goal. |
| Session/calendar invitations? | Keep optional, explicit session binding. Do not start provider listening or recording because a scheduled session time arrived. | Preserve implementation; widen calendar behavior later. |

The guest policy intentionally distinguishes consent to a human call from access to stored project knowledge. It does not prevent people from choosing what they say in front of their guests. Its cost is one explicit pause/resume boundary for project-aware AI, rather than an accidental disclosure path.

## 7. Source-level gaps that determine the next goal

### 7.1 Production runtime control has two unmatched halves

`packages/dsh-bundle/src/transport.ts` expects `/v1/runtime/hello`, `/commands`, `/receipts`, `/observations` and `/ready`. `apps/api/src/app.ts` does not register them. The bridge's fixture service is useful proof of native-loop mechanics, not a production API.

Implement the server side and dispatch adapter using the existing protocol shapes, then make those schemas canonical. Validate both directions. Do not build another agent loop or rename the entire native transport to hide the missing boundary.

### 7.2 Durable admission is not dispatch

Existing SQL can admit selected control commands and publish events. It does not itself start a native job. Connect an authenticated, current assignment to the runtime, recheck authority at dispatch, and record both delivery and incorporation/settlement.

Create one explicit bounded task admission operation using the existing goal/attempt/binding/job records. Do not use a permanently seeded test goal or raw SQL in the release demonstration.

### 7.3 The first result must be real, but need not be the whole future creative platform

Use a **draft implementation brief** from current accepted project facts and two explicitly shared user inputs. Run it on the real configured dsh model, retain the Markdown result, and show it while the conversation continues. It is drafting, not web research or a complete PM implementation.

No image/prototype tools are exposed until those adapters exist. This is a genuine partial S1-05 episode, with remaining original criteria retained—not a declaration that all image/prototype work is done.

### 7.4 Presence and recording must follow actual behavior

Input forwarding, provider generation, actual playback, background work and connection recovery have separate state. Model text or a room connection cannot prove another state. The new media bridge must publish those events to Luis's existing light and controls.

Keep project-aware input member-scoped, bind speech actions to the original authenticated speaker/epoch, and suppress stale output after a transfer/Stop. End exchange does not cancel independently admitted work.

## 8. How to continue

**First, establish one reviewed baseline.** Branch from the cumulative head (or a newer reconciled descendant), preserve all source fixes, and coordinate with Luis. Review #3–#12 in dependency order. Do not blindly squash/reset the stack, mark draft work approved, or push the old deploy branch.

**Second, build the next integrated episode.** See [S1-05A spec](S1-05A_GOAL_SPEC.md). The backend/runtime crossing and basic media work can be developed in parallel after their contract is agreed. Test the actual crossing before claiming product acceptance.

**Third, use Codex for operations only when needed.** Start with read-only configuration/deployment/schema inventory. Claude prepares tested source and an exact operation request; Codex checks owner authority and executes only that request's approved effects. The app's external executor platform is not required just to coordinate its own developers. See [protocol](CLAUDE_CODEX_PROTOCOL.md).

**Fourth, continue the existing release graph.** Once this episode works, S1-06 image work and S1-07 prototype work attach to the actual room/job path. S1-09/S1-10 attach the three real engineering resources. S1-11 adds richer leadership/review. S1-12 uses the same selected-target/steering contracts. Do not let further lobby polish displace those outcomes.

## 9. What this packet changes

| Deliverable | Purpose | Status |
|---|---|---|
| This ledger | Progress, evidence boundaries, Luis dispositions and the recommended next step | Created; not project-state authority by itself |
| GOAL_SPEC_AMENDMENTS.md | Original-goal crosswalk and explicit changes without rewriting the frozen pack | Created; adoption proposed |
| S1-05A_GOAL_SPEC.md | One bounded integrated goal and acceptance criteria | Created; not started |
| CLAUDE_CODEX_PROTOCOL.md | Practical current-development delegation and operator receipts | Created; no automated bus installed |
| CLAUDE_CODE_LAUNCH.md | Implementation prompt with restricted operations | Ready to paste |
| CODEX_OPERATOR_LAUNCH.md | Separate operator prompt, bounded authority and reconciliation | Ready to paste |
| Evidence registers | All inspected refs/commit summaries and visual-source coverage | Created |

## 10. Unknowns and update rules

The actual hosted deployment tuple, migration checksums, Auth configuration, LiveKit credentials/readiness and current auto-deploy setting require authorized inspection. Available provider keys, a paid-test allowance, and the execution host's actual identity/capacity are not established by this audit.

On each implementation handoff, update current refs, exact commands and results, deployment receipts, remaining adverse cases and next action. Do not erase the original report when new evidence supersedes it. Mark which claim changed and why.

No claim of full Sprint 1 completion, real multi-person AI audio, production S1-03 readiness or installed peer orchestration is made here.
