# What a person reads carries no raw code

> 2026-10-10 · Luis: «Empieza con el 3 y el 2» (the microcopy review's patterns; this is the second: raw codes and ids
> in what users read). No API change.

## What was found

- A refusal with no words of its own said its HTTP status: «That didn’t go through (HTTP 500). Try again.»
- A reply that broke the contract showed the contract's own words to the person, wherever an error's message is shown:
  «Response does not match Snapshot: /x must be string».
- A research task that ended for a reason the Studio doesn't know said the code: «Not produced (worker_lost_lease).»; a
  PDF that couldn't be produced again said its reason or state code.
- A cited source named the services that read it («Search results (Tavily)», «Page extraction (Jina)») and the page's
  status code («Origin answered 404»).
- A task's version line showed its media type and the start of its hash: «v2 · text/markdown · 2aaaaaaa».

## What changes

- «That didn’t go through.», with «Try again.» where it can help; the status stays the error's code (`http_502`).
- «Sophia’s reply couldn’t be read.»; the contract's words stay with the error (`cause`), for whoever debugs.
- «No report was produced.» for a reason the Studio doesn't know (a blocker's own words, and the known end, as
  before); «The PDF could not be produced again.»
- A source: «A search snippet», «Read from the page»; what the page answered, in words: it answered, it wasn't found,
  it refused, its site had an error, or that isn't known.
- A version: its name and its kind in words («v2 · Markdown»), no media type, no hash.
- Left for its own decision: the plan's revision written «r3» across the board (its badge, bands, reviews). It is a
  notation the board uses throughout, not a stray code: a naming question for the next pattern.

## Checks (written first)

- The unit checks that held the old words (`client`, `report-view`, `results`) say the new ones, and a reason the
  Studio doesn't know is checked to read as the plain line: each failed first, and passes.
- Mutants, with a control that passes: the status back in the message, the contract's words shown, a reason code shown,
  a vendor named, a status code shown, the media type shown: each fails its check.
- The views that show these words pass unchanged, under the machine's guard: `report`, `knowledge-origins`, `work`,
  `room-work` (247); unit tests (1017).
