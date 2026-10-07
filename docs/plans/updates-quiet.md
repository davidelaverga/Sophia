# Updates, quiet: the same pass Conversations and Knowledge had

> 2026-10-07 · Luis's queue: the «$20» treatment for the rest of the app, view by view («Encólalo todo», «Continúa con
> lo demás»). Builds on `docs/plans/room-updates.md` (what Updates holds) and `docs/plans/conversations-quiet.md` (the
> look). No API change.

## What reads as unfinished (measured at 1440 and 390 px, `?demo=1`)

- One narrow column at the left of a wide page; the right two thirds empty.
- Every heading is the same weight of white: «Since you last looked», «Decided», «Still open», «Meetings».
- The digest's lines carry no sign of their kind: a decision and an open question look alike.
- A meeting is one line of text: when, and how long; nothing to compare one with another.
- «Mark as seen» sits under a rule, as heavy as the content.

## What changes

- **Two panes on a wide screen:** what changed on the left (the reading column), the meetings on the right, as the
  Conversations context sits. Under 900 px, one column, the meetings after.
- **Labels, not headings:** the parts and the digest's sections are mono labels in the second ink, as in the
  Conversations context.
- **Each line marked by its kind:** decided, a teal tick; still open, an amber dot; made, a small page; kept, a warm
  dot; work, a quiet square. The words stay the same.
- **Meetings you can compare:** each row is its day and time, and a thin bar for how long it lasted, the longest the
  full width; the running one has a live dot and «Now». The row's words stay what they were.
- **Mark as seen, quiet:** no rule above it.

## Checks (written first)

- At 1440 px the two parts side by side, tops aligned; at 390 px one column, the meetings below, nothing sideways.
- Each digest section says its kind (`data-kind`) and each line shows its mark.
- A longer meeting's bar is wider; the running one has its live dot, not a bar.
- Labels read at 4.5:1, on the app's type sizes; the existing Updates checks pass unchanged.
