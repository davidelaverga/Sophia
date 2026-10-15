# The next ask, only from what is known now (Codex P2s on #262)

Luis, 2026-10-12: «atiende los P2 en PRs pequeñas». Second follow-up to the kit stack's open Codex P2s. This one: the
conversation field's next ask (docs/plans/next-ask.md) standing on reads that are stale, failed or short.

## What was measured

Seven threads on #262:

- 4248827728: the older-asks reader stops at four pages, so in a busy thread the sixth-latest ask can be missed and
  offered again.
- 4248827738, 4251421906: while that read is on its way, or after it fails, the quick asks (and, after a failure, the
  field) are built from the loaded pages alone.
- 4248827751: a brief whose refresh failed keeps its old data; a proposal decided since is still offered.
- 4249597620: a conversation list whose refresh failed keeps an old open-question count.
- 4250198696: while the transcript is read again (or after that read fails), its cached newest message may not be the
  newest; the field still offers a next ask that needs it to be Sophia's.
- 4249597604: the reason's tip shows on hover or on the cap's own focus, which the keyboard never reaches; focus stays
  in the field.

## What changes

- **`asksNow`** (pure, `next-ask.ts`): the field's suggestion and the quick asks from what is known now. With the
  transcript not fresh (`fresh`: read, not being read again, last read not failed) or the viewer's older asks not known
  (`recencyKnown`), neither: nothing is offered.
- **`olderAsks`** reads until six asks are in or the thread begins, up to eight pages; stopped there with asks still
  wanted and pages left, it says `complete: false`, and nothing is offered on it (a guess beats nothing only when it
  can't repeat what was just asked).
- **`briefAsks`** (moved from `useNextAsk.ts`): a brief whose last read failed gives nothing.
- **Open questions**: `NextAskSource.openQuestions` is null when the conversation list's last read failed
  (`ConversationsView` → `OpenConversation`); the next ask then says nothing of open questions.
- **The tip**: with the focus in the field, the next ask's reason shows as it does under a pointer
  (`:is(input, textarea):focus-visible ~ .next-ask .tip`, theme.css), in the conversation field, Home's line and a
  task's field alike.

## Checks (written first)

- `next-ask.test.ts`: `olderAsks` reads to six or to the start and says when it stopped short; `asksNow` offers nothing
  and no quick asks without `fresh` or `recencyKnown`; `briefAsks` gives nothing from a failed read.
- `e2e/next-ask.spec.ts`: focus in the field shows the reason's tip (opacity 1, its words); it fails without the
  theme.css rule.
