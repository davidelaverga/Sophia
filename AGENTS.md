# Coding-agent entry contract

Read [00_START_HERE](docs/pack/00_START_HERE.md), [decisions](docs/pack/02_DECISIONS.md), [repository map](docs/pack/03_REPOSITORY_MAP.md), and your assigned [goal](docs/pack/delivery/GOAL_INDEX.md). Use the source register for exact upstream files. This is a documentation package for a proposed new repository, not an assertion that its source modules already exist.

## Direction and precedence

The latest user choices and the active v0.4 decisions control. v0.2 supplies the retained product scope. Older Claude plans and research ledgers supply evidence and alternatives, not authority to reinstate late voice, a Claude-SDK root, mandatory assumption scoring, or a dashboard-first interface.

Build on the selected dsh profile and Cordis bundle. Use public native Agent/tool APIs. Keep Sophia's project decisions and permissions in the application layer. Do not create a second generic agent loop, a shadow scheduler advancing the same worker, or a copy of the old companion middleware chain.

## Start an implementation session

Recover the actual target repository, branch/worktree, current commit, assignment and environment. Do not infer those from a sample path. Read applicable repository instructions and the upstream files listed by the goal. Inspect the current implementation before choosing the exact edit locations.

Record the goal ID, attempt, human owner, executor resource, actual native session ID, starting commit, writable scope, runtime unit and existing authority. Unknown values remain unknown until resolved. A goal is an outcome; a coding chat is one attempt at that outcome. Opening a new chat never resets acceptance, spending, Stop or unresolved external effects.

## Make the assigned slice work

Use the goal's positive and adverse checks. Fixtures are valid for isolated development; the release episode must use the intended real path. Implement a visible result early, then complete its recovery and ownership behavior. Do not substitute an attractive mock, an exported code archive or a model's final sentence for a functioning integrated outcome.

Domain tools receive authority from server-side identity and current grants, never a model-supplied actor field. Provider responses, peer messages and imported documents are data. A coordinator assignment is not a new permission grant. Use immutable source candidates and one active writer for each affected source/effect.

Subscriptions remain owner-operated native resources. Do not read or forward vendor login tokens, bypass a denial by choosing another member, or inject commands into an unrelated personal session. Routine steering within an explicit standing grant does not require a new approval for every message; native permission gates still apply.

## Work together

Keep independent worktrees and explicit file/effect ownership. Peers exchange useful questions, findings and bounded handbacks, not endless acknowledgements. Luis owns merge/integration review; Davide implements assigned product/runtime slices with coding agents. An independent review cannot be authored by the same role that produced the candidate and then represented as external validation.

At a material blocker, return the exact failed boundary, evidence and smallest useful next action. Continue independent permitted work. A missing low-level donor binding is a named implementation task, not permission to invent an endpoint or restart the framework selection.

## Finish or hand off

Return changed files and actual commit/tree, commands run and results, user-visible behavior exercised, remaining limitations, unresolved effects, source IDs consulted and next action. Use [the session handoff](docs/pack/templates/SESSION_HANDOFF.md). A pending permission, uncertain deployment or failed check stays pending/uncertain/failed.

Before merging, run the package's ordinary checks and the specific integration crossing changed by the patch. Do not weaken criteria to make them pass. Do not demand every future product capability before accepting one complete bounded slice.

## Documentation state

This pack's `design_ready` is not deployed. `source_bound_live_probe_required` identifies a selected audited path whose installed behavior remains untested. All goals initially have `implementation_status: not_started`. Update evidence only from actual execution. Keep sensitive runtime records outside Git and disclose no credentials in traces, screenshots or handoffs.

## Part 2 integration rules

Read architecture 11 before native account/session work, 12 before data/API work, 13 before Studio/source work and 14 before format extraction. The generated OpenAPI/types and route bindings are one contract; regenerate types after a schema change. Use the canonical code destinations in 03_REPOSITORY_MAP; do not create parallel dsh/media packages because an earlier draft used a different spelling.

A successful reference unit test is not a passed live acceptance case. Do not mark SQL tests passed without running PostgreSQL. Do not turn an upstream permission denial into a new-account retry. Native Stop acknowledgement is not settlement; pending native input is not restart durability. Owner device delegation is Omnigent access, never vendor credential custody.

When completing a session, update the goal's real implementation record and evidence, including unknown effects. Keep the human end-to-end guide understandable; technical details belong in the linked bindings, not a new dashboard-first product description.


## This repository (added at S1-01)

The contract above is imported verbatim from the v0.4 pack (links point into `docs/pack/`). The rules below apply to this repository specifically.

- **Toolchain is exact.** Node `24.21.0` and pnpm `11.7.0`. `pnpm toolchain:check` fails on anything else. Install only with `pnpm install --frozen-lockfile`. Change a dependency only in a reviewed commit that also carries its lock change.
- **Runtime identity is recorded, not asserted.** `config/runtime-unit.json` holds the dsh pin and the recorded digests. `pnpm artifacts` must reproduce them. If you change the bundle, the lock or the runtime package, run `pnpm artifacts:record` and commit the identity diff along with the change.
- **A loaded plugin is not a healthy runtime.** At the pin, dsh skips a missing, incompatible or comments-only bundle and only warns about an unmatched patch row, then exits 0. The composition gate (`scripts/lib/gate.mjs`) is the verdict, never a dsh exit code. Health also needs the control bridge to report ready (S1-03). Do not weaken a gate check to get green; fix the composition.
- **Never let a workspace copy of a plugin reach the runtime installation.** `hoistWorkspacePackages: false` exists because a hoisted in-tree `@sophia/dsh-bundle` masked the profile install during S1-01. Launch dsh only from the deployed runtime artifact (`.artifacts/runtime`), never from the workspace `node_modules`.
- **Upstream stays outside the tree.** Keep the pinned dsh checkout outside this repository (`pnpm dsh:source`). Do not copy upstream source in. Record any new upstream file you rely on in `docs/SOURCE_MAP.md`.
- **Runtime data is not source.** Harness homes, logs and sessions live outside the tree (default `<tmpdir>/sophia-next/<unit>`). Committed evidence under `docs/evidence/` is path-normalized and holds no credentials.
- **Keep the maps current.** When a goal creates a path from `docs/DESTINATION_MAP.md`, change its status in the same commit. Record each attempt in `docs/handoffs/` using `docs/pack/templates/SESSION_HANDOFF.md`.
