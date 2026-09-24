# Implementation-session handoff: S1-01, attempt 1

- **Goal and attempt:** S1-01 "Create the new repository and reproducible
  runtime source unit", attempt 1.
- **Human owner / executor resource:** Davide (owner). The executor is
  Claude Code in a cloud session
  (`https://claude.ai/code/session_01SZcmFfZSVsw7qftzyaDZTm`), acting on
  Davide's chat request to execute mission 1 and create the repository.
- **Native session:** none. S1-01 creates no dsh Agent session. The boots
  in this attempt compose and load plugins only.
- **Starting worktree/commit:** new repository with no base. Sophia-Agent
  stayed at `b489ac0be4a3ee3d5acd69e2fd05ba20a1d5bbd7` with a clean tree;
  this attempt made no change there.
- **Writable scope:** this repository only.
- **Runtime unit:** `sophia-runtime-s1-01`
  ([config/runtime-unit.json](../../config/runtime-unit.json)).
- **Existing authority / cumulative allowance:** no provider credentials,
  no model calls, no paid APIs. Usage was network egress to npm, GitHub and
  nodejs.org only. No allowance was set or consumed.
- **Ending commit/tree:** code at `b7798432b773b086ff3f47a6acce139ef530e32f`
  on `claude/mission-1-repo-setup-yjjjn2`. The commit that adds this handoff
  and the final evidence follows it and changes only `docs/`.

## Outcome

A developer can clone this repository, run
`pnpm install --frozen-lockfile && pnpm check`, and get:

- the exact toolchain;
- the pinned dsh launcher deployed as an identified runtime artifact;
- the Sophia bundle as a byte-reproducible archive;
- the `sophia-runtime` profile installed through the official launcher and
  verified by a composition gate that rejects every adverse case;
- the runtime booting with the Sophia row loaded and reporting `not_ready`.

No version has to be guessed.

| Acceptance requirement | Evidence | State |
|---|---|---|
| A clean second checkout resolves the same lock and artifact identities | [second-checkout.log](../evidence/S1-01/second-checkout.log): fresh clone of `b779843`, **empty pnpm store**, `pnpm install --frozen-lockfile` then `pnpm check`. Result: lock unchanged; runtime artifact (linux-x64), dsh release integrity, bundle archive sha256 and sha512, workspace lock and profile lock all `match`; 19/19 unit and 12/12 integration tests pass | **met** (linux-x64) |
| The profile includes dsh-base and the Sophia bundle, not another root loop | [dump-config.yml](../evidence/S1-01/profile/dump-config.yml) (92 base rows + `sophia-control-bridge`, every row labelled by source layer); [gate.json](../evidence/S1-01/profile/gate.json) (all six checks ok); [installed-profile/package.json](../evidence/S1-01/profile/installed-profile/package.json) | **met** |
| The document source map and code destination map are committed, with unbuilt paths still labelled | [SOURCE_MAP.md](../SOURCE_MAP.md), [DESTINATION_MAP.md](../DESTINATION_MAP.md), enforced by `tests/unit/destination-map.test.mjs` | **met** |

| Adverse check | Test (`tests/integration/profile-gate.test.mjs`) | What upstream does at the pin | Sophia gate |
|---|---|---|---|
| Missing Sophia bundle is not a healthy runtime | `adverse: a missing Sophia bundle…` | dump exits 0, bundle skipped | `bundle_missing`, `bridge_row_missing` |
| Incompatible Sophia bundle is not a healthy runtime | `adverse: an incompatible Sophia bundle…` | dump exits 0, bundle skipped | `bundle_incompatible` |
| Comments-only patch is diagnosed | bundle patch and profile patch cases | bundle: skipped, exit 0; profile: exit 1 | `patch_comments_only` (+ `dump_failed`) |
| Wrong-row patch is diagnosed | `adverse: a wrong-row patch…` | warning only, exit 0 | `patch_unmatched_row`, `required_disable_missing` |
| Also covered | empty `[]` bundle patch; a second root loop (headless bundle); wrong archive bytes; bundle shadowing from the installation | silent or accepted | `patch_no_rows`, `foreign_root_loop`, `bundle_archive_mismatch`, `bundle_shadowed` |

"Healthy" additionally requires the control bridge to report ready, which is
S1-03 work. Every S1-01 runtime therefore reports `healthy=false`, and the
reason list keeps composition failures separate from
`bridge_not_ready`.

## Work sequence, as executed

1. **Separate repository; preserve the existing app.** Created locally,
   with a base commit on `main` and the work on
   `claude/mission-1-repo-setup-yjjjn2`. Creating the GitHub repository from
   the session failed: `POST /user/repos` returned `403 Resource not
   accessible by integration`. Davide then created `davidelaverga/Sophia`
   (see Remaining obligations). Sophia-Agent is unchanged.
2. **dsh pin outside the tree; toolchain; lock.** The checkout of
   `46a7f68b` sits outside the product tree, and the tag
   `dsh-v0.1.7-rc.1` resolves to it
   ([dsh-source.json](../evidence/S1-01/dsh-source.json)). Node `24.21.0`
   (official tarball, SHA-256 verified) and pnpm `11.7.0`. `pnpm-lock.yaml`
   is committed. Dependency install scripts are denied unless listed: allowed
   are the koffi and node-pty prebuild fetchers and dsh's spawn-helper
   fix-up; denied are `@google/genai` and `protobufjs`.
3. **Workspace packages, bundle exports, artifacts, digests.**
   `@sophia/dsh-bundle` (manifest `dsh.bundle.patch`, `cordis.patch.yml`,
   plugin entry) and `@sophia/dsh-runtime`. Recorded:
   - runtime artifact `sophia-tree-v2:sha256:0b6991d1…7771` (linux-x64);
     it was `sophia-tree-v1:sha256:11ccc202…df19` at `b779843` (see below)
   - bundle archive sha256 `f0698952…4b0f`;
   - dsh / dsh-base release sha512 integrities, matching the registry.
4. **Profile install, trusted dump, startup diagnostics.**
   `dsh plugin --profile sophia-runtime install --frozen-lockfile --offline`
   into an isolated `DSH_HOME` with a sanitized environment. `--dump-config`
   is retained. A 10 s boot stayed up, loaded the Sophia row, opened no
   TCP/UDP socket and exited 0 on SIGTERM
   ([boot.json](../evidence/S1-01/profile/boot.json)). The required-failure
   path writes and retains `$DSH_HOME/logs/startup-*.log` (integration test).

### Commands actually run (final state)

```text
pnpm install --frozen-lockfile                      # also with --store-dir <empty> in the second checkout
pnpm check                                          # toolchain → typecheck → unit → artifacts → integration
pnpm artifacts:record                               # identities written; then `pnpm artifacts` reproduces them
pnpm profile:install --force --boot 10 --evidence docs/evidence/S1-01/profile
SOPHIA_DSH_SRC=<outside tree> node scripts/dsh-source.mjs --verify-release --evidence docs/evidence/S1-01/dsh-source.json
python3 docs/pack/scripts/validate_pack.py          # 0 errors, 0 warnings
```

Source-register ids consulted: DSH-01, DSH-02, DSH-03, DSH-04, DSH-05,
DSH-19, DSH-20 (see [SOURCE_MAP §2](../SOURCE_MAP.md)).

## Decisions and changes

- **Runtime artifact = npm release from the pinned tag, not an upstream
  source build.** The full upstream build was blocked: its lock fetches
  `xlsx` from `cdn.sheetjs.com`, and the egress policy returned 403. The
  release was instead verified against the pin. Across 267 package entries,
  846 shipped static files are byte-identical to the pinned source and none
  differ. Built JS was not compared. An environment that can reach
  `cdn.sheetjs.com` should attempt the source build and compare.
- **Composition gate in Sophia code.** Upstream exits 0 for most adverse
  cases (SOURCE_MAP §3.1).
- **`hoistWorkspacePackages: false` + launch only from the deployed
  artifact.** A hoisted workspace bundle masked the profile install
  (SOURCE_MAP §3.2). This was found and fixed during this attempt, and the
  gate now checks for it.
- **Location-independent, per-platform runtime digest.** The first
  second-checkout run failed on `dsh.artifact_digest` because the
  deploy-local lock embeds absolute paths. Fixed in `94f0e5f` and re-proven.
  The digest is keyed by platform because native prebuilds differ by
  platform.
- **Tree digest v2 after the first GitHub CI run.** On the ubuntu-24.04
  runner, everything reproduced except the runtime digest: 32089 entries
  against 32094 recorded. The runner's tree was exactly this environment's
  tree deployed with `--ignore-scripts`. The dependency install scripts
  change no file content here; they only leave five empty scratch
  directories (`node_modules`, `node_modules/.tmp`) on some hosts.
  `sophia-tree-v2` digests files and symlinks only, which makes the scripted
  and unscripted trees identical. The earlier second-checkout evidence
  (`second-checkout.log`) is the v1 result at `b779843`. The GitHub CI run
  on this PR is the cross-host reproduction for v2.
- **`TMPDIR` pinned inside the install.** dsh's spill directory had leaked
  into the shared `/tmp`.
- **Bridge row declares no `inject` yet.** The pack's specimen lists
  `[agents, sessions, tools]`. Those service names were not verified at the
  pin in this attempt, so S1-03 adds them when it implements the bridge,
  rather than S1-01 guessing them.
- **Design specimens copied, not installed.** `config/models.json`,
  `roles.json` and `supervision.json` come from the pack unchanged.

## Remaining obligations

- **Repository and push.** The session's GitHub App could not create
  repositories, so Davide created
  [`davidelaverga/Sophia`](https://github.com/davidelaverga/Sophia) with
  its own initial commit. That commit was merged into the S1-01 branch
  rather than rewriting history, so the hashes cited here stay valid. No
  names inside the repository were changed. The branch goes to Luis for
  integration review as a draft PR. CI (`.github/workflows/ci.yml`) had not
  run on GitHub before that PR, so its first run is outstanding evidence.
- **Other platforms.** Only linux-x64 is recorded and proven. On macOS,
  `pnpm artifacts` reports `UNRECORDED` until someone records that platform
  in a reviewed commit. The bundle archive's byte identity under macOS zlib
  has not been observed.
- **Omnigent, Google SDK and LiveKit pins** are carried from the pack but
  not installed (`installed: false`).
- **No runtime data retained in Git.** Local Harness homes under
  `<tmpdir>/sophia-next/` are disposable.

## Next bounded action

- **S1-02** (Luis): the first schema/UI slice, which adds `packages/contracts`,
  `packages/domain`, `packages/persistence`, `apps/api` and `db/migrations`
  to this workspace. Update the DESTINATION_MAP rows in the same commit.
- **S1-03** (Davide): implement `packages/dsh-bundle/src/control-bridge.ts`
  over the public Agent interface. Verify the service names to inject at the
  pin (DSH-08–DSH-10). Make `readiness()` report `ready` only after the
  required services and policy listeners are registered. After that the gate
  can report `healthy=true`.
