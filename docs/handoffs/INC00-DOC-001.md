# Implementation-session handoff — INC00-DOC-001 (documentation installation)

This record follows [the session handoff](../pack/templates/SESSION_HANDOFF.md). It covers two attempts at one goal.
The first attempt is the original installation, written by the Codex programme coordinator. The second is a
documentation-only repair of this record by a Claude Code session, made because PR503's automatic review asked for it.
The second attempt does not re-author, re-run or re-review the first. Each fact below says where it comes from:

- **own check (attempt 2)**: the Claude repair session ran it or read it itself, in its own container or through its
  GitHub access;
- **supplied record**: the coordinator or the independent reviewer supplied it. The sources are:
  - the repair's facts file, INC00-DOC-002-FACTS.json (SHA256
    `1eb38d14f3080d2aabc6a06bb0bb656c9441efe3bc59b2c4ca3fd3dd30a25741`);
  - the r2 repair assignment and the independent review INC00-DOC-002-r1-SOURCE-PRE-PUSH-001 (SHA256
    `42dad58d3aaed0275fa066c3d6958367a9edfba88c95b00c8f7785f6fd223200`);
  - the r3 facts file, INC00-DOC-002-r3-FACTS.json (SHA256
    `dabad5bd34a7c97bde45f34303b2a9c3d68ff903683b253cb07870e6d1b7bbb1`, timestamp 2026-11-09T20:38:52Z);
  - the final review INC00-DOC-002-r2-SOURCE-FINAL-001 (SHA256
    `9677f09699b1acd941c1bece2773ab6f15f71c3447b0398e8387b94fd5cee756`);
  - the r3 security addendum (SHA256 `69dff2cf287abe67e4ddb93f9f64ccf8e705ccd8168d1668f4bad85c997eaae1`) and the
    independent assessment INC00-RELEASE-TRUST-SECURITY-ASSESSMENT-001 (2026-11-09T20:51:20Z, SHA256
    `17665c62d6b390ce016686b41c39171759bd77e92cd53f53501beca483ee3998`).

  The repair session cannot read the coordinator's host and did not run or read those records.

## Later attempts (forward bridge)

This record covers attempts 1 and 2. Later INC-00 documentation attempts continue in
[INC00-DOC-003](INC00-DOC-003.md). The identities after this record's own snapshot:

- **INC00-DOC-002 r4.** `422e9ba1f51fcde0c7367aff91959eeace9d04fc`, tree `e9ff5278ac1e0e1cd43d7c584c6817ad8416a9cd`,
  parent `4cb4bbe5…`. Same four paths. The same independent reviewer accepted the whole 46-path diff before push
  (review record SHA256 `3ebce8180d53e08ab4024a39f199418c4364c00d30d7f78b354b07a03330de88`), and the coordinator
  published it to PR503 (supplied). Its automatic review then raised P1 `discussion_r4518692235` on
  `docs/SOURCE_MAP.md`.
- **INC00-DOC-003 r1.** The backend author's companion, `f6175c83a2154716d1a548131337159559a1d093`, tree
  `d78e54cabba476aa379cf30dd41ac875feaa220b`, parent `422e9ba`. It changes only `docs/SOURCE_MAP.md` and is published.
- **INC00-DOC-003 r2.** The documentation author's handoff and integrity-navigation repair: a local child of
  `f6175c83`, pending review.

The "Current state", "Remaining obligations" and "Next bounded action" sections below are the 2026-11-09 snapshot of
attempt 2. For anything later, use INC00-DOC-003 and the [mission ledger](../progress/SOPHIA-INC-2026-11.md)'s dated
INC-00 continuation.

## Attempt 1 — original installation (coordinator)

Goal and attempt: INC-00 documentation installation, requirement INC00-R02 and case AC-00-02 of
[the INC-00 module](../execution/2026-11-08-incremental/modules/INC-00_BASELINE_AND_INSTALLATION.md); INC00-DOC-001,
attempt 1. Programme SOPHIA-INC-2026-11, issue https://github.com/davidelaverga/Sophia/issues/502.
Human owner / executor resource: Davide / Codex programme coordinator `01a1bd48-df51-7692-b30c-9e20f6eb4c81` working
in `/root` on the coordinator's host. The coordinator is the documentation author. It is not a Claude product author,
and no Claude author is claimed for this installation. The Git commit carries the owner's local Git identity (author
name Davide Laverga). The independent source reviewer and later in-app verifier is a separate agent,
`/root/independent_review_app`.
Native session: the coordinator's thread ID is above. Any further native session identity is unknown.
Starting worktree/commit: an isolated INC-00 worktree on the coordinator's host,
`/Users/davidelaverga/Documents/Codex/2026-11-08/sophia-inc-00` (supplied record, added in r2), branch
`docs/inc-00-install-20261108`, base main `953e5dc3d4c88e491517f3f0d0eaa18216fea98f`.
Ending commit/tree and changed files: commit `afe68b679722e28471dcdf6222d519759cd78c49`, tree
`094bdf2de518e84cac2e421a980e424ccebc2cb0`, single parent `953e5dc3d4c88e491517f3f0d0eaa18216fea98f`. Exactly 45
paths change: `.gitattributes`, `AGENTS.md`, `docs/README.md`, `docs/execution/README.md`, the 37 pack files under
`docs/execution/2026-11-08-incremental/`, the [baseline](../coordination/SOPHIA-INC-2026-11/BASELINE.md), the
[contract map](../coordination/SOPHIA-INC-2026-11/CONTRACT_MAP.md), the
[mission ledger](../progress/SOPHIA-INC-2026-11.md) and this record. This is the reviewed, CI-covered candidate. It was
PR503's head (https://github.com/davidelaverga/Sophia/pull/503) until the repair below is published.

To recover the reviewed candidate:

```bash
git fetch origin afe68b679722e28471dcdf6222d519759cd78c49
```

```bash
git log -1 --format='%H %T %P' afe68b679722e28471dcdf6222d519759cd78c49
```

```bash
git diff --name-only 953e5dc3d4c88e491517f3f0d0eaa18216fea98f afe68b679722e28471dcdf6222d519759cd78c49
```

The second command must print the commit, tree and parent above. The third must list the 45 paths.

### Outcome

The November pack is installed as documentation only. The pack's [entry](../execution/2026-11-08-incremental/README.md)
is reachable from [AGENTS.md](../../AGENTS.md), [docs/README.md](../README.md) and
[the execution index](../execution/README.md). A scoped rule in [.gitattributes](../../.gitattributes) keeps the pack's
bytes exact, including the CRLF in [cases.csv](../execution/2026-11-08-incremental/acceptance/cases.csv). Earlier frozen
packs and all product, runtime, config, schema and dependency files are unchanged. The installation adds no
user-visible product behavior.

Acceptance at the time of installation: the issued, frozen
[cases.csv](../execution/2026-11-08-incremental/acceptance/cases.csv) lists 134 cases, all `not_run`. That file is
immutable source history and stays that way; it is not the current status register. The current status is kept in an
owner-local register outside Git (see "Current state" below). The installation itself carries no product, native,
provider, API, voice, design, account-enrollment or deployed-app acceptance. AC-00-02 (plan installation) waits for the
actual reviewed integration.

### Evidence

Validation of the source (supplied record; two of these figures are also own checks, marked below):

- **Pack bytes.** All 37 committed pack files are byte-identical to the original ZIP. All 36 content entries in
  [MANIFEST.json](../execution/2026-11-08-incremental/MANIFEST.json) validate.
  - *Own check (attempt 2):* at `afe68b6` the pack directory has 37 tracked files. All 36 manifest entries match their
    recorded SHA256.
- **Acceptance cases (issued, frozen CSV).** The issued cases.csv has 134 unique cases, all `not_run`. These are the
  baseline statuses as issued, not the current register.
  - *Own check (attempt 2):* the frozen cases.csv at `afe68b6` has 134 rows, 134 unique `case_id`s, all `not_run`.
- **Links and frozen history.** 147 local links were checked and none is missing. The diff of the earlier frozen
  packs is empty.
  - *Own check (attempt 2):* `git diff 953e5dc..afe68b6 -- docs/pack docs/execution/2026-10-01-unified` is empty.
    The 45-path list matches the candidate record.
- **Whitespace.** The authored-path whitespace check passed. The raw `git diff --check` exited 2. All of its findings
  are original frozen bytes, kept on purpose: Markdown hard-break spaces, the CRLF in the CSV and one blank line at the
  end of a file.
- **Validation timing.** The validation record (2026-11-08T22:38:57Z) reports 44 changed files, because it ran before
  the final `.gitattributes` change was added. It does not measure the final 45-file commit. The 45-file figure comes
  from the separate candidate record (2026-11-08T22:40:01Z) for `afe68b6` / `094bdf2`.
- **Validators not used.** The November pack has no executable validator. The October validator is specific to its own
  pack and writes generated output, so it was not run on this pack.

Local `pnpm check` on `afe68b6` (supplied record, 2026-11-08T22:47:31Z, Node 24.21.0 / pnpm 11.7.0):

- Exit code 0.
- Unit tests: 4,076 passed, 70 skipped, 0 failed.
- Integration tests: 138 passed, 2 skipped, 0 failed.
- Full log SHA256 `b785909b7fdc1a56af26987df27821d64a64295cda948e03c0b1cd48b923da82`, 535,813 bytes.

The full log stays outside Git.

CI on `afe68b6` (own check through GitHub, attempt 2):

- **Operative run, passed.** https://github.com/davidelaverga/Sophia/actions/runs/42531667967 (pull_request event)
  concluded `success`. All 9 jobs succeeded: runtime-unit (`pnpm check`), SQL/persistence/API on PostgreSQL 16, Live
  auth on local Supabase, the LiveKit media bridge, the confined PDF renderer, the three Chromium room shards, and the
  room aggregate.
- **Superseded run, not a pass.** https://github.com/davidelaverga/Sophia/actions/runs/42531633412 (push event)
  concluded `cancelled`. Branch concurrency cancelled 8 jobs. The always-run room aggregate job failed. The supplied
  record says the aggregate reported `PARTS=cancelled`; this session did not read that log line.

Reviews of `afe68b6`:

- **Independent review (supplied record).** The independent pre-push review accepted `afe68b6` / `094bdf2`. The
  independent final source review also accepted `afe68b6`.
- **Automatic code review.** The first automatic review was clean, but it is superseded. After the PR moved from draft
  to ready, the latest automatic review of `afe68b6` added P2 finding
  https://github.com/davidelaverga/Sophia/pull/503#discussion_r4516450352 at 2026-11-09T18:33:06Z. The finding asks
  this record to give the session-handoff fields, the exact reviewed tree, the actual commands and results, and
  retained evidence that can be found. It is unresolved. *Own check (attempt 2):* the thread exists and is unresolved.
- **Automatic security review (supplied record).** Summary: https://github.com/davidelaverga/Sophia/pull/503#issuecomment-6728184519.
  It completed with every finding boolean `null` and `mergeGateEnabled: false`. A `null` boolean does not mean "no
  findings", and this record draws no such conclusion.

Retained evidence on the coordinator's host (supplied record). These paths and hashes locate the files exactly. The
files are not in Git, and the repair session has not read them:

| Record | Owner-local path (under `/Users/davidelaverga/.codex/operator-journal/SOPHIA-INC-2026-11/`) | SHA256 |
|---|---|---|
| Final candidate (45 files, 2026-11-08T22:40:01Z) | `INC00-DOC-001-candidate.json` | `d84f9d8c73aab00b0ffc00649b250941d1d951135bde338bc4a46c729c30addd` |
| Validation (44 files, before `.gitattributes`, 22:38:57Z) | `INC00-DOC-001-validation.json` | `8d5f60e7c0eeede2c56d09213a518a38f6d165ee180fef7907fc96d477133b87` |
| `pnpm check` result (22:47:31Z) | `INC00-DOC-001-check-result.json` | `fc9ff0c7f443246e21b5f136c2232a494ebaf512a98ab0246335f80b8a86e3b9` |
| `pnpm check` raw log | `INC00-DOC-001-pnpm-check.log` | `b785909b7fdc1a56af26987df27821d64a64295cda948e03c0b1cd48b923da82` |
| Raw whitespace log (named in the candidate record; no hash supplied) | `INC00-DOC-001-frozen-whitespace.log` | unknown |
| Independent pre-push review | `review/INC00-DOC-001-SOURCE-PRE-PUSH-001.json` | `1486259cebc9d4a4903e35ef98831302fb3dfbde18e00978fe1021eb619804ff` |
| Independent final source review | `review/INC00-DOC-001-SOURCE-FINAL-001.json` | `b3e03646882ae0cd2ca5d834001efcd26d0c51657feba0d630f29304731fc300` |
| CI watch | `review/INC00-DOC-001-CI-WATCH-001.json` | `b38b8ee1500f8c64c4f57cec090e7dacae28d5be49f71bb715e9f263c3620dc9` |
| Final metadata | `review/INC00-DOC-001-FINAL-METADATA-001.json` | `045305d135420acbcf3fc7e0f64851cf67bc79de8d45ccea9136cc9184725003` |

Anyone can read the remote records: the PR, the review thread, the security-review summary and both CI runs above.

### Decisions and changes

- **Kept unchanged.** The pack is installed byte for byte, and only the repository-level navigation points to it.
  Earlier frozen packs and every product, runtime, config, schema and dependency file are unchanged. The ownership of
  PR499 and PR501 is untouched.
- **Never dispatched.** INC00-CC-001 was only a prepared prompt. It was never dispatched and owns no writes.
- **No new authority.** The installation grants no new account, payer, spending, merge or deployment authority, and it
  restarts no existing work.

## Attempt 2 — record repair (INC00-DOC-002, Claude Code)

Goal and attempt: INC00-DOC-001 documentation installation, attempt 2: repair INC00-DOC-002. It answers P2
`discussion_r4516450352`. The coordinator assigned it (prompt SHA256
`72c8d33fe850fc53450e5e334566a196d4fb579791fe2554e738f41d810960fb`). For r1 and r2, only this file was writable.

For r3 (prompt SHA256 `a09d68a256ad7bbc0a27e6cb74f2a0bec6eba3678ba9d62f306c3138c30675de`), the coordinator extended
the writable scope to exactly two files: this record and the [mission ledger](../progress/SOPHIA-INC-2026-11.md). It
delegated its original ledger writer slot to fix automatic P1 `discussion_r4517641847` (stale ledger) and P2
`discussion_r4517641852` (an unusable acceptance-update instruction).

The security addendum then added exactly two more paths, after a fresh no-overlap check, to answer security P2
`discussion_r4517682095`:

- the new `docs/coordination/SOPHIA-INC-2026-11/RELEASE_TRUST_AMENDMENT.md`;
- `docs/execution/README.md`, for active-hold navigation only.

The r3 scope is therefore four exact paths.
Human owner / executor resource: Davide / Claude Code cloud session (claude.ai/code, Auto mode), coordinated by Codex
`01a1bd48-df51-7692-b30c-9e20f6eb4c81`.
Native session: `session_01FGXfrGdEeRRkWqHnZfiF8C`, environment `env_018aAg5fvhJRzAgkZCp4fyYb`, as `get_session`
returned them.
Starting worktree/commit: container worktree `/home/user/Sophia`, session branch `claude/upbeat-feynman-xuqimy`. The
branch started at `953e5dc`, matching `origin/main`, with a clean tree. It was fast-forwarded to `afe68b6`, which was
fetched from origin and checked against tree `094bdf2` and parent `953e5dc`. `refs/pull/503/head` and
`docs/inc-00-install-20261108` both pointed to `afe68b6`, so the target was current.
Ending commit/tree and changed files: the final repair, r4, is a local commit whose single parent is the published r2,
`4cb4bbe55144aab92f09b7c96f55363ccbb59731`. It changes exactly four paths:

- `docs/handoffs/INC00-DOC-001.md`;
- `docs/progress/SOPHIA-INC-2026-11.md`;
- `docs/coordination/SOPHIA-INC-2026-11/RELEASE_TRUST_AMENDMENT.md` (new);
- `docs/execution/README.md`.

A commit cannot contain its own hash. The r4 export manifest (outside Git) records
the actual head and tree, and the PR head records them once r4 is published. Recovery commands are in the next
subsection.

Revisions of this repair:

- **r1** was commit `e468bedfed4d67798d27b429481531fde8f80c03` (tree `02a57f2eaac691c67da387458a28397d6f443936`). It
  changed only this file. It was never published. Its independent review, INC00-DOC-002-r1-SOURCE-PRE-PUSH-001,
  returned `needs_revision` for one P2: r1 confused the frozen CSV's 134 `not_run` rows with the current register.
- **r2** replaced r1 by amendment, with the same parent `afe68b6`. It is commit
  `4cb4bbe55144aab92f09b7c96f55363ccbb59731`, tree `490ad4dcffb21e6e602d807cf10efe4bf1d00c6c`, and changes only this
  file.
  - *Pre-push review.* INC00-DOC-002-r2-SOURCE-PRE-PUSH-001 accepted r2 (review record SHA256 `a29731e8…`). That
    acceptance is history.
  - *Published.* The coordinator published r2 as PR503's head. *Own check:* `git ls-remote` showed
    `refs/pull/503/head` and `docs/inc-00-install-20261108` both at `4cb4bbe` at 2026-11-09T20:42Z.
  - *Final review.* The automatic code review of `4cb4bbe` then raised the ledger P1 and P2. The final review
    INC00-DOC-002-r2-SOURCE-FINAL-001 is `needs_revision` (supplied).
- **r3** was a new, unpublished child commit of `4cb4bbe`, in two versions:
  - `ff5e884745d68f655d6f6e8b20298cc71b13d86f`, which changed the two files: this record and the ledger;
  - after the security addendum, amended to `4b555b1e12f38ffc0bd7e0ff52a07303b8a503a9` (tree
    `94c71131e4cd3eaa71764a0ff3e7026f63bdf24d`), which changed the four paths. Its review,
    INC00-DOC-002-r3-security-SOURCE-PRE-PUSH-001 (review record SHA256 `27bfc9f7…`), returned `needs_revision` for
    one P2: the ledger called the backend's write-assignment digest `500ed3c2…` its Git source base.
- **r4** amends that unpublished r3 again, with the same parent `4cb4bbe`. It fixes that identity type and three small
  wording notes. Published commits `4cb4bbe` and `afe68b6` are not amended or rewritten. The r1, r2, r3 and
  r3-security exports are kept unchanged outside Git.

### Recovering the repair commit

Once r3 is published as PR503's head, a later session can locate each repair commit from the reviewed original:

```bash
git fetch origin pull/503/head
```

```bash
git log --format='%H %T %P' afe68b679722e28471dcdf6222d519759cd78c49..FETCH_HEAD -- docs/handoffs/INC00-DOC-001.md
```

```bash
git diff --name-only afe68b679722e28471dcdf6222d519759cd78c49 <that-commit>
```

The `git log` command lists r2 and r4. Use the `git diff` command once for each, as noted below, and check:

- **r2 (`4cb4bbe`).** Its single parent is `afe68b6…`, and `git diff --name-only afe68b6 4cb4bbe` shows only this
  file.
- **r4.** Its single parent is `4cb4bbe…`, and `git diff --name-only 4cb4bbe <r4>` shows exactly the four paths
  listed above.
- **r4's file blobs.** `git rev-parse <r4>:<path>` for each of the four paths equals the blob ID in the r4 export
  manifest.
- **The frozen pack.** `git rev-parse <r4>:docs/execution/2026-11-08-incremental` still equals the imported pack tree
  `ef46e7f45a0221ce81b421b2d19a80e801fdf589`.

`afe68b6` is the original reviewed install, and `4cb4bbe` is the published r2. Neither is the head after r4 is
published.

### Outcome

This record now gives the template fields for both attempts, the exact reviewed candidate, the commands and results
with where each came from, and evidence that can be located. In r1 and r2 the repair changed only this file. The
later four-path scope is described below. No revision changes product behavior. r2 also separates the issued, frozen acceptance CSV from the current register.

r3 makes the [mission ledger](../progress/SOPHIA-INC-2026-11.md) a real, timestamped coordination snapshot. It records
the actual actors, scopes, candidates, reviews, design hold, controls and next bounded owners, and keeps the 2026-11-08
observations as dated history. It also removes the unusable instruction to update `acceptance/cases.csv` and replaces it
with the canonical owner-local register, its bound snapshot, and the locate, verify and update procedure.

r3 also adds the active, restrictive
[release-trust amendment](../coordination/SOPHIA-INC-2026-11/RELEASE_TRUST_AMENDMENT.md) and links it prominently
from [the installation record](../execution/README.md).

- **What it suspends.** The pack's permission for the source-exposed review/test thread to carry out credentialed
  deployment, configuration, secret, migration or release-privilege operations. The superseded passages are prompt
  `03` lines 5 and 25, `MISSION.md` line 36, `DELIVERY_AND_REVIEW.md` lines 17, 21 and 70,
  `DEPLOYMENT_AND_VERIFICATION.md` line 3 and AC-GOV-17, `INC-02` lines 12 and 77, and the roadmap's tester role.
- **What stays.** The same single reviewer keeps both source review and later in-app verification.
- **How a release happens.** Through DEP-R01's already-authorized owner or operator, or a fixed-scope executor whose
  restrictions are enforced outside the model and demonstrated.
- **What it does not prove.** It records the boundary as a procedural hold with **unqualified** enforcement. It is
  not evidence of technical isolation.
- **The pack.** All 37 pack files stay byte-identical.

r4 keeps all of r3's content and corrects it in three ways:

- **Identity type.** The ledger now records the backend's write assignment by its document digest
  (`500ed3c2…`, an assignment digest) and its actual Git source base (`953e5dc3…`) separately. It also states
  explicitly the type of each other identity: Git commit or tree, assignment digest, review record digest, source-diff
  digest, session ID.
- **Scope wording.** The ledger's INC-00 owner cell now names the current four-path scope.
- **Test carve-out.** The amendment's §3 keeps already-authorized isolated, fake or disposable source setup and local
  test-only migrations, credentials, tests and cleanup outside the release hold. It grants nothing new and does not
  allow production credentials or targets in tests.

r4 is **not** independently reviewed, pushed, CI-covered or accepted. Those gates are listed below.

### Evidence

Own checks by the repair session:

- `git fetch` of `afe68b6`, then `git log -1` to read its commit, tree and parent, and `git ls-remote` for the PR head
  and the branch head.
- `git diff --name-only` (45 paths, matching the candidate record) and the frozen-pack `git diff` (empty).
- A count of the pack files (37).
- A Python check of the 36 manifest SHA256 entries and of the 134 rows and statuses in the frozen cases.csv.
- GitHub reads of PR503 (open, not a draft, not merged, head `afe68b6`, review requested from EdX2C), its review thread,
  and the job lists of both CI runs.
- For the repaired file: every relative link checked against the tree, and `git diff --check` on this file only.
- The whole diff was read against the template headings.

Supplied records used in r2 (not read by this session): the current register counts and its SHA256, which the
independent reviewer read and reconciled, and the original coordinator worktree path.

Own checks for r3 (2026-11-09, 20:42–20:44Z):

- **Inputs.** The SHA256 of the r3 prompt, the r3 facts, the r2 final review and the read-only register snapshot
  attachment all match the supplied values.
- **Remote state.** `git ls-remote` showed main at `953e5dc` and PR503 and its branch at `4cb4bbe`. A fetch of
  `refs/pull/503/head` gave tree `490ad4d`.
- **Register snapshot.** A Python parse of the attachment (SHA256 `c5d3c09f…`) gave 134 rows, 134 unique ids, 3 `passed`
  (AC-00-01, AC-00-03, AC-GOV-03, each bound to `afe68b6`) and 131 `not_run`. It differs from the issued CSV only in
  those three rows' status, evidence, verification, observer and notes columns.
- **PR503 review threads.** There are four, all unresolved:
  - the outdated handoff P2 `discussion_r4516450352`;
  - ledger P1 `discussion_r4517641847`;
  - ledger P2 `discussion_r4517641852`;
  - security advisory P2 `discussion_r4517682095`, Medium, on a frozen pack prompt, posted at 20:36:04Z.
- **PR503 review summary.** Code and security reviews completed on `4cb4bbe`; `mergeGateEnabled: false`.
- **PR503 CI.** Run 42693446183 was in progress: 4 jobs succeeded and 4 were running, with no aggregate job yet.
- **Edited files.** Every relative link checked, `git diff --check` on the edited files, and the whole diff read.
- **Security addendum (about 20:58Z).**
  - The addendum and assessment SHA256s match.
  - Before writing the amendment, this session read the exact frozen passages it supersedes: prompt `03` L5, L7 and
    L25; `MISSION.md` L36; `DELIVERY_AND_REVIEW.md` L17, L21 and L70; `DEPLOYMENT_AND_VERIFICATION.md` L3, L11 (DEP-R01)
    and L108; `INC-02` L12 and L77; roadmap L34, L380 and L673. It found the additional sibling passages by `grep`.
  - After the edit, `git diff` from `afe68b6` to r3 is empty for `docs/execution/2026-11-08-incremental`. The pack tree
    is still `ef46e7f…`, and all 36 manifest entries still match.
- **r4 corrections (about 21:18Z).**
  - The r4 assignment SHA256 (`c267276d…`) and the r3-security review record SHA256 (`27bfc9f7…`) match.
  - A grep over the four files found every place a hash or ID is labelled. Each is now named as a Git commit or tree,
    an assignment digest, a review record digest, a source-diff digest or a session ID.
  - This session did not read the backend write assignment. Its digest-versus-base distinction comes from the
    independent reviewer's read of that assignment (supplied).

The attachment stays outside Git, and neither CSV was edited.

Not run: `pnpm check` and any package command. This container has Node 22.23.4, not the required 24.21.0, so it would
not give valid results. The parent's `pnpm check` and CI results cover `afe68b6`. They do not prove the repair head;
normal CI and review still apply once it is published.

### Decisions and changes

- **Repaired.** This record was rewritten in the handoff template and plain prose. The coordinator's authorship and the
  history of the original candidate are kept, and attempt 2 is identified as a separate, later Claude attempt.
- **Ledger (r3 only).** The mission ledger was rewritten within the delegated r3 scope. Its 2026-11-08 content is kept
  as dated history.
- **Release-trust amendment (r3 only).** The amendment is new and sits outside the pack. `docs/execution/README.md`
  gains only an active-hold notice and a link. The amendment grants nothing, adds no role and changes no acceptance
  case.
- **Untouched.** All 37 pack files and both acceptance CSVs, `AGENTS.md`, `docs/README.md`, maps, other handoffs,
  PR499 and PR501 files, product, runtime, config, hooks and CI. The live backend (INC01-CC-002), routing (INC03-CC-001) and designer (INC01-DES-001) scopes are also
  untouched.
- **No new authorization.** The repair needed no new authorization and has no wider impact.

## Current state (coordinator facts at 2026-11-09T20:38:52Z, supplied; GitHub reads at 20:42–20:44Z, own check)

The [mission ledger](../progress/SOPHIA-INC-2026-11.md) carries the full timestamped coordination snapshot. The
summary:

- **Lifted and resolved.** The user's earlier global stop has been lifted. The Claude Code web delivery authors are
  signed in. Two entries in the 2026-11-08 ledger are now historical: Claude sign-in pending, and INC00-CC-001 not
  dispatched.
- **Not qualified.** The product's native, auth and billing routes are not qualified. No native route, API
  contribution, account, payer or app case is qualified by this documentation.
- **Product candidates.** The backend candidate (INC01-CC-002) and the routing candidate (INC03-CC-001) are real, local
  and unpushed, and both are being repaired. The designer's exact r2 source (INC01-DES-001) is accepted at source level
  and awaits Davide's decision on a significant UI change.
- **Acceptance register (current).** The current status register is owner-local and outside Git:
  `/Users/davidelaverga/.codex/operator-journal/SOPHIA-INC-2026-11/acceptance.csv` (SHA256
  `c5d3c09fdecb4e48f29e23994813eb97cd588bd3c8eb26b180d87f4734684e8f`).
  - *Who read this hash.* The independent reviewer read it for INC00-DOC-002-r1-SOURCE-PRE-PUSH-001. The coordinator
    supplied the same hash at 2026-11-09T20:38:52Z as a read-only snapshot, which this session parsed itself.
  - *How to locate, verify and update it.* See the ledger's "Acceptance register" section. A session that cannot read
    the owner-local path must ask the coordinator for a fresh SHA-bound snapshot. It must never create a new register
    or edit the issued CSV.

  Of the register's 134 cases, three passed:
  - AC-00-01 (current source and work ownership);
  - AC-00-03 (contract mapping);
  - AC-GOV-03 (no push without an independent whole-diff review).

  The other 131 cases are `not_run`. These three are historical passes for source, preparation and process only,
  covering the original `afe68b6` source, ownership, contract map and pre-push process. None is product, native,
  provider, API, voice, deployed-app or full-mission acceptance. AC-00-02 is still pending the actual reviewed
  integration. This record neither edits either CSV nor marks any new pass.
- **Acceptance scope.** Source and process acceptance is separate from the required real product, native and app
  cases. This record does not claim any API, native or voice work passed.
- **No deployment needed.** A documentation-only installation, and this repair, need no runtime deployment.
- **Release trust.** Credentialed release from any source-exposed context is **on hold** under the
  [release-trust amendment](../coordination/SOPHIA-INC-2026-11/RELEASE_TRUST_AMENDMENT.md). Operational enforcement and
  isolation are **unqualified**.
  - *Assessment.* The independent assessment (supplied) found a valid future trust-boundary concern. It found no
    credential exposure or exploit, and no technical enforcement either.
  - *Other work.* Unrelated source work continues.
- **Observer r3 (supplied, about 20:58Z).** `d009d1ede2ca9e13ee24bcaeaff0d7a7e17be6fb`, tree
  `805b1c305a50dfabcea7784c4db0a22425fe11c0`. It is exported, and the coordinator verified it. It is not reviewed and
  not published. Backend r2 is still in final verification. Davide has not answered the UI question, so the designer
  stays stopped.

## Remaining obligations

- **This repair.** r4 awaits the same independent **full 46-path base-to-head** pre-push review by
  `/root/independent_review_app`. After that come central publication to PR503, required CI on the new head, and
  automatic code and security review of the new head. All four PR503 threads stay open until a reviewer decides on them:
  - the outdated handoff P2 `discussion_r4516450352`, whose substance r2 addressed;
  - ledger P1 `discussion_r4517641847` and ledger P2 `discussion_r4517641852`, which r3 addresses;
  - security advisory `discussion_r4517682095`, which r3's amendment answers in policy.
- **Release-trust hold.** The amendment is a policy and procedure answer only. Two things remain:
  - *Thread.* `discussion_r4517682095` is resolved by the owner and by automatic review of the current head, not by this
    record.
  - *Before any future release.* The coordinator prepares the exact envelope (amendment §4). It then names the existing
    authorized owner or operator operation, or a fixed-scope executor whose restrictions are demonstrated outside the
    model with real rejection evidence (RTA-R05). The independent reviewer checks that evidence and later carries out
    the separate app stage.

  Until then, release stays blocked at that boundary, and no case is passed because of the amendment.
- **Integration.** Luis/EdX2C keeps integration and merge authority. There is no formal approval or delegation yet, and
  PR503 must not be merged before the review gates on its current head pass.
- **Text outside this file.**
  - *PR503 description.* When r1 read it (2026-11-09, around 20:08Z), it still reported the superseded clean automatic
    review. It was later corrected centrally (supplied record). When r3 read it (around 20:43Z), it described head
    `4cb4bbe` with current-head CI and automatic review still running. The coordinator keeps the description current.
  - *Mission ledger.* It was stale at `afe68b6` and `4cb4bbe`, and r3 updates it to a timestamped snapshot. It must be
    reconciled again before each new assignment.
- **Running effects (supplied record).** The installation had no product, native, account or deployment effects. The
  reviewer's disposable PostgreSQL cluster has been stopped. A local simulated preview is still running for the design
  decision. No unresolved product record has been rolled back or deleted.
- **Acceptance cases.** In the current register, 131 cases are still `not_run`, including AC-00-02 and every real
  product, native, provider, API, voice and deployed-app case. The three historical source and process passes stand as
  recorded. The frozen issued CSV stays at 134 `not_run`, as issued.

## Next bounded action

The independent reviewer reviews the exact r4 commit across the full base `953e5dc` to r4 diff, with the r4 delta
against `4cb4bbe`. If accepted, the coordinator updates PR503 with that commit. Required CI and automatic code and
security review then run on the new head, and Luis decides on integration. Ordinary findings return to this four-path
scope. The [mission ledger](../progress/SOPHIA-INC-2026-11.md) lists each programme assignment's next action and its
single owner. The product slices continue under their own assignments and owners; this repair
neither grants a larger budget nor resets any goal.
