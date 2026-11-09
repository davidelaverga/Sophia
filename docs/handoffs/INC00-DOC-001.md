# Implementation-session handoff — INC00-DOC-001 (documentation installation)

This record follows [the session handoff](../pack/templates/SESSION_HANDOFF.md). It covers two attempts at one goal.
The first attempt is the original installation, written by the Codex programme coordinator. The second is a
documentation-only repair of this record by a Claude Code session, made because PR503's automatic review asked for it.
The second attempt does not re-author, re-run or re-review the first. Each fact below says where it comes from:

- **own check (attempt 2)**: the Claude repair session ran it or read it itself, in its own container or through its
  GitHub access;
- **supplied record**: the coordinator supplied it, either in the repair's facts file (INC00-DOC-002-FACTS.json,
  SHA256 `1eb38d14f3080d2aabc6a06bb0bb656c9441efe3bc59b2c4ca3fd3dd30a25741`) or in the r2 repair assignment and the
  independent review INC00-DOC-002-r1-SOURCE-PRE-PUSH-001 (SHA256
  `42dad58d3aaed0275fa066c3d6958367a9edfba88c95b00c8f7785f6fd223200`). The repair session cannot read the
  coordinator's host and did not run or read those records.

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
`72c8d33fe850fc53450e5e334566a196d4fb579791fe2554e738f41d810960fb`), and only this file is writable.
Human owner / executor resource: Davide / Claude Code cloud session (claude.ai/code, Auto mode), coordinated by Codex
`01a1bd48-df51-7692-b30c-9e20f6eb4c81`.
Native session: `session_01FGXfrGdEeRRkWqHnZfiF8C`, environment `env_018aAg5fvhJRzAgkZCp4fyYb`, as `get_session`
returned them.
Starting worktree/commit: container worktree `/home/user/Sophia`, session branch `claude/upbeat-feynman-xuqimy`. The
branch started at `953e5dc`, matching `origin/main`, with a clean tree. It was fast-forwarded to `afe68b6`, which was
fetched from origin and checked against tree `094bdf2` and parent `953e5dc`. `refs/pull/503/head` and
`docs/inc-00-install-20261108` both pointed to `afe68b6`, so the target was current.
Ending commit/tree and changed files: the commit that changes only `docs/handoffs/INC00-DOC-001.md`, with single parent
`afe68b679722e28471dcdf6222d519759cd78c49`. A commit cannot contain its own hash. The repair's export manifest (outside
Git) records the actual head and tree, and the PR head records them once the repair is published. Recovery commands are
in the next subsection.

Revisions of this repair: the first local version, r1, was commit `e468bedfed4d67798d27b429481531fde8f80c03` (tree
`02a57f2eaac691c67da387458a28397d6f443936`). It was never published. Its independent review,
INC00-DOC-002-r1-SOURCE-PRE-PUSH-001, returned `needs_revision` for one P2: r1 confused the frozen CSV's 134 `not_run`
rows with the current register. r2 replaces r1 by amending it, with the same parent `afe68b6`. r1's export is kept
unchanged outside Git.

### Recovering the repair commit

Once the repair is published as PR503's head, a later session can locate it from the reviewed parent:

```bash
git fetch origin pull/503/head
```

```bash
git log --format='%H %T %P' afe68b679722e28471dcdf6222d519759cd78c49..FETCH_HEAD -- docs/handoffs/INC00-DOC-001.md
```

```bash
git diff --name-only afe68b679722e28471dcdf6222d519759cd78c49 <that-commit>
```

Check three things:

- the repair commit's single parent is `afe68b6…`;
- the only path that differs from `afe68b6` is this file;
- `git rev-parse <that-commit>:docs/handoffs/INC00-DOC-001.md` equals the blob ID in the export manifest.

Once the repair exists, `afe68b6` is the reviewed parent. It is no longer the current head.

### Outcome

This record now gives the template fields for both attempts, the exact reviewed candidate, the commands and results
with where each came from, and evidence that can be located. The repair changes no other file and no product behavior.
r2 also separates the issued, frozen acceptance CSV from the current register. It is **not** independently
reviewed, pushed, CI-covered or accepted. Those gates are listed below.

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

Not run: `pnpm check` and any package command. This container has Node 22.23.4, not the required 24.21.0, so it would
not give valid results. The parent's `pnpm check` and CI results cover `afe68b6`. They do not prove the repair head;
normal CI and review still apply once it is published.

### Decisions and changes

- **Repaired.** This record was rewritten in the handoff template and plain prose. The coordinator's authorship and the
  history of the original candidate are kept, and attempt 2 is identified as a separate, later Claude attempt.
- **Untouched.** Pack files, maps, the mission ledger, other handoffs, PR499 and PR501 files, product, runtime, config
  and CI. The live backend (INC01-CC-002), routing (INC03-CC-001) and designer (INC01-DES-001) scopes are also
  untouched.
- **No new authorization.** The repair needed no new authorization and has no wider impact.

## Current state (as of 2026-11-09, coordinator facts, supplied record)

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
  `c5d3c09fdecb4e48f29e23994813eb97cd588bd3c8eb26b180d87f4734684e8f` when the independent reviewer read it for
  INC00-DOC-002-r1-SOURCE-PRE-PUSH-001). Of its 134 cases, three passed:
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

## Remaining obligations

- **This repair.** r2 awaits the same independent whole-diff pre-push review by `/root/independent_review_app`. After
  that come central publication to PR503, required CI on the new head, and a new automatic review covering the new
  head. The automatic P2 thread (`discussion_r4516450352`) stays open until a reviewer decides on it. The independent
  review found r1's content addressed it in substance, but nobody resolved the thread on GitHub.
- **Integration.** Luis/EdX2C keeps integration and merge authority. There is no formal approval or delegation yet, and
  PR503 must not be merged before the review gates on its current head pass.
- **Text outside this file.**
  - *PR503 description.* When r1 read it (2026-11-09, around 20:08Z), it still reported the superseded clean automatic
    review. Since then it has been corrected centrally to disclose the newer unresolved P2, the unpublished repair and
    the lifted hold (supplied record); no source change, push or thread resolution was involved.
  - *Mission ledger.* The [mission ledger](../progress/SOPHIA-INC-2026-11.md) at `afe68b6` still records the 2026-11-08
    state. Updating it is outside this repair's scope.
- **Running effects (supplied record).** The installation had no product, native, account or deployment effects. The
  reviewer's disposable PostgreSQL cluster has been stopped. A local simulated preview is still running for the design
  decision. No unresolved product record has been rolled back or deleted.
- **Acceptance cases.** In the current register, 131 cases are still `not_run`, including AC-00-02 and every real
  product, native, provider, API, voice and deployed-app case. The three historical source and process passes stand as
  recorded. The frozen issued CSV stays at 134 `not_run`, as issued.

## Next bounded action

The independent reviewer reviews the exact repair commit against `afe68b6`. If accepted, the coordinator updates PR503
with that commit, required CI and the automatic review run on the new head, and Luis decides on integration. Ordinary
findings return to this one-file scope. The product slices continue under their own assignments and owners; this repair
neither grants a larger budget nor resets any goal.
