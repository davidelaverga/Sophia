# Implementation-session handoff

Goal and attempt: UIKIT-37 (the next ask: once Sophia has answered, the field proposes what comes next and Tab takes it;
informe-inteligencia #1 with the shared piece; Luis: «Making it smart… Procede»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/next-ask` from `ui/polish-eyebrows` (stacked on
PR #260 → #259 → … ; the base retargets as each merges)
Writable scope: this worktree only (`apps/studio`, `packages/ui`, `docs/plans`, `docs/handoffs`), on branch
`ui/next-ask`; no service code, no deploy, no contract.
Runtime unit: Luis's Windows host (the fixture dev server on :5197; Playwright through `.claude-guards/safe-run.ps1`,
2 workers); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit stack (push to `ui/*`, answer Codex's threads with a fix
commit, cancel superseded CI runs); merges are Luis's, with no open P1. Spending: no paid service; CI minutes only.
Ending commit/tree: `405e1b97` (12 files: `packages/ui` `next-ask-key.ts` + test,
`NextAskHint.tsx`, `index.ts`; studio `next-ask.ts` + test, `useNextAsk.ts`, `ConversationComposer.tsx`,
`OpenConversation.tsx`, `conversations.css`, `theme.css`, `e2e/next-ask.spec.ts`) and `docs/plans/next-ask.md`; the
commit after it adds only this handoff. A squash on merge gives the work an id this file cannot know.

## Outcome

- Once Sophia has answered, the empty field's placeholder is the next ask, with a key cap «Tab» beside «Ask Sophia»
  whose tip says why («Because it is proposed and not decided»). Tab (or → at the empty field) puts the words in the
  field with «Ask Sophia» on; Enter sends them. Esc puts it away: the field is quiet until her next answer, and that
  suggestion does not come back in the conversation while the page lives. With words written, Tab is Tab.
- Which ask: a proposal waiting in the brief, then «What’s still open?» while the conversation has open questions, then
  «What did we decide?» while the brief has decisions, then «Sum it up»; the first not asked lately (the viewer's last
  six messages) nor put away; a summary counts as having said what was decided. Nothing fits: nothing is suggested.
- The quick asks drop those asked lately and the one suggested (after «Sum it up», only «What’s still open?» is left);
  the row keeps its height when it empties.

## Evidence

- `next-ask.test.ts` (studio, 9) and `next-ask-key.test.ts` (ui, 4): 13 pass.
- `e2e/next-ask.spec.ts` (5) with conversations-find, project-conversations-writes, conversation-acts,
  conversations-answers and widths: 41 pass locally through the guard. Lint (type-aware) and typecheck clean.
- Captures `evaluacion-2026-10-12/inteligencia/next-ask-{dark,light}.png`: the key cap's middle on the field's line
  (696 = 696 in both themes).

## Decisions and changes

- The suggestion is the placeholder, not an overlay: no second text layer to keep in step with the field's wrapping, the
  browser's own placeholder ink, and a description (`aria-describedby`) that says the suggestion and the keys.
- Accepting turns «Ask Sophia» on: the suggestions are asks of her, as the quick asks are.
- Esc quiets the field until her next answer: showing the next candidate at once read as nagging.
- From the Studio's own reads (the thread, the conversation's open questions, the brief through the context pane's
  query); never presented as Sophia's words. A `next` from the service would use the same piece.

## Remaining obligations

- Watch CI for `next-ask.spec.ts`; the independent review (Codex) with no P1/P2 before merge. The base is
  `ui/polish-eyebrows` until #260 merges.

## Next bounded action

informe-inteligencia #2 («Next» after resolving something, with the focus that falls to `body` after answering a
decision on the board), then #3 (the palette that knows) and #5 (a question mark offers «Ask Sophia»).

## Post-review (Codex on #265, which builds on this)

The field's suggestions are quiet while a message is on its way, sending or held with no reply (`props.held !== null ||
busy`), not only once held unconfirmed: a Tab during a send could change «Ask Sophia» for a message already sent
without her.

## Post-review (Codex on #262)

- An ask put away stays out of the quick asks too (`quickAsks(asked, suggestion, putAway)`, unit-tested).
- Recency reads the viewer's own last six: while the loaded pages hold fewer, `olderAsks` reads earlier pages (at most
  four, stopping at six of theirs; unit-tested with a fake reader), and nothing is proposed while it reads.
- The field's description says why the suggestion is there, as the tip does for the pointer; next-ask.spec reads it.
- What was put away is kept per account and conversation, so another account on this browser starts afresh.
