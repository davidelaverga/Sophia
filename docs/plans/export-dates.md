# The copy of your data keeps its dates

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §2, fault 6). «Your data» copies everything as plain text,
> and its conversation was headed «Today», «Yesterday» or a weekday, with no time by any message. A copy kept is read
> another day, when those words are wrong. Studio only.

## What changes

- **Each day is headed by its date in full:** «Wednesday, September 30, 2026», never words relative to the copy's day.
- **Each message starts with its time:** «20:56 Sophia: …».
- **The copy says when it was made,** under its title: «As of Wednesday, September 30, 2026, 21:00». That is the
  export's own time (`exportedAt`, the first page's, where the notes come from too), never the device's clock (Codex P2
  on #405).
- The page's own day labels stay as they are. On screen, «Today» is read today.
- The browser's time zone, as the conversation shows it.

## Checks

- **`places-view.test.ts`** (the copy's check):
  - the title, then «As of …», from the export's time while the device's clock is years off;
  - each day in full, «Tuesday, September 29, 2026», where it said «Yesterday»;
  - each message after its time.
- No fixture page serves the personal export, so the copy is checked at its pure function, where the change is.
