# SMC-M01 / OP-0005: living brief and real typed conversation

Human owner: Davide. Executor: Codex local isolated worktree on `codex/living-brief-text`.
Native Codex thread: `01a0ea14-c0ee-7032-8571-1ab017e0dd7f`.
Independent reviewer: existing Claude cloud session `session_01WYqdvEfR8p7mTf1Wbh1b4f`.
Base: PR18 merged as `503e38d1e1d7eb196304f98cfd6e6d353bf1f7ac`; candidate: this PR22 commit.
Authority: direct owner goal; ledger: `docs/progress/SMC-M01-living-brief-decisions.json` D01–D15.

## Implemented candidate

- Conversation is primary; one living project brief has closed, side and expanded views, and mobile return navigation.
- Lifecycle notes are grouped by kind. Add/correct/forget and direction editing use existing canonical handlers.
- Direction saves create a proposal; accepting it still uses the existing explicit team decision path.
- Editors survive close/expand and freeze their displayed base while other canonical saves arrive.
- Quiet update indicator follows the canonical ledger revision, never an optimistic model claim.
- Visible text messages and replies use signed LiveKit participant data and existing Gemini Live input/output.
- Text sends once, under current floor and input epoch; pending/uncertain/stopped replies are explicit.
- Only the sender receives their typed reply. Chat history is bounded to 100 turns in the open browser component.
- Chat is ephemeral: no transcript persistence, local/session storage, model-text logging or voice-transcript broadcast.
- Structured notes remain shared canonical project data, subject to project capture and that person's consent.
- Project capture defaults to automatic; explicit off and each member's unset/declined choice remain authoritative.
- An unset member gets an explicit consent choice in the conversation; capture and consent controls remain in the brief.
- Provider labels, raw cited-input IDs and source hashes are removed from visible legacy brief output; provenance stays internal.
- A09 records text versus voice source attribution outside model arguments; the exact v1.1 guide assets remain unchanged.

## Local evidence (no hosted provider probes)

- Exact Node 24.21.0 / pnpm 11.7.0; frozen installation.
- `pnpm check`: exit 0, format/lint/build/typecheck/contracts, 309 unit tests and 56 integration tests.
- Artifact gate reproduced recorded identities; runtime pin remains dsh 0.1.7-rc.1.
- Darwin development archive SHA256: `02ea91a8dd2a6d354d7dd3e4f4d9aa8e74d3bee877c9dbcfbc9f3c1bf07cdf51`.
- `pnpm test:sql`: 20 migrations and 1 SQL test file passed on disposable PostgreSQL 17.6 / en_US.UTF-8.
- `pnpm test:db`: 197 tests passed; focused existing-0018 rollout regression separately passed.
- Rollout regression proves existing off/consent rows unchanged, implicit-policy revisions move and real API-role reads work.
- Typed HTTP crossing proves consent required, model inputMode ignored, text note/proposal/decision attribution preserved.
- Stale-epoch mutation check fails with the guard removed, then source restored; ordinary gate passed afterwards.
- Actual local Studio / real local API / synthetic project: closed/side/expanded, mobile 390x844, unsaved edit survives reopening.
- A durable added note while editing shows the update notice and preserves the draft; closed button shows Updated.
- Local UI is layout/write verification only: no local LiveKit or Google connection; production text acceptance remains pending.
- Private logs and synthetic development environment are outside committed evidence. Legacy Sophia-Agent untouched.

## Release identities and compatible order (prepared, not deployed)

- Existing production currently runs API/bridge/Studio source `126cea32effce1d514b0119d996cfa2f8a343da1`, schema 0001–0018.
- 0019 SHA256: `54b1e7f03c4fcf6c47abead77c2aec843dc1a3ee000ca4ee8ef23f42e6a912e9`.
- 0020 SHA256: `61641a52fe9c5b66f2ea61d09eb8e2a5d995a2c0396c0d2caba3baf14e873a3e`.
- Recheck source/deployment/schema/project identities, role rights, settings presence and auto-deploy before hosted effects.
- Require a quiet window without active exchanges; migrate 0019, then 0020, then exact reviewed A09 API/bridge/Studio.
- API readiness requires both new functions. New text-origin data requires A09-compatible readers during recovery.
- No old-code-only rollback after 0019 policy change or new text records; recover forward under a matching exact batch.
- Worker and runtime host stay at `0391bc6` (PR16 reconciliation); deploying them from main would drop that fix.
- Preserve append-only migration history, current member consent and explicit project opt-outs. No recording/provider/payer expansion.
- The later owner default-on direction supersedes capture-off cleanup for the consenting owner test project; report this explicitly.

## Exact assets verified locally; deployed setup evidence still required

- Prompt `sophia.mission-guide.system.v1.1`: 9809 bytes, SHA256 `e4fb14d37cab837023fbf1cd5ac567c4c4715ba35c7b6ba8965ea25c93d6c44b`.
- Skill `sophia.team-mission-lifecycle.v1.1`: 14600 bytes, SHA256 `2e746dfb9f7c7a3ad2b77ce2b95093d7a9421630e68b343edced582ea44090d5`.
- Combined: 24410 bytes, SHA256 `7fe8f7291389574d50f075742b226fbbef5fe6f6bed50299cfa573f7fe7a8f6d`.
- Candidate bytes match authored manifest and exact prompt + LF + skill assembly. No asset rewrite.
- Sending text through the existing Live API is documented by [Google's capabilities guide](https://ai.google.dev/gemini-api/docs/live-api/capabilities).

## Cross-platform artifact correction after initial CI

Initial PR22 head 91eb46a failed the Linux archive identity gate: unchanged Linux bundle reproduces 391c89c,
while clean Darwin reproduces 02ea91a. Preserve Linux production identities and lock, record Darwin separately,
and select its archive/lock for local composition. Both platform gates stay strict; no runtime pin upgrade.
New exact candidate/review/CI are required after this correction. Separate clean Darwin checkout also reproduced its recorded archive.
Read-only production metadata at 2026-09-30T00:20Z: schema 0018 exact hash; 0 open/paused exchanges; owner project
policy automatic rev1, one accepted consent, 3 current Sophia paraphrases (2 observations, 1 expectation). No text read.

## Independent CC-0019 findings and correction

- a8368eb passed all CI/Linux artifacts; Claude returned not-pass on F1/F2/F4/F5. F3 was fixed/independently verified.
- F1: actual API member/bridge data grants enabled, guests denied; real-server test uses these actual tokens, recipient-only replies.
- F2: turn-end mode reset, epoch-bound tool origin, cold provider replacement on typed handoff timeout; stale output stays fenced.
- F4: citation tokens/section removed without dropping authored sentences; runtime brief fixture regression.
- F5: opening/closing restores heading/control focus; reopening preserves an unsaved editor and text on mobile.
- Minor fixes: colleagues remain audible, truthful consent copy, chat drafts excluded from storage, member text framed.
- Local gate: 314 unit, 56 integration pass. Focused API/DB token tests: 5 pass. Mutations detect F1/F2/F4/storage regressions.
- Actual browser focus removal reproduces BODY; restored source focuses heading/control/editor. No hosted/provider effects.
- Release API before bridge: older API rejects A09 inputMode. Keep A09 API/bridge/readers compatible after text data exists.

## Final guard follow-up after CC-0020

CC-0020 independently passes a03d42d, including real typed LiveKit CI and 24/24 browser checks.
Its provider-stall note now has a 60-second bridge deadline: fence/replace the stalled connection, report unconfirmed,
never resend, and restore voice; boundary/late-output/recovery regression and mutation pass. Cold reconnect loses
unsaved provider context and re-reads canonical notes; no unqualified resumption is introduced.
Metadata filtering now matches complete machine lines, preserving authored Source/Drafted by sentences; regression/mutation pass.
Final exact candidate must pass CI and independent delta review before the matching production batch.

## Remaining obligations

Revised exact-head CI and Claude review; matching release batch/current lease; migrations and deployments reconciled;
deployed setup/real handler proof; production text chat, canonical save/returning continuity, UI checks and cleanup.
