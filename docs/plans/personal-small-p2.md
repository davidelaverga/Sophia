# Personal: four small follow-ups from Codex (P2)

> 2026-10-05 · Luis · after the stack #91–#96 merged · "PR chico"

Four of the P2s Codex left on #92–#96, the cheapest; the rest stay listed in `docs/handoffs/PERSONALCODEXROUND-attempt-1.md`.

| Codex said | Measured in the fixture | Change |
|---|---|---|
| Count message length in Unicode characters | 2,001 emoji (4,002 UTF-16 units) never sent: Send waits as if over 4,000; the field's `maxLength` stops typing at 2,000 of them | One length, in characters (code points), as the API and the database count: for the count, Send, the send and words handed from Home. The field takes no `maxLength`; past 4,000 the count says how far over, as for words heard or handed. |
| Keep Find unavailable until the conversation loads | Before the space is read, Find opens and says "No match" over a conversation still loading | Find (its toggle and Ctrl/⌘ F) is there once the space is read. |
| Today's divider before its milestone | Back on a milestone day, or after a week away, with no turn yet today: no divider, so no "a month together", no "12 days later" | Today's divider comes when today carries a moment, before anything is said. |
| Show progress while loading earlier matches | "Look further back" stays the same while the earlier page is read; a second press does nothing | While it reads, it says "Reading…" and waits (`aria-disabled`). |

## Checks (written first, each failing before its change)

- 2,001 emoji go; 3,700 emoji count as 3,700.
- Before the space is read, no Find, and Ctrl F is the browser's; once read, Find.
- A conversation whose last day is 12 days back ends with "Today · 12 days later"; one a month old, "Today · a month together"; yesterday's, no today divider.
- Pressed, "Look further back" says "Reading…" until the page is in.
