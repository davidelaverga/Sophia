# Implementation-session handoff

Goal and attempt: UIKIT-52 (records brought to what was delivered; Codex P2s on #240, #245, #247, #248, #251, #252,
#260; Luis: «atiende los P2 en PRs pequeñas»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/p2-records` from `main` at `32854caf`
Writable scope: this worktree only (`docs/plans`, `docs/handoffs`), on branch `ui/p2-records`; no code, no service, no
contract.
Runtime unit: none beyond Prettier (records only); CI as the run on record.
Existing authority: Luis's standing instructions for the kit follow-ups (push to `ui/*`, answer Codex's threads with a
fix commit); merges are Luis's, with no open P1. Spending: CI minutes only.
Ending commit/tree: `60549ef8485b` (tree `c999fe4ef82b`), the last commit of `ui/p2-records`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 10 files changed against
`origin/main` at that commit: `docs/handoffs/UIKIT-18-attempt-1.md`, `docs/handoffs/UIKIT-25-attempt-1.md`, `docs/handoffs/UIKIT-29-attempt-1.md`, `docs/handoffs/UIKIT-30-attempt-1.md`, `docs/handoffs/UIKIT-36-attempt-1.md`, `docs/handoffs/UIKIT-52-attempt-1.md`, `docs/plans/light-breath.md`, `docs/plans/needs-api.md`, `docs/plans/p2-records.md`, `docs/plans/section-heads.md`. The review notes below name the commit of each later change.

## Outcome

- Seven records of merged kit PRs describe what was delivered (see `docs/plans/p2-records.md`).
- Answers threads 4250221823 (#240), 4249614267 (#245), 4250192126 (#247), 4251415599 (#248), 4250200889 (#251),
  4250190517 (#252) and 4249581703 (#260).

## Evidence

- Prettier clean on the changed records; each correction checked against the code or the merged branch it describes
  (MessageActs' `overtaken` status and conversation-acts.spec's three writes; signin-lede.spec's widths; the
  conversations' `--type-head` rules; the light's stacking; the merged head of #252; eyebrows.md's 0.63 px; A15's
  kinds, seen route and `last_seen_turn_seq`).

## Remaining obligations

- The independent review (Codex) with no open P1 before merge.

## Next bounded action

The remaining follow-ups: the lens and the addressed needs; the small ones (Updates' filter, the clipboard, the day
label, Recent per viewer, DOM-safe ids, the tracking check).

## Post-review (Codex on #282)

- The ending commit, tree and files recorded from the branch (P1 4253988982), as every handoff records them.
- `25252d61`: needs-api.md's other summaries brought to the merged A15 too: «The amendment» (four kinds, `work_decision` ·
  `work_wait` · `lobby_entry` · `personal_turn` with `within`, only a decision expiring, the seen POST), «What the Studio
  does now» (four needs in the fixture, the reply's seen mark) and «Left» (marking read is in the amendment).
- `60549ef8`: the merged need identity, `<kind>:<projectId, or personal>:<ref.within, or ->:<ref.id>`, and `ref.resourceId`
  for a permission's request (round 2, Codex on #282).
