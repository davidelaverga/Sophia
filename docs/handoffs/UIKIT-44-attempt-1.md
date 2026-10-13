# Implementation-session handoff

Goal and attempt: UIKIT-44 (the same question: words that make it another; Codex P2s on #266; Luis: «atiende los P2 en
PRs pequeñas»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/p2-same-question` from `main` at `32854caf`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`), on branch `ui/p2-same-question`; no
service code, no deploy, no contract.
Runtime unit: Luis's Windows host (node's test runner); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit follow-ups (push to `ui/*`, answer Codex's threads with a
fix commit, cancel superseded CI runs on `ui/*`); merges are Luis's, with no open P1. Spending: no paid service; CI
minutes only.
Ending commit/tree: `e2865944dfe6` (tree `63dc97ccab78`), the last commit of `ui/p2-same-question`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 5 files changed against
`origin/main` at that commit: `e2e/same-question.spec.ts`, `src/features/conversations/new-conversation.test.ts`, `src/features/conversations/new-conversation.ts`, `docs/handoffs/UIKIT-44-attempt-1.md`, `docs/plans/p2-same-question.md`. The review notes below name the commit of each later change.

## Outcome

- `sameQuestion` no longer names a conversation asking something else when the two differ by `cannot`, by an action
  and its opposite (enable/disable, include/exclude, …), by different numbers on both sides, or by «before»/«after»
  said in another order; case folds the same on every device (`toLowerCase`, not the device's locale).
- Answers threads 4250204701, 4251415861, 4249599705, 4251947540 and 4252376962 on #266.

## Evidence

- `new-conversation.test.ts`: 16 pass, 6 new (written first; each failed before its change: `cannot`, opposite
  actions, numbers, both orders, a Turkish locale standing in; round 2's two-sided pair and doubled forms). Whole Studio
  unit suite 1102/1102; lint (type-aware), typecheck and Prettier clean.
- `e2e/same-question.spec.ts` (4) with `conversations-start.spec.ts`: 7 passed (Playwright through
  `.claude-guards/safe-run.ps1`, gentle, one worker). The new browser check (a `cannot` question names nothing, the
  plain one is named) fails with `main`'s matcher in place.

## Remaining obligations

- CI on the PR; the independent review (Codex) with no open P1 before merge; its P2s go to follow-ups.

## Next bounded action

The next follow-up: the next ask's freshness (Codex P2s on #262), then the rest in `p2-abiertos-pila-kit.md`'s groups.

## Post-review (Codex on #274)

- P1 4253612023: the line is exercised in the browser (same-question.spec, «a question that turns the one asked here
  shows no line»; it fails with `main`'s matcher) and recorded above.
- `d55b5659`: an action pair said alike on both sides («enable email and disable SMS», twice) meets; one side only parts
  them (`opposed`). The doubled forms count: «stopped», «stopping» (`acts`). Tests in `fc383586`.

## Post-review, round 2 (Codex on #274)

- `2283e00c`: with both actions of a pair said on each side, each is read with the thing it is said of («enable email»,
  «disable sms»), so «disable email and enable SMS» no longer meets «enable email and disable SMS» (`aimsOf`); numbers
  inside a label part two titles («Q3» against «Q4») and a thousands separator is dropped first («1,000» meets «1000»);
  «shown», «hid» and «hidden» count as «show» and «hide» (`IRREGULAR`). Tests in `cacff536`, failing first; unit suite
  passing.

## Post-review, round 3 (Codex on #274)

- `e76cf7a8`: one reading of the turning words replaces the per-case rules (`opposed`, `aimsOf`, `ordersDisagree`,
  `numbersOf`): of each kind (orders, actions of a pair by their plain form, numbers), the words in the order they come
  must be the same, or none said on one side (`turnsOf`, `turnsAgree`). The same numbers in other places part two
  titles («tier 1 … 2» from «tier 2 … 1»); a passive voice reads as its active («email be enabled and SMS disabled»
  meets «enable email and disable SMS», actions also scored by their plain form); «before or after review» meets
  «before review or after review». Where the order differs, nothing is named, even for a reordered twin: saying nothing
  beats pointing to the inverse question. Tests in `64b2f260`, failing first; unit suite 1104/1104.

## Post-review, round 4 (Codex on #274)

- `e2865944`: with two actions of a pair or more on each side, each must keep its thing (`aimsOf`: the word after an
  action, or before a participle as a passive puts it), so «enable SMS and disable email» no longer meets «enable email
  and disable SMS», while «email be enabled and SMS disabled» still does. One action alone is left to the ordered
  reading. Test in `5ad1d490`, failing first; unit suite passing.
