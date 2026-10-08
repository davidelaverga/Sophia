# Conversations: Sophia answers for real (C6)

> 2026-10-08 · Luis: «Evalúa conversations a ver si vale no 20 pero 30 dólares. Súbele el nivel», then «Procede con
> C6». The first of four (C6–C9). Builds on `docs/plans/conversations-panes.md` and A18 (proposed). No API change, beyond what A18's proposed row line keeps (below).

## What reads as unfinished

- «Sum it up», «What's still open?» and «What did we decide?» send their words, and Sophia answers one fixed line
  («I'll keep that with the question…») for every one of them: the three presses promise what nothing delivers.
- What Sophia already knows sits beside the thread (the conversation's summary, the project's accepted decisions,
  what is still open), and her answer never uses it: the one moment worth paying for.
- Her messages are one paragraph of plain text: no list, no «who said what».

## What changes

- **Sophia's words have a shape.** A message of hers is read as light text: paragraphs; a line ending in «:» leads
  what follows; lines starting «- » are a list, and a list item that opens with a short name and a colon («Marco: …»)
  names who said it. Members' messages stay as written. The API keeps sending text (A18); this is how the Studio reads
  hers.
- **The three presses are answered** (the fixture's Sophia, as the API's would; demo and checks):
  - «Sum it up»: where it stands, each person's latest point; the project's decisions it touches («Already decided on
    Oct 5: “Keep the brief to one page”»); and whether anything here is decided.
  - «What's still open?»: the questions asked here and not answered, and the project's proposals waiting.
  - «What did we decide?»: the project's accepted decisions with their days, and whether this conversation decided
    anything itself.
  - Anything else asked: an honest line that says what she can do, never a promise she doesn't keep.

## Limits

- The real answers are A18's to write (Davide's runtime); the Studio only reads their shape. The fixture shows the bar.
- A decision named in an answer is words, not yet a link (a link needs a reference in the message: C7 proposes it).
- A18's proposed `lastMessage.text` (the row's line) is the message's opening as written, up to 140 characters, line
  breaks kept: the Studio says it in one line, without the marks Sophia's words are drawn with.

## Checks (written first)

- `sophia-text.ts`: paragraphs, a lead, a list, an item's speaker; a member's line with a colon is never split.
- In the demo, «Sum it up» in «Short or long briefs?» answers with Marco's and Lucía's points as a list, each name
  set apart, and «Keep the brief to one page» as already decided; «What's still open?» lists «Map first, list second»;
  «What did we decide?» lists the five accepted decisions.
- Sophia's answer keeps to the app's type sizes and reads at 4.5:1.
