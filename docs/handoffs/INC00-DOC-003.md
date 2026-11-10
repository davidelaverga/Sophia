# Implementation-session handoff — INC00-DOC-003 (source-map companion and its repair)

This record follows [the session handoff](../pack/templates/SESSION_HANDOFF.md). It continues the INC-00
documentation installation recorded in [INC00-DOC-001](INC00-DOC-001.md) and covers two attempts by two different
authors:

- **r1** is the backend author's one-file companion repair of `docs/SOURCE_MAP.md`. It is published as `f6175c83`.
- **r2** is the documentation author's repair, which adds this record and fixes the execution-index integrity wording.
  It is local and unpublished.

Neither author re-reviews the other's work. Each fact below says where it comes from:

- **own check (r2)**: the documentation author ran or read it, in its own container or through its GitHub access, at
  2026-11-09T23:10–23:20Z.
- **supplied record**: the coordinator or the independent reviewer supplied it. Owner-local evidence paths are relative
  to `/Users/davidelaverga/.codex/operator-journal/SOPHIA-INC-2026-11/` on the coordinator's host, outside Git. The
  documentation author cannot read that host and did not read those files.

The identity types are kept apart throughout: Git commit or tree, assignment digest, review record digest, source-diff
digest, export digest, session ID.

## r1 — source-map companion (backend author)

Goal and attempt: INC00-DOC-003 r1. It repairs PR503 automatic P1
[`discussion_r4518692235`](https://github.com/davidelaverga/Sophia/pull/503#discussion_r4518692235), raised on
`422e9ba`. The canonical map named October as forward authority and had no November donor entries.
Human owner / executor resource: Davide / Claude Code backend author (INC01-CC-002), who exclusively owns
`docs/SOURCE_MAP.md`, coordinated by Codex `01a1bd48-df51-7692-b30c-9e20f6eb4c81`.
Native session: `session_01FGXfrJoUMojmJSW3H7XfoG`, per the commit trailer (own check).
Starting worktree/commit: parent `422e9ba1f51fcde0c7367aff91959eeace9d04fc`, the published INC00-DOC-002 r4. The
backend author's worktree path was not supplied.
Ending commit/tree and changed files:

| Item | Value |
|---|---|
| Commit | `f6175c83a2154716d1a548131337159559a1d093` |
| Tree | `d78e54cabba476aa379cf30dd41ac875feaa220b` |
| Parent | `422e9ba` |
| Base | main `953e5dc3d4c88e491517f3f0d0eaa18216fea98f` |
| Changed against the parent | Only `docs/SOURCE_MAP.md` |
| Base-to-head scope | 47 paths |
| Author and committer | `Claude <noreply@anthropic.com>` |
| Signature | The commit has a `gpgsig` (SSH) header. This container has no allowed-signers file, so the signer's trust is **unqualified**. |
| Published | The coordinator pushed it once after pre-push acceptance. PR503's head and `docs/inc-00-install-20261108` were both `f6175c83` at 2026-11-09T23:10Z (own check, `git ls-remote`). |

To recover r1:

```bash
git fetch origin f6175c83a2154716d1a548131337159559a1d093
```

```bash
git log -1 --format='%H %T %P' f6175c83a2154716d1a548131337159559a1d093
```

```bash
git diff --name-only 422e9ba1f51fcde0c7367aff91959eeace9d04fc f6175c83a2154716d1a548131337159559a1d093
```

The second command must print the commit, tree and parent above. The third must print only `docs/SOURCE_MAP.md`.

### Outcome (r1)

`docs/SOURCE_MAP.md` now opens with current authority:

- the user's latest choices govern;
- the scoped November programme is the current continuation, with links to its installation record, mission ledger and
  active release-trust amendment;
- October and v0.4 are kept as history and retained context.

New §2k records the DSH Super Agent, T3 Code and Impeccable donor pins as **provenance from the frozen November source
register only**. That is not a fresh upstream fetch, installation or qualification. Earlier map entries are unchanged.
The independent final review records P1 `discussion_r4518692235` as closed in source at `f617`; the GitHub thread is
not resolved.

### Evidence (r1, supplied record unless marked)

**Digests:**

| Record | Type | SHA256 |
|---|---|---|
| Parent delta `422e9ba..f6175c8` | Source-diff, full-index | `4507805d8e233c1a942009aacd057dd0b30cab876f1e36eedb28d27c4beeb94d` |
| Full diff `953e5dc..f6175c8` | Source-diff, full-index | `56e04ad63d77c62d76a79952113284f3480aac7081e5322d094afe73beb23b34` |
| Companion bundle | Export digest | `0d8df89912063dc9d4b50dbf5fb4071be679b2373171af986ba0df218b847e6d` |
| Companion manifest | Export digest | `d15b5c53163e6928f683d3867ce43bdbb285d9cc056c7809432e0b1b3e43e158` |

**Coordinator import receipt.** Owner-local path `received/INC00-DOC-003-r1/source-import-receipt.json`; its hash was
not supplied. It records that the coordinator verified:

- the 3 export checksums and the bundle;
- the one-file parent delta and the 47 base paths;
- the reverse patch;
- a clean tree;
- the frozen pack tree `ef46e7f45a0221ce81b421b2d19a80e801fdf589`.

**Independent pre-push review.** INC00-DOC-003-r1-SOURCE-PRE-PUSH-001, owner-local path
`review/INC00-DOC-003-r1-SOURCE-PRE-PUSH-001.json`, review record SHA256
`251818dbd1233e505adf71e175d556d4245660ad84886517342919a766a3f0c7`. It accepted the whole 47-path diff:

- the 46 prior blobs are identical;
- 9 relative links and 11 register URLs were checked;
- authored whitespace was checked;
- no package tests were rerun for Markdown.

That is source acceptance before push, not app or acceptance-case acceptance.

**Independent final review.** INC00-DOC-003-r1-SOURCE-FINAL-001 (2026-11-09T23:04:18Z), review record SHA256
`b64b888b178da8c7374f31c164eff7c708d671e8e99e7b506169acf4b59548e8`. It was supplied to r2 as an attachment; its
journal directory was not stated. Its verdict is **needs_revision**, for two automatic P2s on `f617`:

- [`discussion_r4519009570`](https://github.com/davidelaverga/Sophia/pull/503#discussion_r4519009570): there is no
  tracked handoff for this attempt and no INC-00 continuation bridge;
- [`discussion_r4519009579`](https://github.com/davidelaverga/Sophia/pull/503#discussion_r4519009579): the execution
  index promises a `SHA256SUMS.txt` in every pack.

**Own checks (r2):**

- `f6175c8`'s commit, tree and parent match the values above.
- `git diff --stat 422e9ba f6175c8` shows only `docs/SOURCE_MAP.md`, with 60 insertions and 6 deletions.
- 47 paths change from base to head.
- The frozen pack tree at `f6175c8` is `ef46e7f…`.

### Decisions and changes (r1)

Only the backend author's `docs/SOURCE_MAP.md` changed. That file stays exclusively the backend author's, and r2 does
not edit it.

The companion manifest describes the backend-map reconciliation in the future tense. That wording is not proof that the
reconciliation happened: the reconciliation is **planned and pending** (§ Remaining obligations).

## r2 — handoff and integrity-navigation repair (documentation author)

Goal and attempt: INC00-DOC-003 r2. It answers both automatic P2s above.
Human owner / executor resource: Davide / Claude Code documentation author, coordinated by Codex
`01a1bd48-df51-7692-b30c-9e20f6eb4c81`. The coordinator delegated exactly four writable paths:

- this record (new);
- [INC00-DOC-001](INC00-DOC-001.md), for a forward bridge only;
- the [mission ledger](../progress/SOPHIA-INC-2026-11.md), for the dated INC-00 continuation only;
- [the execution index](../execution/README.md), for the integrity introduction and navigation only.

Native session: `session_01FGXfrGdEeRRkWqHnZfiF8C`, environment `env_018aAg5fvhJRzAgkZCp4fyYb`.
Starting worktree/commit: container worktree `/home/user/Sophia`, branch `claude/upbeat-feynman-xuqimy`, which was
clean at `422e9ba`. It was fast-forwarded to the published `f6175c83`, `422e9ba`'s only child, so no history was
rewritten. Earlier refs and exports are preserved.
Ending commit/tree and changed files: r2 is one signed local commit whose **only parent is `f6175c83`**. It changes
exactly these four paths:

- `docs/handoffs/INC00-DOC-003.md` (new);
- `docs/handoffs/INC00-DOC-001.md`;
- `docs/progress/SOPHIA-INC-2026-11.md`;
- `docs/execution/README.md`.

That makes 48 paths from base to head. A commit cannot contain its own hash, so this record never names the current
candidate's own commit or tree. They are bound outside Git, in the export manifest whose `source.head_git_commit` is
that exact commit (§ Recovering r2). Once r2 is published, PR503's head binds them too.

Revision history (unpublished local commits, each amended with the same sole parent `f6175c83`; history only, never a
current validator):

| Revision | Commit / tree | Independent review | Its export (kept unchanged) |
|---|---|---|---|
| First r2 | `970eca9d77c040a27dbf99aabb9c44811c985443` / `daa723516a79f23fbe917414c6b24a737909d9c6` | INC00-DOC-003-r2-SOURCE-PRE-PUSH-001 (review record SHA256 `96a67f7f…`): both original P2s closed; one P2 for the CI row of run 42710881865 | `INC00-DOC-003-r2` (manifest SHA256 `599c0a71…`) |
| r3 correction | `675b9d6bf41c41eb5a8a14050810cb14682c8681` / `07a49d1b3b61b74e8c07ee8f4a2463781ba86ab8` | INC00-DOC-003-r3-SOURCE-PRE-PUSH-001 (review record SHA256 `e7c37164…`): CI row closed; one P2 because this recovery section validated against the superseded r2 manifest | `INC00-DOC-003-r3` (manifest SHA256 `8374fe69…`) |
| r4 correction | The current candidate; bound by the manifest that names it | Pending: the same reviewer, whole 48 paths | The export whose manifest names it (at the time of writing, `INC00-DOC-003-r4`) |

### Recovering r2

**1. Find the current candidate.** After publication, fetch PR503 and list the first-parent commits after `f6175c83`:

```bash
git fetch origin pull/503/head
```

```bash
git log --first-parent --format='%H %T %P %s' f6175c83a2154716d1a548131337159559a1d093..FETCH_HEAD
```

The current candidate is the commit whose subject starts `docs: INC00-DOC-003 r2` and whose single parent is
`f6175c83…`.

Before publication, take it from the newest INC00-DOC-003 export bundle instead. That bundle needs `f6175c83` as its
prerequisite, and its one ref names the candidate. In each bundle, the ref has the export's own name
(`refs/heads/inc00-doc-003-r<N>`).

**2. Choose its manifest by head, not by file name.** Use only the export `MANIFEST.json` whose
`source.head_git_commit` equals the recovered commit. Any manifest naming another head is history:
`970eca9`'s r2 export, `675b9d6`'s r3 export, and any later superseded amendment. It must not be used to accept or
reject the current candidate.

**3. Check the candidate against that manifest:**

- its single parent is `f6175c83…`;
- `git rev-parse <candidate>^{tree}` equals `source.head_tree`;
- `git diff --name-only f6175c83 <candidate>` lists exactly the four paths above;
- `git rev-parse <candidate>:<path>` equals `source.file_blobs[<path>]` for each of the four paths;
- `git rev-parse <candidate>:docs/execution/2026-11-08-incremental` is still
  `ef46e7f45a0221ce81b421b2d19a80e801fdf589`.

Each export's `SHA256SUMS` must pass before its manifest is trusted.

### Outcome (r2)

- **P2 `discussion_r4519009570`.** This record exists, and the attempt is linked from INC00-DOC-001's forward bridge,
  from the ledger's dated INC-00 continuation, and from the execution index.
- **P2 `discussion_r4519009579`.** The execution index's introduction now names each pack's own supplied integrity
  mechanism:
  - *October:* its `SHA256SUMS.txt` lists 306 files; the pack has 307 files, that list included.
  - *November:* its `MANIFEST.json` lists 36 payload files by length and SHA-256; the manifest is the 37th file and
    does not hash itself.

  No checksum file or validator was added to either frozen pack.
- **Not changed by r2:** product behavior and acceptance status. r2 is **not** independently reviewed, pushed,
  CI-covered or accepted.

### Evidence (r2, own checks)

- **Inputs.** The final review attachment's SHA256 is `b64b888b…`, as supplied. The preflight handback INC01-CC-004 is
  preserved unchanged (`21f49d71…`).
- **Source.** `git ls-remote` at 23:10Z showed main `953e5dc`, and PR503 and its branch at `f6175c83`. The fetched
  commit, tree and parent match r1 above.
- **October pack.** `sha256sum -c SHA256SUMS.txt` in its folder passes all 306 entries. Its tree is `1944c97b…`, the
  same as at `953e5dc`.
- **November pack.** A Python check passes all 36 `MANIFEST.json` entries by byte length and SHA-256. The manifest does
  not list itself. Its tree is `ef46e7f…`, unchanged.
- **Edited files.** Every relative link in the four files resolves. `git diff --check` passes, with no CR characters.
  r2 changes exactly four paths against `f6175c83` and 48 against base. The whole diff was read.
- **Not run:** `pnpm` packages and tests. This container has Node 22.23.4, not 24.21.0, and a Markdown-only repair
  needs no package suite.

### Decisions and changes (r2)

- **Ledger.** The [mission ledger](../progress/SOPHIA-INC-2026-11.md)'s 20:58Z snapshot is kept. A dated INC-00
  continuation supersedes only its INC-00 and PR503 rows. Unrelated actor rows are not rewritten to chase live progress.
- **Untouched.** `docs/SOURCE_MAP.md`, `AGENTS.md`, the release-trust amendment, `CONTRACT_MAP.md`, the frozen packs,
  both acceptance CSVs and the canonical register, and all runtime, API, schema, UI and config.

## Current state (dated snapshot, 2026-11-09T23:04–23:20Z; reconcile before acting)

- **PR503.** Open, not merged, head `f6175c83`. The synthetic merge `9094aa51…` (tree `d78e54ca…`) is not a merge to
  main. Luis/EdX2C's integration review is requested, with no approval or delegation (supplied).
- **Review threads, all unresolved.**
  - Earlier: `discussion_r4516450352`, `r4517641847` and `r4517641852`. Their content is repaired; each is outdated or
    current but unresolved.
  - `r4518692235`: closed in source at `f617`.
  - Security advisory `r4517682095` (Medium): open.
  - The two r2 P2s above.
- **Automatic review on `f617`.** The code review completed with the two P2s. The security review completed with
  finding flags `null`. `null` is **not** clear, and the Medium advisory is still open. `mergeGateEnabled` is false
  (supplied).
- **CI.** Each run is recorded as observed. No run is called a pass.

  | Head | Run | State |
  |---|---|---|
  | `f617` | operative pull_request [42716479853](https://github.com/davidelaverga/Sophia/actions/runs/42716479853) | 2 jobs succeeded and 6 were running at the review's 23:03Z snapshot |
  | `f617` | push run [42716472393](https://github.com/davidelaverga/Sophia/actions/runs/42716472393) | cancelled |
  | `422e9ba` | [42710881865](https://github.com/davidelaverga/Sophia/actions/runs/42710881865) | Terminal, nine jobs: 7 ordinary jobs succeeded, including room shards 1 and 2. Only "The room in Chromium, part 3 of 3" was cancelled, and the always-run room aggregate failed. Overall not a complete pass. |
  | `4cb4bbe` | [42693446183](https://github.com/davidelaverga/Sophia/actions/runs/42693446183) | failed in shard 1 (`home.spec.ts:301`, an animation expectation); 7 other jobs succeeded and the aggregate failed. A later pass of that browser shard does not establish a root cause or flakiness. |

  All supplied. The `422e9ba` row was also checked by the documentation author in r3, by listing the run's jobs
  read-only through GitHub at about 23:39Z.
- **Release trust.** The [release-trust amendment](../coordination/SOPHIA-INC-2026-11/RELEASE_TRUST_AMENDMENT.md) is
  active. Credentialed release from source-exposed contexts is on hold. Already-authorized isolated, disposable source
  checks remain permitted. No technical isolation, exposure, exploit or release qualification is claimed.
- **Acceptance.** The canonical owner-local register still has 3 historical preparation and process passes and 131
  `not_run` cases. The issued CSV stays at 134 `not_run`. No case changes.
- **Design.** UI r2 received an explicit request for changes, and r3 is being implemented. It is **not** approved
  (supplied).

## Remaining obligations

- **r2 review and publication.** r2 awaits the same independent reviewer's whole 48-path pre-push review. Then come
  central publication to PR503, CI, automatic code and security review on the new head, and Luis's integration
  decision. No thread is resolved by this record.
- **Backend-map reconciliation: planned and pending.** `f617` and the backend author's unpublished T3 study are both
  retained. Proof of the backend's own r3 map and a combined three-way merge with main belongs to that owner's later
  handback.
- **Release-trust qualification.** The future operational qualification of the release-trust hold is unchanged and
  unqualified.

## Next bounded action

The independent reviewer reviews the exact r2 commit: the whole 48-path diff from `953e5dc`, plus the four-path delta
against `f6175c83`. If accepted, the coordinator publishes r2 to PR503. Ordinary findings return to these four paths.
The separate INC01-CC-004 API WRITE assignment waits for the coordinator's explicit grant.
