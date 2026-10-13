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
Ending commit/tree: `d6b01dd832ba` (tree `e8feb2e57acb`), the last commit of `ui/p2-records` that changes a record other than this
handoff (the records this PR corrects are handoffs too, so the usual rule could not tell them apart). 10 files
changed against `origin/main` at that commit: `docs/handoffs/UIKIT-18-attempt-1.md`, `docs/handoffs/UIKIT-25-attempt-1.md`, `docs/handoffs/UIKIT-29-attempt-1.md`, `docs/handoffs/UIKIT-30-attempt-1.md`, `docs/handoffs/UIKIT-36-attempt-1.md`, `docs/handoffs/UIKIT-52-attempt-1.md`, `docs/plans/light-breath.md`, `docs/plans/needs-api.md`, `docs/plans/p2-records.md`, `docs/plans/section-heads.md`.

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
- `98189613`: «What the Studio does now» routes as `VIEW_OF` does, no review (round 3, Codex on #282).
- `b0c04d3c`: two more points for the service in needs-api.md (the cursor's read-based transition still in A15's text; the need id's injective encoding), and section-heads.md's checks said as they assert (round 4, Codex on #282).
- `a9c1d444`: a permission opens its task until Resources is served (round 5, Codex on #282).

## CI on record

- Run 38338054881 on `69dbfafb`: all jobs green, the browser suites among them. The corrections after it (round 6 on,
  records only) have no run of their own recorded yet; no code changed in this PR.
- `d6b01dd8`: UIKIT-36's outcome gives the day label's 10.5 px and 0.63 px beside the 12 px labels' 0.72 px (round 6, Codex on #282).
