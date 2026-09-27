# Sequence, ownership and integration boundaries

## 1. Strategy

Keep three reviewable product PRs, with staged commits and evidence checkpoints inside each. Use R00 to integrate the current voice foundation. The brief is a known temporary product choice, not a reason to discard that working foundation.

```text
R00 reviewed foundation integrated into main
    ├── M01 mission companion and continuity ─┐
    └── M02 runtime qualification/binding ───┼── M03 research, artifacts, voice and learning
                                           ┘
Default merge/release order: M01 → M02 → M03
```

M01 and M02 can be developed concurrently from the integrated foundation because the Live mission guide does not require a native harness upgrade. M03 can prepare fixtures and renderer code early, but new research admission is enabled only on the tested combined M01+M02 base. A deliberate scheduling change can land M02 before M01 when that reduces conflicts; M03 still depends on both. Do not create another integration stack casually: a main-based PR per mission is the default.

After every preceding merge, integrate the actual new main, re-run affected checks and record the new candidate. Do not claim a prior SHA's tests cover a materially different candidate. Never rebase/force-push another contributor's active branch without that owner's explicit coordination.

## 2. Precise ownership

| Surface | M01 owns | M02 owns | M03 owns |
|---|---|---|---|
| Guide behavior | Core guide prompt, mission lifecycle skill, notes/confirmation behavior | Preserve; ensure changed runtime does not broaden it | Research capability descriptions and result discussion |
| Project context | Canonical mission/notes/decisions read/write; minimal context compiler | Preserve source identity at restore | Research-specific packet and evidence/result links |
| Live bridge/API | Mission tool contracts and note-policy/attribution integration | No unrelated media/provider upgrade | Research admission, safe event delivery, qualified context-update improvement |
| Studio | Remove brief form; compact mission/notes view; optional text | Regression only | Generic work/artifact projection; real Markdown/PDF viewers |
| Native runtime | Consume existing substrate only where necessary | Version/locks/patch closure, public preset mounting, guard/identity/recovery parity | Real research presets, tools and execution policies using M02 seam |
| Database | Authored append-only mission/notes migration(s) | Only compatibility metadata genuinely required by runtime binding | Authored research/result/format/source/budget migration(s) |
| Operations | Codex applies approved hosted changes | Codex qualifies target host and performs approved cutover | Codex provisions only approved renderer/source settings and releases |

Do not let M01 rewrite the dsh upgrade lockfiles or let M02 rewrite mission UX. M02 may touch `control-bridge.ts`, `role-registry.ts`, runtime wire/config and generated identities; M03 integrates after that seam is frozen. Shared generated contracts and migration numbers have one nominated writer at a time.

## 3. Goal granularity

Each mission has bounded goal sessions, one PR by default, and explicit checkpoints before spending or deployment. A session is not a calendar period. End it when its deliverable is verified; do not keep an agent running for days to manufacture evidence.

A large implementation can have several commits and fresh Claude/Codex sessions without resetting mission scope, budget, unresolved failures or approval. Carry the same mission ID and updated handoff. A serious finding may justify a small corrective PR, but do not merge incomplete privacy/control behavior merely to preserve a three-PR count.

## 4. Readiness vocabulary

- **Source-ready:** implementation and applicable local/CI evidence are available for review.
- **Merge-ready:** target/base, review, checks, compatibility and merge effects are verified for the exact candidate; owner approval remains distinct.
- **Release-ready:** exact artifacts, migrations, environment binding, recovery, smoke plan and bounded operations authority are ready.
- **Hosted-verified:** actual deployment tuple and required tests were observed.
- **Product-accepted:** Davide accepts the specified user episode; unresolved narrower obligations remain explicitly open.

These are evidence states, not five administrative departments. One compact handoff can report all five. A model saying “done” or a green CI run cannot substitute for the missing state.

## 5. What “memory update” means in M01

It means project continuity: canonical mission state, attributed notes, decisions, original expectations, outcomes, blockers and scoped lessons, with a current context view. It does not mean importing private personal memories, migrating to a new database product, copying old session histories indiscriminately, or silently storing raw room transcripts.

M01 supplies the minimal seam consumed by M03. Broad project import/search and the full S1-08 knowledge scope remain open unless separately evidenced. The current work goal/domain records remain the task authority; a mission ledger is not a competing task manager.

## 6. Existing plan crosswalk

| Packet scope | Existing plan relationship |
|---|---|
| R00 | Close/reconcile S1-05A integration and remaining evidence, plus Luis's reviewed dependency stack. |
| M01 | Targeted increments of S1-05 and S1-08; mission guidance aspect of S1-11 without claiming a full lead implementation. |
| M02 | S1-01/S1-03 runtime release-unit maintenance and public bridge qualification. |
| M03 | Narrow research portions of S1-05/S1-08 and renderer/artifact portions of S1-13; returning-session proof. |

Add a current amendment/readme link instead of erasing unmet criteria in frozen specs. The new scope supersedes brief-as-primary-product acceptance, not the underlying durability, attribution, privacy or cancellation obligations.
