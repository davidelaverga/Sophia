# The next ask on Home and on a task's sheet

Luis, 2026-10-12: «Procede». Fourth move of `evaluacion-2026-10-12/informe-inteligencia.md` (#4): the next-ask piece of
#262 (`NextAskHint`, `nextAskKey`) in two more of Sophia's fields.

## What was measured

Home's line says «Say something to Sophia» whatever is going on, while the sentence above it already says «Marco, Lucía
and Sophia are in Onboarding pilot.» (`sophiaSays`). A task's «Ask about this task…» field is blank under chips that
already name the questions its state invites («Why is it waiting?», `INVITED` in AskSophia.tsx).

## What changes

- **Home** (`homeNextAsk`, pure, in places-view.ts): a session about to start → «Help me get ready for Pitch run in
  Weekly standup» (*because it starts in 10 min*); else nothing. Not a live room's «Catch me up on Onboarding pilot»:
  Home's line goes to the companion, which never sees a project, so it could only guess from the title; catching up is
  the project's conversation's own next ask («Sum it up») (Codex P1 on #268). It is the line's
  placeholder; with the line focused and empty, the key cap «Tab» stands where «/» stood. Tab (or →) puts the words in
  the line; Esc puts it away for the visit; Enter sends to her as any line does.
- **A task's sheet**: the field's placeholder is the first question the task invites, with the cap while the field is
  focused and empty; Tab puts it in, Esc puts it away for the sheet. The chips stay: the field only saves typing them.
- Listening (Home's microphone): no suggestion, «Listening…» as before.

## Checks (written first)

- `places-view.test.ts`: `homeNextAsk` takes a session about to start, else nothing; never a live room; none without
  projects.
- `e2e/next-ask-places.spec.ts`: Home's placeholder is the session's ask; focused, the cap stands; Tab fills the line;
  a live room alone leaves the line's own words; Esc on a fresh visit puts it away. A task's field: its placeholder is the first invited question; Tab fills it.

## Left

- The personal space's composer (what to suggest there wants her own signals), and `next` from the service.
