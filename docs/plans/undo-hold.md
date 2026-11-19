# Undo after Hold

> 2026-11-19 · Studio QoL. In a task's sheet «Hold» acts at once (Stop asks first, Resume exists), so a mistaken Hold
> has no quick way back but finding Resume. A short Undo, beside the Hold it takes back. No API change.

## What was read

- `TaskActions.tsx` → `SessionActs.tsx`: Hold, Resume and Stop are presses in «Act on it»; a command's steps are said in
  the status line (`role="status"`), each receipt as it comes (`receipts.ts`). Hold is offered while the task isn't
  held, Resume only while its view says it is (`actions.ts` `fits`), and never while a Resume is on its way
  (`work-control.ts`).
- `task-keys-micro-type.md`: `H` presses Hold, or Resume when that is offered; a repeat is not a press.
- `app/Toast.tsx`: the Studio's toast is for «a result whose place is not on screen»; one whose place stays on screen
  is said there. A Hold's place is the sheet, so the Undo is said there, under its status line, not as a toast.

## What changes

- Once a Hold sent from this page is **settled** (its runtime confirmed it: «Held.») and the view offers Resume, the
  sheet says «Put on hold.» with a text button «Undo», for 6 seconds.
- **Undo is Resume**: the same `acts.send('resume', target)` the Resume press makes, to the same exact execution. Its
  receipts are said in the status line as any Resume's; a refusal (someone changed the task meanwhile, a 409) says the
  existing words, «This changed before it was sent. Nothing was sent.» After an Undo nothing else is added: the task's
  own state says it.
- Words in one place: `features/resources/undo-hold.ts` (`UNDO_HOLD`), with the rules (pure, unit-tested).

## Rules

- **Only a Hold that worked.** Refused, lost, unknown or still on its way: no Undo. A Hold the view reports with no
  command from here (another person's, an earlier page): no Undo.
- **The latest control decides.** The latest Hold, Resume or Stop sent for the execution shown must be that Hold; a
  Resume (by Undo, the Resume press or `H`) or a Stop after it ends the Undo.
- **Only while Resume is offered.** The same press, so the same permission: a reader, a stale read, no port, or a view
  that no longer offers Resume shows none. Resources' rows never offer Resume, so they never show an Undo.
- **Only a Hold this sheet saw on its way**, then confirmed while it was open: one confirmed while the sheet was closed,
  turned (J / K) to another task, or sent from Resources, offers none later (review on attempt 1, P2-2).
- **6 seconds from its first offer**, the same end if it drops out of offer for a moment and comes back (an unobserved
  poll); never longer (P2-1). The windows belong to the sheet, keyed by the execution shown (`undoWatch`), swept when
  over, and go with it: closing or turning the sheet, or another attempt or session in its place, ends them.
- **One at a time**: one sheet, one execution, its latest Hold.
- **Keys and focus**: Undo is a button right after the status line, so Tab from wherever the focus was handed reaches
  it; nothing moves the focus to it. If it leaves for any reason while it has the focus, the focus goes to the status
  line, never the page. It carries Resume's tip, as Resume's own press does. Its line sits in its own polite live region, mounted before anything is said.
- **`H` path**: a Hold pressed by `H` settles the same way and gets the same Undo; `H` again presses Resume as before.

## Out

- Taking back a Hold still on its way: Resume can't be sent before its view says held.
- An Undo for Stop (it asks first) or for guidance.
- The board's tiles, Resources' rows, the goal's own Hold (LFE-07.2).
- Copy is proposed: Luis approves «Put on hold.» / «Undo».

## Checks (written first)

- `src/features/resources/undo-hold.test.ts`: the rules above, on folded receipts.
- `e2e/undo-hold.spec.ts` (work fixture, `settle=confirmed`): `H` holds, the line comes with Undo and the focus is not
  on it; Undo sends one Resume and the task works again; it leaves on its own after about 6 s; J ends it and K back does
  not bring it; a refused Hold has none; another attempt in its place ends it.
