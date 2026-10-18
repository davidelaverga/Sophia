# The same question: before starting one, the conversation that already asks it

Luis, 2026-10-12: «Procede». Sixth move of `evaluacion-2026-10-12/informe-inteligencia.md` (#6).

## What was measured

Starting a conversation in the fixture («New conversation», the question «Should briefs be short or long?»), the form
offers the proposals waiting and nothing else: «Short or long briefs?» is in the list beside it, one press away, and
the form starts a second conversation on it without a word. The team's answers then split across two threads.

## What changes

- **The form notices.** Under the question, once it reads like one already asked here, a line: «Already asked here:
  “Short or long briefs?” →», a press that opens that conversation instead (the draft stays, as Cancel leaves it). It
  is a status, said once as it appears; starting anyway stays one press away (Start), never blocked.
- **Like** (`sameQuestion`, pure, in `new-conversation.ts`): the question's own words (letters folded and accents off,
  short and common words left out, a final «s» dropped) against each conversation's title; the one sharing at least two
  of them and at least 60 % of the question's wins, the most shared first, the newest on a tie. Two words is the least
  that says «about the same thing»; under that, nothing is said.
- Not while the form is held (its words are on their way), and never the conversation just started.

## Follow-up (Codex P2 on #376)

- **Folded once:** the draft once, and each conversation's title once, whatever is read from them.

## Checks (written first)

- `new-conversation.test.ts`: «Should briefs be short or long?» finds «Short or long briefs?»; «What makes a good
  report?» finds «What makes a report worth reading?»; one shared word, or only common words, finds nothing; the most
  shared wins, then the newest.
- `e2e/same-question.spec.ts`: the line names the conversation, and its press opens it; an unrelated question shows no
  line.

## Left

- The same check across projects, and Sophia's own judgement of «the same» (the service), with the same line.
