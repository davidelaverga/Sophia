# Personal: the open follow-ups (Codex P2s on #91, #96 and #97)

> 2026-10-05 · Luis · after [personal-small-p2](personal-small-p2.md) · "Procede con los arreglos"

| Codex said | Measured | Change |
|---|---|---|
| #97: validate the trimmed length | 4,000 letters and a space: Send waited, "3 over" | The length is the words', trimmed as the server checks them: for the count, Send and the send. |
| #97: share the earlier-read pending state | A read begun from the days' menu: Find's "Look further back" didn't know, and its press did nothing | One read of earlier days at a time, shared (`useSharedRead`): the days' menu and Find both say "Reading…" and wait while it is on its way. The match Find is on is held as itself, so earlier days read from anywhere leave it current. |
| #91: keep the latest exchange pinned when the list begins overflowing | A conversation that fits, then a shorter window: the view jumped to the first turns | The list watches its own size: whoever read at its end stays there as it shrinks (`ResizeObserver`). |

## Checks (written first, each failing before its change)

- 4,000 letters and spaces: "4,000 / 4,000", Send ready, the 4,000 letters sent.
- Earlier days read from the days' menu: the menu and Find both say "Reading…", and the match Find was on stays current.
- A window made shorter until the conversation overflows: her last turn still in sight.

## Not in this pass: #96's competing draft writes

A re-read just before writing (a compare-and-swap) was built and taken out again: a page's reads of localStorage in one task can't see another tab's write (Chromium and WebKit serve them from the page's own cache, updated by later tasks; Firefox gives each task a snapshot), so the retry could never run. localStorage has no atomicity across tabs. A real fix is a change of design: each writer keeps only its own words (words handed from Home under their own key, say), so a tab recovering a failed send never rewrites words it didn't write, and the field merges them as it reads. Left for Davide and Luis to decide.
