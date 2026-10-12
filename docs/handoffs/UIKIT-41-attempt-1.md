# Implementation-session handoff

Goal and attempt: UIKIT-41 (the same question: before starting one, the conversation that already asks it;
informe-inteligencia #6; Luis: «Procede»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/same-question` from `ui/question-asks`
(stacked on PR #265 → #264 → … ; the base retargets as each merges)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`), on branch `ui/same-question`; no
service code, no deploy, no contract.
Runtime unit: Luis's Windows host (the fixture dev server on :5197; Playwright through `.claude-guards/safe-run.ps1`,
2 workers); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit stack (push to `ui/*`, answer Codex's threads with a fix
commit, cancel superseded CI runs); merges are Luis's, with no open P1. Spending: no paid service; CI minutes only.
Ending commit/tree: `f06f808d2230` (tree `68af36ff34b9`), the last commit of `ui/same-question`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 10 files changed against
`ui/question-asks` at that commit: `e2e/same-question.spec.ts`, `src/features/conversations/ConversationsView.tsx`, `src/features/conversations/NewConversation.tsx`, `src/features/conversations/conversations.css`, `src/features/conversations/new-conversation.test.ts`, `src/features/conversations/new-conversation.ts`, `src/features/conversations/same-question-view.test.ts`, `src/features/conversations/same-question-view.ts`, `docs/handoffs/UIKIT-41-attempt-1.md`, `docs/plans/same-question.md`. The review notes below name the commit of each later change.

## Outcome

- Starting a conversation, a question that reads like one already asked here shows «Already asked here: “Short or long
  briefs?” →» under the field; its press opens that conversation (the draft stays). Start stays one press away.
- Like (`sameQuestion`, pure): the question's own words (folded, accents off, three letters or more, common words out, a
  final «s» dropped) against each title; at least two shared and 60 % of the question's; the most shared, then the
  newest. Not while the form is held.

## Evidence

- `new-conversation.test.ts` (8, four new: the same question in any order of words; nothing for one shared word,
  common words or too few; the most shared, then the newest; a negation or an opposite order is another question)
  and `same-question-view.test.ts` (1, new: the line's words): pass. Lint (type-aware) and typecheck clean.
- `e2e/same-question.spec.ts` (3: named, and its press opens it, from the keyboard too; an unrelated question shows
  nothing; @phone, a long title with no break wraps inside the form) written; not run locally: the machine guard refused Playwright while AION2 was open. A
  headless probe read the same: «Budget for the Q4 hiring plan» → no line; «Should briefs be short or long?» → «Already
  asked here: “Short or long briefs?”», the line's left on the field's (328 = 328), 8 px under it; its press → the form
  gone and «Short or long briefs?» open. CI is the run on record.
- CI on the stack's tip `4020b4ba` (#268, which holds this branch), run 38302673542: all six jobs green, the
  browser job with `same-question.spec.ts`; «Live auth on local Supabase» after one rerun of that job, its first try refused by
  Docker Hub's rate limit before any test ran.
- Capture `evaluacion-2026-10-12/inteligencia/same-question.png`.

## Remaining obligations

- CI watched: green on the tip (above). The independent review (Codex) with no open P1 before merge; its P2s go to
  follow-ups. #265 is merged, so the base is `main`.

## Next bounded action

informe-inteligencia #4 (the next-ask piece on Home, a task's sheet and the personal space), #7 (an empty search offers
to ask Sophia) and #8 (a message that reads like a decision).

## Post-review (Codex on #266)

The conversation opened from the form takes the focus on its title (`start.arrive`, the started conversation's own
path), so a keyboard or screen reader user is not left on `body`; same-question.spec presses it from the keyboard and
reads the focus there.

## Post-review (Codex on #266)

- The matched title's press is inline and breaks anywhere, so a long title with no break in it (an id) wraps inside the
  form on a phone; same-question.spec @phone sets one and reads the press inside the form and no page overflow (with the
  old inline-flex it overflowed).

## Post-review, round 3 (Codex on #266)

- `f415168e`: a negation on one side only, or «after» where the other says «before», makes it another question
  (`sameQuestion`); `new-conversation.test.ts` holds both.
- `f06f808d`: the line's words come from a tested view helper (`sameQuestionLine`: «Already asked here:» and the title
  whole and trimmed, in quotes); `same-question-view.test.ts` holds it.
- This record's counts and CI result brought to the final branch (Codex P1 4251947535).
