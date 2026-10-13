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
Ending commit/tree: `8822e4965938` (tree `fc1ab94867a6`), the last commit of `ui/p2-same-question`'s own that changes code (later
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

## Post-review, round 5 (Codex on #274)

- `86c0ef3d`: orders and numbers keep their thing as actions do, two of a kind or more on each side (`aimsOf` with a reader
  per kind): «before approval and after review» parts from «before review and after approval», «Q1 costs … Q2 revenue»
  from «Q1 revenue … Q2 costs». Test in `aa2e1460`, failing first; unit suite 1106/1106.
- Declined, by design (4253918594): a thing of more than one word across a change of voice («enable incoming email»
  against «incoming email be enabled») is read as another question. Binding phrases across voice needs a parse this
  matcher does not attempt; the form errs to silence, never to pointing at the inverse question, and Start is always
  one press away.

## Post-review, round 6 (Codex on #274)

- `5ccb9a05`: the thing a turning word keeps is read as the scoring reads words (`plainWord`: an action as its plain form,
  a final «s» dropped), so «emails … texts» meets «email … text» and «Q1 revenues … Q2 costs» meets «Q1 revenue … Q2
  cost». Test in `7e28ca4a`, failing first.

## Post-review, round 7 (Codex on #274)

- `8d775cf9`: a negation, an order or an action said on each side keeps its thing even when said once («not red» against
  «not blue», «before approval» against «before review»); numbers still from two on each side. Only a comma is a
  thousands separator: «1.234» stays a decimal. Tests in `c3d211e8`, failing first. Two positive controls moved to a
  one-word thing (a passive with «password input fields» or «email notifications» now reads as another question:
  round 5's declared limit, the form erring to silence).

## Post-review, round 8 (Codex on #274)

- `f31c79a3`: a participle is read as a passive only after a form of «be» (a past tense alone is active: «Admins enabled
  dark mode?» meets «Did admins enable dark mode?»); a contracted «n't» is read as a «not», and a negation reaches past a
  verb to its thing («don't use red» against «don't use blue»). Tests in `a0a9ba39`, failing first.
- Where this matcher stands: eight rounds of the reviewer's cases, each fixed with a check. It is a heuristic that errs
  to silence; further cases of the same kind are expected and are best weighed against what a missed or a wrong
  «Already asked here» costs (Start is always one press away).

## Post-review, round 9 (Codex on #274)

- `be4081bf`: a number keeps its sign («-5» is read as «minus5», not «5»). Test in `f0f34cc5`, failing first.

## Post-review, round 10 (Codex on #274): one gate, word for word

- `814c63f1`: the per-kind bindings of rounds 4 to 9 (each turning word tied to a word near it) are replaced by one gate:
  with turning words on both sides (a negation, an order, an action of a pair, a number), two titles are the same
  question only if their own words come in the same order (each once, numbers kept). Every inverse the review found
  passes no more; spelled-out numbers («one», «two»…) count as numbers. Tests in `7dfaabe1`.
- The price, chosen: a paraphrase with turning words (a passive, another word order) reads as another question, so the
  form says nothing: «Should email be enabled and SMS disabled?» no longer meets «Should we enable email and disable
  SMS?» (round 3 had made it meet, 4253818726), nor «Revenue forecast for 2025» «2025 revenue forecast». A missed
  suggestion costs a press (Start is there); a wrong one points to the inverse question.

## Post-review, round 11 (Codex on #274)

- `da96881d`: a negation keeps its place in the ordered words; a decimal («1.2») is one number; spelled-out quantities up to ninety, a hundred, a thousand and a million count. Tests in `6a1b93af`, failing first.

## Post-review, round 12 (Codex on #274)

- `5a18d51e`: only a word said twice running is said once in the ordered words; said again later, it keeps that place («enable SMS and disable email» against «enable email and disable SMS» after «For email and SMS»). Ordinals (first…twelfth) are numbers. Tests in `8c9d2053`, failing first.

## Post-review, round 13 (Codex on #274)

- `b37a4b5d`: object pronouns (me, us, you, him, her, them, it) keep their place in the ordered words; a spelled ten then unit («twenty one») is one number, as «21» is. Tests in `4fd152e1`, failing first.

## Post-review, round 14 (Codex on #274)

- `248d97ff`: a spelled number composes with its scale («one hundred» 100, «two thousand» 2000); a spelled ordinal reads as the figure is written («first» 1st, «second» 2nd, «third» 3rd). Tests in `8a0a840e`, failing first.

## Post-review, round 15 (Codex on #274)

- `7c1b1603`: tens and units said right after a scale are added to it («one hundred twenty one», 121); «100 and 20» stays two numbers. Tests in `706652ce`, failing first.

## Post-review, round 16 (Codex on #274)

- `354785d9`: «cannot», «can't» and «won't» read as «can not» and «will not»; only spelled number words compose (marked while composing), so figures apart («20-1») stay apart. Tests in `a7209733`, failing first.

## Post-review, round 17 (Codex on #274)

- `8822e496`: spelled numbers are parsed as they are said (`spelledNumbers`, `valueOfRun`): runs of units, tens and scales, nested scales included («one thousand five hundred» 1500), «and» only after a scale, words that do not continue a number starting a new one («one two»); any ordinal made of a cardinal («fourteenth» 14th, «twentieth» 20th, «twenty first» 21st). A «not» said twice running is kept twice. Replaces rounds 13 to 16's composers. Tests in `8b242d05`, failing first.
