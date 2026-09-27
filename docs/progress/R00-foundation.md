# R00: foundation integration

**State on 2026-09-27 at 22:30 UTC: merge-ready.**
- **The preflight has cleared the merge.** Codex answered [CC-0034](../coordination/S1-05A/S1-05A-CC-0034.md) in [R00-CX-0002](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5860246906): no merge, retarget or ready-marking builds or deploys anything (§5).
- **Still needed:** Luis's disposition, then Davide's approval of the batch in §7.
- **Nothing is merged or released.**

The mission is [R00](../missions/2026-09-27-companion-research/02_FOUNDATION_MERGE_REVIEW.md). Messages go on issue [#14](https://github.com/davidelaverga/Sophia/issues/14), and the release is S1-05A-OP-0009 ([CC-0033](../coordination/S1-05A/S1-05A-CC-0033.md)).

| Readiness | State |
|---|---|
| Source-ready | Yes: the candidate below, CI green on every head, and no unresolved blocking finding (§3) |
| Merge-ready | Yes: the preflight is answered (§5). Waiting on Luis's disposition and Davide's approval (§6 B0, §7) |
| Release-ready (OP-0009) | Its preconditions hold as observed at 22:03 UTC (§8). It waits for Davide's separate approval |
| Hosted-verified | For what is live (`2d59884`, CX-0059). The fixes at `83a4f3e` and `00a16c2` are not live |
| Product-accepted | No. §9 lists the open cases |

## 1. Identities (refreshed at 21:50 UTC)

| Item | Value |
|---|---|
| `main` | `01d9117bdcf9ec8ee18cd5414aa08ee4f24265a3`, the merge of #2 (S1-03). Unchanged since the packet |
| Candidate | #13's head. At the packet this was `2911b037c9703703f2ae33955123d434797e3155`; this docs-only R00 commit follows it. The approval names the exact head |
| Its code | Outside `docs/`, identical to `00a16c2c26634695527d59ff19eb6ef9a2e7f1ce`, OP-0009's source |
| Live, observed at 22:03 UTC | Every process at `2d59884`, with schema 0001–0016 matching and 0017 pending (R00-CX-0001, R00-CX-0002) |

## 2. The stack as it is

| PR | Author | Branch | Head | Base | State | Commits over base | CI on head (run ids) | Reviews | Unresolved threads |
|---|---|---|---|---|---|---|---|---|---|
| #3 | Luis | `docs/pack-v0.4` | `459744a` | `main` | open | 2 | runtime-unit green (36079476564, 36079472060) | none | 0 |
| #4 | Luis | `s1-02/admit-command` | `e85db97` | `docs/pack-v0.4` | open | 9 | 3 jobs green (36080230408, 36080228552) | 1 (§3) | 8, all addressed (§3) |
| #5 | Luis | `tooling/clean-code` | `e9aa9d4` | `s1-02/admit-command` | open | 5 | green (36080247778, 36080248927) | none | 0 |
| #6 | Luis | `s1-02/response-validators` | `66b8ca8` | `tooling/clean-code` | open | 2 | green (36080342522, 36080341196) | none | 0 |
| #7 | Luis | `deploy/render-vercel` | `ff22a24` | `s1-02/response-validators` | open | 4 | green (36082754435, 36080417363) | none | 0 |
| #8 | Luis | `s1-04/studio-shell` | `4bd8cb1` | `deploy/render-vercel` | draft | 8 | green (36084216907, 36084215311) | none | 0 |
| #9 | Luis | `studio/vision` | `e5a7b75` | `s1-04/studio-shell` | draft | 1 | green (36091084337, 36091080774) | none | 0 |
| #10 | Luis | `rooms/access` | `3992996` | `studio/vision` | draft | 1 | green (36093959044, 36093937514) | none | 0 |
| #11 | Luis | `studio/precise` | `0554dd6` | `rooms/access` | draft | 2 | green (36095998508, 36095996401) | none | 0 |
| #12 | Luis | `studio/qol` | `d18e171` | `studio/precise` | draft | 15 | green (36173250799, 36173245525) | none | 0 |
| #13 | S1-05A (Claude, through the owner's account) | `claude/affectionate-cannon-496z9m` | `2911b03` | `studio/qol` | draft | 55, plus this commit | 4 jobs green, LiveKit included (36281456865, 36281453214) | 8 Codex review rounds | 0 of 26 |

- **One line, nothing superseded.**
  - Each base is an ancestor of its head, and `main` is an ancestor of every head: 104 commits over `main`.
  - Every head is contained in the next. Nothing is duplicated or rewritten, and no PR needs closing instead of merging.
  - #1 and #2 are closed, and both their heads (`74936ef`, `f8f7b3d`) are in `main` through `01d9117`.
- **The candidate holds everything.** The heads of #3–#12, which are Luis's work, are all ancestors of #13's head, and so is current `main`.
- **#7's branch.** `deploy/render-vercel` is the branch that `sophia-next-api` once deployed on commit (CX-0004), until OP-0004 turned that off (CX-0013). Nothing in this plan pushes to it or to any other stack branch.

## 3. Review disposition

**#4.** One review, written by Claude and posted from the owner's account on 2026-09-25, on `5305fac`. Luis answered it the same day. Each finding at the candidate:

| Finding | Severity | At the candidate |
|---|---|---|
| Authentication skipped by percent-encoding the path | Blocker | Fixed. `apps/api/src/app.ts` keys on the matched route (`req.routeOptions.url`), and `apps/api/src/api.db.test.ts:198` pins `/%61pi/…` |
| No `pool.on('error')` | Should fix | Fixed: `packages/persistence/src/tx.ts:14` |
| SSE stream leaks if the client leaves during the first read | Should fix | Fixed: `apps/api/src/routes/events.ts:53` |
| LISTEN never recovers | Should fix | Fixed: `packages/persistence/src/listen.ts` reconnects with backoff, and `apps/api/src/event-hub.ts` wakes its followers |
| Ineligible queued rows stay `pending` | Follow-up | Fixed: `db/migrations/0012_runtime_service.sql` denies them, with a reason |
| Supabase CLI fetched outside the lockfile | Follow-up | **Open, not blocking.** `scripts/supabase-local.ts:19` runs `npx -y supabase@2.117.0`: the version is pinned but not hash-locked. Only local development and CI's live-auth job use it, and that job has `contents: read` and no secrets |
| `record_dispatch_result` idempotent for its holder | Nit | Fixed: `db/migrations/0008_dispatch_result_idempotent.sql` |
| JWKS accepts RS256; no required claims | Nit | Fixed: `apps/api/src/auth.ts` accepts only ES256 and requires `exp` and `sub` |
| `format: 'uuid'` accepts uppercase and `urn:uuid:` | Nit | Fixed for project routes (`UUID_PATTERN` in `apps/api/src/routes/schemas.ts`). **Still open, not blocking,** for `roomId` in `apps/api/src/routes/rooms.ts:12`, added later in #8: a `urn:uuid:` room id gets a 503 instead of a 422 |

The 8 inline threads are still unresolved on GitHub, although the code above addresses them. Step B1 resolves them.

**#13: 26 threads over eight Codex review rounds, from `b126ce6` to `aba31d5`, all resolved.** The bot has not reviewed the commits since:
- `2d59884`: round 8's fixes and migration 0016, now live;
- `83a4f3e` and `00a16c2`: OP-0008's fixes and 0017;
- the docs.

Marking #13 ready (B1) starts that review.

**#3 and #5–#12: no review or review comment on GitHub.**
- #3 is the pack v0.4 import. #4's review checked its bytes against the pack's `SHA256SUMS`.
- #5–#12 are Luis's tooling, deploy, Studio and rooms work. Every S1-05A test run has exercised them, and production runs them, but no line review is recorded.

That is a gap in the reviewed history, not a known defect. B1 narrows it with the automated review. Luis remains the reviewer for integration, and Davide decides whether this is enough.

## 4. Checks

- **CI on every head** (§2): two runs each, push and pull_request, and every job succeeded. No head carries a Render or Vercel check run or commit status.
- **Why head CI covers the merges.** `main` is an ancestor of every head, and each base is an ancestor of its head. So each bottom-up merge's tree equals its PR head's tree.
  - `git merge-tree` confirms this for all 11 PRs, and for `main` plus #13's head.
  - Every intermediate `main` equals a head that CI has already passed, and the final `main` equals the candidate.
  - CI's `push` trigger runs again on `main` after each merge. The last run is the one B3 requires.
  - Changing a PR's base starts no CI: the `pull_request` trigger has its default types, and the tree does not change.
- **Locally, on the same code** (`00a16c2`, and `2911b03`, which differs only in docs):
  - `pnpm check` exits 0, with 253 unit and 56 integration tests;
  - `pnpm test:db`: 147;
  - `pnpm test:sql`: 17 migrations.

  This R00 commit adds docs only, and `pnpm check` passes on it.

## 5. What a merge could deploy: nothing, as observed

Codex's read-only answers: [R00-CX-0001](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5860183114) (21:55 UTC) and [R00-CX-0002](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5860246906) (22:03 UTC).

| Target | Observed |
|---|---|
| Render: API, bridge, worker and runtime host | These are the only services in the workspace linked to this repository (12 enumerated). Each tracks `claude/affectionate-cannon-496z9m`, with Auto-Deploy **Off** and Pull Request Previews **Off**. None is Blueprint-managed. Each has a deploy hook (URL withheld): a manual trigger, not a Git one |
| Vercel `sophia-studio` | No Git repository connected, so no Git-triggered Production or Preview build. No Vercel project is Git-connected to this repository |
| GitHub | No repository webhooks. Installed apps: ChatGPT Codex Connector, Claude, Factory Droid, genspark ai developer, lovable.dev, Vercel and Warp Factories. The Vercel app's installation alone creates no Studio link. The only workflow, `ci`, has `contents: read` and no deploy step |

**Verdict:** no build or deploy on:
- (a) a push to `main`;
- (b) a base changed to `main`;
- (c) a draft marked ready;
- (d) a push to any stack branch, the tracked one included.

A manual deploy, or a call to an existing deploy hook, still could; neither is a Git event. Automation outside the inspected accounts is unknown. **B0 adds a read-only recheck of these settings just before the first merge.**

**Live state at 22:03 UTC:**
- **The tuple.** Unchanged since CX-0059: API `dep-das3ed7…`, bridge `dep-das43lj…`, worker `dep-das47n3…` and runtime host `dep-das492n…`, all at `2d59884`. Studio `dpl_6E7MUJB…` is still the `2d59884` artifact. `/health` and `/ready` return 200.
- **The ledger.** The dry run at `2911b03`: 0001–0016 applied, each filename and SHA-256 matching; exactly one pending, 0017 (`0d0b929f…`).
- **Work, as counts:**
  - one ready runtime lease;
  - native tasks: 2 finished, 0 non-terminal;
  - outbox: 0 unsettled;
  - removals and quiesce requests: 0 pending;
  - exchanges: 8 ended, **1 open**, in project `b04a5346…`.

**Operations note: the open exchange.** It has been open about 28 hours with nobody in the room, and its presence row reads `voice=recovering`.
- **The Google side is cycling.** The bridge treats a lost Google session as recoverable, and a successful reconnect resets its retry count. So for an open exchange it keeps reconnecting, even to an empty room. Provider usage while it does so is not measured.
- **0017 ends it.** The bridge reports presence whenever its LiveKit link is up, whatever its Google state (`apps/media-bridge/src/room-session.ts`, `publish`). So once 0017 is applied, the empty count starts at the bridge's next report, and the exchange ends five minutes later. That is CC-0033's M1 verification.
- **Before OP-0009, only a member can end it.** A member of that project joins the room and presses End in the dock.

## 6. The integration plan: bottom-up, with merge commits

**Why not one cumulative merge?**
- Bottom-up merges each of Luis's PRs as itself, with its author history.
- It orphans nothing, and every step's tree has already passed CI.
- The alternative leaves #4–#12 open, or needing manual closure, beside a `main` that already holds them.
- The pack prefers bottom-up.

Squash and rebase merges are excluded: GitHub would rewrite the SHAs, duplicate Luis's commits and conflict the PRs above.

**B0. Preconditions, all before any step.**
1. **Deploy triggers.** Met at 22:03 UTC (§5). Just before the first merge, Codex rechecks read-only: the four Render services' Auto-Deploy and Pull Request Previews, and Studio's Git link. If anything now deploys from `main` or a stack branch, stop; a freeze needs approval first.
2. The heads are unchanged: #3–#12 as in §2, and #13 as approved. If any head has moved, the batch stops.
3. **Luis's disposition** (R00-CX-0001: no PR in the stack has an APPROVED review). He is the integration reviewer. Two things are needed from him:
   - his review of #13;
   - his agreement to merge #3–#12, which are his branches.

   He may run B1–B2 for his PRs himself; otherwise Davide's approval covers Claude doing it. Either way, no branch is pushed or deleted.

**B1. Reviews, before any merge.**
1. Mark #8–#13 ready for review, which starts the Codex review on each. Comment `@codex review` on #5, #6 and #7.
2. Triage every finding against the candidate's tree:
   - **Fixed later in the stack:** reply once, naming the fixing commit, and resolve.
   - **Present in the candidate, and a security, privacy or control defect:** stop before any merge. Claude fixes it on #13's branch, the top of the stack, so Luis's branches stay untouched. CI runs again, and the new head needs Davide's fresh approval.
   - **Present and not blocking:** reply, record it as an M01 follow-up, and resolve.
3. Resolve #4's 8 threads, each with a one-line reply naming its fix (§3).

**B2. Merges, one PR at a time, in the order #3, #4, …, #13.**
1. From #4 on, change the PR's base to `main`. Confirm the PR now lists only its own commits (the counts in §2) and is mergeable.
2. Merge with **Create a merge commit**, pinned to the expected head SHA. Never squash, never rebase, and never merge into the old intermediate base.
3. Confirm that `main`'s tree equals the head's tree.

No branch is deleted: deleting one would make GitHub retarget or close the next PR. Luis decides afterwards.

**B3. After the last merge.**
1. CI is green on `main`'s final merge commit, all four jobs.
2. `main`'s tree equals the candidate's tree. That commit is recorded as the integrated `main`, M.
3. Codex confirms that no deploy started and the live tuple is unchanged.

**Stop rules.** Stop if:
- a head moves;
- a retargeted PR shows unexpected commits;
- a merge conflicts (impossible unless a branch moved);
- a deploy starts;
- CI on `main` goes red.

If the batch stops midway, `main` sits at an earlier PR's head, which is CI-green and not deployed (B0). Resume at the next PR; do not revert.

**Size.** 10 base changes, 11 merges, 6 PRs marked ready, 3 review requests and 8 thread resolutions. No force-push, reset, rebase or reconstruction.

## 7. The one approval this needs

Davide approves the batch, bound to the exact heads. For example:

> Approve the R00 integration batch in docs/progress/R00-foundation.md §6 (B1, B2, B3): bottom-up merge commits of #3 through #13 into main, with heads #3 `459744a`, #4 `e85db97`, #5 `e9aa9d4`, #6 `66b8ca8`, #7 `ff22a24`, #8 `4bd8cb1`, #9 `e5a7b75`, #10 `3992996`, #11 `0554dd6`, #12 `d18e171` and #13 `<the head named in the handoff>`, after Luis's disposition and Codex's read-only recheck of the deploy settings just before the first merge (CC-0034, answered in R00-CX-0002, found none that a merge triggers). This is not a release.

It does not cover:
- OP-0009, or any other hosted effect;
- any head it does not name;
- closing or deleting any PR or branch.

Under protocol v1.1, an agent-written comment that looks like the owner's is not approval. The approval must come from Davide himself.

## 8. The release, separately: OP-0009

- **The request.** CC-0033, revision 1, `approval_ref: null`:
  - M1: apply 0017 (`0d0b929f8648ee26281799b9de3cf4f89a4b109e0733912bdeffd67d83ba2742`, checked against the file);
  - R1: the bridge at `00a16c2`;
  - R2: Studio at `00a16c2`.

  The API, worker and runtime host stay at `2d59884`.
- **Its source still matches.**
  - `00a16c2` is in the candidate's history and equals the candidate outside `docs/`. After B2 it is in `main`, so the bridge and Studio would run `main`'s code.
  - Between `2d59884` and `00a16c2`, the API, worker, runtime host and packages differ only in the operator's diagnostic sanitizer (which the server does not import) and a test.
- **Preconditions, observed at 22:03 UTC (R00-CX-0002):**
  - every process is at `2d59884`;
  - the ledger is 0001–0016 and matching, with only 0017 pending and its hash equal;
  - OP-0009 has not run, and no partial effect was found;
  - 0 non-terminal tasks.

  Still checked at execution: quiet, meaning no call and no brief. The open, empty exchange in `b04a5346…` is the one M1 is meant to end, not a call.
- **It is reused unchanged:** the source, target and preconditions match. Davide approves it on its own line: "Approve S1-05A-OP-0009 revision 1 as posted in CC-0033." If anything differs at execution, Codex stops, and Claude posts revision 2 against what was observed.
- **Order.** The release does not depend on the merge, so either order works.
- **Result: an intentional split.**
  - The API, worker and runtime host at `2d59884`;
  - the bridge and Studio at `00a16c2`;
  - schema 0001–0017.

  All of these commits are in `main`'s history.

## 9. Acceptance still open

The merge certifies none of these. Davide's report that voice works is his evidence as a user. It is recorded as that, not as an instrumented test.

| Case | State | Evidence | Next bounded test | Owner |
|---|---|---|---|---|
| T1 Join | As expected | CX-0062 | — | — |
| T2 Long reply | No drop in 11 replies. The longest received was 11.2 s, so a 1–2 minute reply is untested | CX-0062 | One 1–2 minute reply, with headphones | Davide; Codex observes |
| T3 Talk over her | As expected: interrupted, 2980 ms cleared | CX-0062 | — | — |
| T4 Stop Speaking | Bridge evidence missing. CC-0032's first question is unanswered | CX-0062 | After OP-0009: CC-0033 test (d) | Davide; Codex observes |
| T5 A brief by voice | Admitted, run and captured. The two UI findings are fixed at `83a4f3e`, not released | CX-0061, CX-0062 | After OP-0009: CC-0033 tests (a) and (b) | Davide |
| T5b Hold and Resume | Not run | — | T5b as in CC-0030 | Davide; Codex observes |
| T6 Guest fence | Not run | — | T6, with a second signed-in person who is not a member | Davide and a second person |
| T7 Remove a guest | Not run | — | T7 | Davide and a second person |
| T8 Leave during a join | Not run | — | T8 | Davide |
| T9 End | Not run. Normal closes were seen, but not the UI path | CX-0062 | T9 | Davide |
| Reconnect | No directed test. One provider recovery was seen at 23:05:18; CC-0032's second question is unanswered | CX-0062 | Reload the page mid-call; drop the network briefly | Davide; Codex observes |
| An empty room ends (0017) | Source-tested (`packages/persistence/src/exchange.db.test.ts`), not released | — | After OP-0009: CC-0033 test (c) | Davide; Codex observes |

**Guests are live but untested hosted.** Guest joining is live: 0015 and 0016, with the API at `2d59884`. It is narrowed, though. Anonymous sign-ins are off, so only a signed-in person who is not a member can knock, and a member must admit them. T6 and T7 have not run on the hosted stack. Until they have, admit no outside guest to a real room, unless Davide decides otherwise. This does not block the merge: the merge changes nothing hosted, and no defect is known.

## 10. The baseline for M01 and M02

- **Source.** The integrated `main` commit M from B3, not `01d9117`. Until B3, the candidate stands in for it.
- **Hosted, observed at 22:03 UTC.** The four Render processes and Studio at `2d59884`, schema 0001–0016, a ready runtime lease, and OP-0009 pending (R00-CX-0001, R00-CX-0002). OP-0009 updates this if it runs.
- **Carried forward:**
  - removing the brief belongs to M01, as Davide agreed, and existing brief tasks and results stay intact;
  - two follow-ups from §3: the Supabase CLI inside the lock, and the `roomId` pattern;
  - the open cases in §9.
- **Mission pack:** [docs/missions/2026-09-27-companion-research/](../missions/2026-09-27-companion-research/00_START_HERE.md).

## 11. Next

1. ~~Codex answers CC-0034.~~ Done: R00-CX-0001 and R00-CX-0002.
2. Luis gives his disposition. Davide approves §7, and separately OP-0009 if he wants it; OP-0009 also ends the empty exchange in `b04a5346…`.
3. B1–B3 run. Luis may run his part.
4. After B2, #13 is merged. The integrated commit, CI and live tuple then go into a docs-only closeout PR, from #13's branch restarted at M, and R00 ends there.

The companion rewrite starts in M01, not in this PR.
