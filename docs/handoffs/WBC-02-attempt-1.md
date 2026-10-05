# Implementation-session handoff

Goal and attempt: WBC-02 (SCM-01), one Paperclip-managed source review in Tasks; attempt 1  
Human owner / executor resource: Davide (backend and product decisions); Claude Code in a cloud container (linux-x64), Davide's request of 2026-10-05 ("implement the paper clip mission end to end and create a pr; Codex will be the reviewer, deployer and tester")  
Native session: this Claude Code session; no Sophia native session was created  
Starting worktree/commit: `main` at `ed6f3cd` (#101), rebased onto `4ded47a` (#102) before publication  
Ending commit/tree and changed files: branch `scm-01/workboard-source-review`, the PR's head; ordered commits: contracts, G1 packages, G2/G4 backend, G3 runtime, G5 Studio, docs

## Outcome

Works locally, end to end: propose a source review under a goal, decide it, one commission becomes one Paperclip issue through the `sophia.coordination` plugin, the `sophia_dsh` adapter is permitted and starts the one attempt through Sophia's native path, the reviewer (`sophia-source-review-v1`) reads only its manifest, is metered per call (eight at most) and publishes an immutable, structurally checked review; the board shows it Complete and opens it at its exact version. Hold, Resume, Stop, a Paperclip cancel (→ Hold), a lost commission reply, a lost result reply, a withdrawn input and a turn without a result each settle where Sophia's records say. INT statuses: [docs/progress/WBC-02.md](../progress/WBC-02.md): 14 pass, 4 partial (INT-01 live load, INT-12 outage, INT-13 membership revocation, INT-14 replay), 2 not run (INT-19, INT-20).

Not verified: a real Paperclip instance, a real provider call, any hosted service.

## Evidence

- `pnpm check` (integration gate 84 pass, 0 fail, 2 skipped for want of a disposable database URL) and `pnpm test:db` (472 pass) on the final tree.
- `apps/api/src/coordination.db.test.ts` (12, real PostgreSQL through the API, the worker's coordinator, the plugin in process and the adapter's `execute`), `packages/paperclip-plugin/src/coordination.db.test.ts` (21), adapter and Studio unit tests.
- `tests/integration/review-tools.test.mjs` (the reviewer through the real pinned dsh, Responses stub) and the research suite unchanged.
- `scripts/paperclip-build.mjs` (bindings typecheck against the pin) and `scripts/paperclip-verify.mjs` (the built worker under the pin's own harness).
- [Mutation checks](../evidence/WBC-02/mutations.txt), [browser captures](../evidence/WBC-02/README.md).

## Decisions and changes

See the decisions table in [docs/progress/WBC-02.md](../progress/WBC-02.md#decisions-and-their-reasons). Preserved: the research roles, route, presets and compaction; the mission ledger; the source abstraction; WBC-01's board rules (a plan only proposed stays read only); M03's registry entries. Reserved after reading every remote branch: migration `0038`, amendment `A12`, runtime unit `sophia-runtime-wbc02-dev`. Shared files changed additively: `config/specialists.json` (a new role, no older preset broadened), the dsh bridge (review tools and metering beside research), `ProjectShell.tsx`/`GoalList.tsx` (the served plans and the entry). No new authorization was assumed: no deployment, schema application, paid probe or infrastructure.

## Remaining obligations

- Davide: D1–D5 in [WBC-02-CC-0001](../coordination/WBC-02/WBC-02-CC-0001.md) (route and payer, limits, Paperclip hosting after Codex's cost quote, the WBC-02 thread).
- Codex: review and reproduction; then only the authorized operations, in the release order of `deploy/paperclip/README.md`.
- Luis: the Studio binding (the pilot entry, and the admission answered there while no plan is in force).
- Nothing active, no retained secret, no uncertain effect: this session made no remote effect besides the push and the PR.

## Next bounded action

Codex reviews the PR head per CC-0001 §1. Davide answers D1–D5 and assigns the WBC-02 thread; Claude then reconciles findings on this branch.
