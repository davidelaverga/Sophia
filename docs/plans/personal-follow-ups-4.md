# Personal: the last open follow-ups

> 2026-10-05 · Luis · after [personal-follow-ups-3](personal-follow-ups-3.md) · "Continua arreglando"

| Follow-up | Measured in the fixture | Change |
|---|---|---|
| Notes, memory and a project's title counted in UTF-16 units (`maxLength`) against limits the API counts in characters | A note held only 45 emoji of its 90 | One helper in characters (`characters.ts`: `lengthOf`, `clip`, `capped`), used by the composer's count, the note's prefill and these three fields: past the most, a field keeps what was there and as much of what was put in as fits, as `maxLength` did, counted in characters; it leaves an input method alone while it composes. |
| Words handed from Home before the space's epoch is known | Handed while the space and its epoch were still on their way: put in the field unkept, then replaced by the device's draft at the first read, so never sent | They aren't taken until the epoch is known: Places holds them, the field's line says so ("From Home, waiting for your space · …"), and they go once it is. |
| A reply that came while Personal was out of sight (Codex on #92) | Her reply landing while the space is shut (the check waits for it to land), on return in a conversation that overflows: the view jumped to it and the line never showed, 8 of 20 runs (the list, resized on return, scrolled to a stale end) | Her reply landing out of sight is unseen: the stale end is dropped then. On return, where the conversation overflows, "Sophia answered" waits below (20 of 20); where it fits, the reader is at its end again, with no line. |
| The Work composer's long words (`theme.css`) | — | Still waits for Davide's #76, which edits that file. |

## Checks (written first)

- 95 emoji typed into a note keep 90; `lengthOf` and `clip` (units) count and cut in characters, never splitting one.
- Words handed with `spaceAfter` and `epochAfter` are sent once both are read.
- A reply landing while the space is shut: the line on return where the conversation overflows (run twenty at a time: the old code fails 8 of 20); none where it fits.
