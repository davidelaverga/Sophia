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
  how it landed on Davide?». Your apology is met as one («I wish Davide would apologise» is not yours); any other
  mention asks what you want them to understand. A name inside another word, or a possessive, is read as it is.
- **A weight you named before** (the deck, the pitch, the numbers, the meeting, the launch) is asked about again,
  quoting a thought of yours about it (five words or more): «It comes back to the deck again. Last time you said “…”
  Is it the same weight, or a new one?». A quote is closed and cut past 140 characters.
- **Anything else:** an open question about what you just said, whatever it carries; a word or two, «What’s on your
  mind?». Without the demo, the checks keep their one line.

## Checks (written first)

- In the demo, the apology to Davide quotes the earlier sentence about him; «I wish Davide would apologise» is no
  apology of yours; «Marketing» is not Marco; the deck for Friday names the deck again and quotes the first day's
  words.
- Without the demo, her answer is the checks' one line (`personal.spec.ts`, unchanged).
