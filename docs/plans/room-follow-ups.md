# Room: Codex's follow-ups on the live version, the presentation, the voice and the passage

> 2026-10-05 · Luis · PR 10 of the room's $20 plan · the P2s left on #108–#112, merged by the no-P1 rule

## What changes

**The next version arriving live** (#109):
- the offer «v2 is here…» waits for the text on screen (or its failed read), so Show it has what was read to compare with. «Show everyone» still asks only whether the version on screen is the current one, so an older one is never offered while its text loads;
- the kept place waits while another tab has the pane's body, instead of being spent on nothing; it is done once the sources' read is over, read or failed.

**Showing to everyone** (#110):
- a show pressed here is marked before the request, since the feed can present the report before its answer comes. A failed request unmarks it.
- refused against a room that moved, the button waits for the room's new revision before it can be pressed again;
- a stale Stop says «The room changed. Stop it again.»

**Sophia's voice through the report** (#111):
- **the index:** it follows the report's own top level (sections written at `##` with no title, or at `###` under a `##` title). Only the report's own headings count, never one inside a quote;
- **repeated names:** two sections with one name are two entries, each with its own heading;
- **hard line breaks** separate words.

**A link to the passage** (#112):
- it is looked for only once the version's sources were read, so a failed read never says it is missing;
- without the Highlight API, the selection is made again when the text is back in sight.

**Keep** (#108): a brief that couldn't be read still offers Keep. The write says why if it is refused.

## Checks (written first where the fixture can show it)

- **Browser:**
  - the offer waits for the text;
  - a stale Stop's words;
  - Keep with an unreadable brief;
  - the passage spec's reader moving versions through History before the text comes.
- **Units** (`voice-trail.test.ts`): the index's levels and repeated names.
- **Accounted, not testable on the fixture:**
  - the press-time mark (the fixture answers in the same turn);
  - the stale wait (the room's revision moves before the answer);
  - a hard break (no fixture report has one);
  - Safari's selection;
  - a failed sources read on arrival.
