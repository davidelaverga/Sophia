# Implementation-session handoff: SMC-M01, attempt 1

- **Goal:** [M01, the mission-aware companion](../missions/2026-09-27-companion-research/missions/M01_MISSION_COMPANION.md), pack v1.1. Coordination issue [#17](https://github.com/davidelaverga/Sophia/issues/17); implementation PR [#18](https://github.com/davidelaverga/Sophia/pull/18), draft.
- **Executor:** Claude Code (cloud session `https://claude.ai/code/session_01WYqdvEfR8p7mTf1Wbh1b4f`), implementer role only.
- **Branch:** `claude/upbeat-feynman-d7jskb`, from `main` `c683e6e`. The branch has no merge, rebase or force-push. It merges `main` after R00's #16 lands.
- **Writable scope:** source, migrations, tests and docs; disposable local databases. **No hosted service, schema, setting or secret was touched.** The only hosted work was Codex's read-only OP-0001.

## Verdict

**The G1–G4 candidate is ready for review. It is not merged, not released and not accepted.**
- **Built and tested locally:** the mission ledger, the exact v1.1 guide with its six operations in the bridge, and the compact mission view that replaces the brief form. Every local check passes; the progress record §2 lists them.
- **G5:** the release request is drafted but not posted ([CC-0003](../coordination/SMC-M01/SMC-M01-CC-0003.md)). The read-only checks it depends on are requested from Codex ([CC-0002](../coordination/SMC-M01/SMC-M01-CC-0002.md)).
- **Still open:**
  - hosted evidence for every case;
  - T01 and T16, which are prompt behaviour;
  - Luis's review of the Studio layout.

## Commits

| Commit | Goal |
|---|---|
| `dc2d06e` | G1: pack v1.1 installed; the contract binding frozen; the coordination channel opened |
| `551a18f` | G2: migration 0018, amendment A08, persistence and the member API |
| `39545f1` | G3: the guide loaded byte for byte and checked at start; the six operations bound to real handlers; the tool-surface check |
| `cfec301` | G4: the compact mission view in Converse; the brief form retired |
| `8a4b6a7` | G4, T17: the composer kept in reach, parity with what Sophia reads, the history styled |
| `5382575` | docs only: progress, binding notes, coordination, runbook, destination map, this handoff |
| `a0a1562` | The Codex GitHub review of #18: a note-policy or consent change moves the ledger revision, so a live guide re-reads it; the retired brief endpoint declares no success |

## Evidence

The progress record's §2 and §4 hold it: [SMC-M01.md](../progress/SMC-M01.md).
- **Checks:** `pnpm check` exit 0 (292 unit; 56 integration against the real pinned dsh, the runtime-service crossing included). `test:sql` passes for the pack and for the repository (18 migrations). `test:db` 179/179.
- **Rollback:** production's code at `0391bc6` passes its own `test:sql` and `test:db` (147/147) on 0001–0018.
- **T17:** checked in a browser against the real API, including keyboard and the manual controls.
- **Hosted facts:** from OP-0001 (CX-0001 to CX-0003), checked against CC-0001.

## Decisions and changes

- **The fixed parts are unchanged.** The six model-facing names, the authored prompt and the skill are as the pack has them; nothing in them needed a versioned amendment.
- **Where the implementation differs from the binding,** [binding §10](../progress/SMC-M01-contract-binding.md) records it, with the reason:
  - the `proposal` column;
  - `correctsEntryId`;
  - consent for voice proposals;
  - the status mapping;
  - no spoken refresh notice;
  - write retries.
- **The Studio view also shows** accepted constraints and lessons and the recent decisions, because Sophia's `project_status` has them.
- **Deploy order:** schema first, then the API and the bridge back to back with nobody in a call, then the Studio. The runbook's M01 notes explain why.

## Remaining obligations

| Item | State |
|---|---|
| SMC-M01-OP-0002 (CC-0004, revision 2 of CC-0002) | requested; read only; waits for Davide to wake Codex. No unknown effect |
| SMC-M01-OP-0003 (CC-0003), rev 1 | drafted in the PR, not posted, not approved. It needs the merged commit, CX-0004 and #16 |
| Luis's review | the Studio layout and interaction (`apps/studio/src/features/mission/`, `theme.css`) |
| Merge | after #16; then merge `main` into the branch, and rerun `pnpm check`, `test:sql` and `test:db` |
| Layout at 200% zoom | predates M01 (the room stage's geometry). A follow-up for the layout's owner; not in M01 |
| Retained data, active jobs, stopped epochs | none |

## Next bounded action

1. **When Codex answers CC-0004** (CC-0002's revision 2; CX-0004 on #17, with a pointer on #18): check each finding against the question it answers, fix the real ones with tests, and record the rest.
2. **When #16 has merged:** merge `main`, rerun the checks, fill CC-0003 with the final reviewed commit, and post it for Davide's decision.

A new session continues this mission from the progress record and #17; it does not start a new one.
