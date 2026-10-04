# Implementation-session handoff: Home's light as Umbral, attempt 2 (#87: CI on narrow phones)

- **Goal and attempt:** #87's first CI run failed one check. At 320 px, "Jean-Christophe." reached her mark; on Linux it was one sub-pixel past touching.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `home/first-visit` at `d65cd03`, 2026-10-04.
- **End:** content commit `b942b4a`; its checks ran on it.
- **Writable scope:** the phone rule for Home's greeting in `personal.css`, and its check. **No contract changed.**

## Outcome

- **The greeting keeps a 56 px reserve on the phone** (attempt 1 had dropped it as unneeded). A long name breaks before it reaches the mark.
- **The scaled type keeps the longest greeting on one line,** and that is now checked.
- **The check is stricter:**
  - it asks for a gap of 8 px, so a renderer's sub-pixel can't decide it;
  - it waits for the Studio's face before measuring;
  - it names the word that reaches the mark.

## Evidence

- **Measured at 320 px:** "Good afternoon," ends at 242, and the mark starts at 260. The name now wraps and ends at 176.
- **Mutations:** 12 of 13 killed; 2 controls survive. The survivor is the same as before: the engine using `aimOf`.
- **Gates:** format, lint and typecheck pass. Home's checks: `--repeat-each=3`, 69 of 69.
