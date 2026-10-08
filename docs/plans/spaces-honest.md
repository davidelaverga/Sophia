# The two spaces say one thing at a time

> 2026-10-08 · Luis: «Sigue con lo siguiente de la cola». The queue's third step, the «$20» look, reaches Home and
> Personal (`docs/plans` of the two spaces; the critique was given in the session). The first of two PRs: the errors.
> No API change.

## What reads as broken (demo, phone 375 px)

- The demo's label, in the corner above the dock since `knowledge-honest.md`, covers a project row on Home («03
  Research notes») and Sophia's last words on Personal: a phone has no free corner.
- Home says «3 notes»; Personal keeps one.
- Home's line to Sophia shows «/» on a touch screen, where there is no key to press.
- Open, the notes' press keeps its tip on, cut by the panel it opened.

## What changes

- **The demo's label on a phone is a line:** 3 px along the top edge, its words kept for a screen reader, over
  nothing to read or press. On a wide screen it keeps its corner.
- **One count:** the demo's Home counts the one note Personal keeps.
- **A key only where there are keys:** no «/» under a coarse pointer.
- **Open, no tip:** the notes' press drops its tip once the notes are beside it.

## Checks (written first)

- On a phone, on Home, Personal and Conversations, the label's box is at the top, at most 4 px tall, with nothing
  read under it; on a wide screen the earlier checks hold (`knowledge-honest.spec.ts`).
- Home's «1 note» matches Personal's; a touch screen shows no key, a pointer's Home still shows «/»; open, the notes'
  press has no tip.
