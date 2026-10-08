# Personal: the demo's Sophia remembers what you told her

> 2026-10-08 · The second of two PRs after the «$20» look at the two spaces (`spaces-honest.md`). Fixture only: the
> companion's words are the runtime's to write (Davide's); the demo shows the bar. No API change.

## What reads as unfinished

- In the demo, Sophia answers anything with «I'm here. Tell me more about that.». Told «I think I should apologise to
  Davide first», right after «I promised a date I couldn't keep, and Davide was quiet the whole time», she keeps none
  of it: for a companion, that is the product.

## What changes (the demo's fixture, `fixtures/personal-replies.ts`)

- **Someone you work with, named again** (the demo project's people, Davide, Marco and Lucía: she knows them, she
  never guesses names from capitals), brings back what you said about them, in your words: «You told me “I promised
  a date I couldn’t keep, and Davide was quiet the whole time.” … What would you apologise for: the promise itself, or
  how it landed on Davide?». Your apology is met as one, to whom it is made; «I wish Davide would apologise», «I’m
  not going to apologise» and «Why should I apologise?» are not, and in doubt she asks rather than assumes. Any other
  mention asks what you want them to understand. A name is read in any case and as a possessive, never inside another
  word («Davidek»).
- **A weight you named before** (the deck, the pitch, the numbers, the meeting, the launch) is asked about again,
  quoting a thought of yours about it (five words or more): «It comes back to the deck again. Last time you said “…”
  Is it the same weight, or a new one?». A quote is closed and cut past 140 characters.
- **Anything else:** an open question about your first thought of three words or more, as you put it (a question
  stays one); a word or two, «What’s on your mind?». Without the demo, the checks keep their one line.

## Checks (written first)

- In the demo, the apology to Davide quotes the earlier sentence about him; «I wish Davide would apologise» and «Why
  should I apologise to Davide?» are no apology of yours; «Davidek» is not Davide; the deck for Friday names the deck again and quotes the first day's
  words.
- Without the demo, her answer is the checks' one line (`personal.spec.ts`, unchanged).
