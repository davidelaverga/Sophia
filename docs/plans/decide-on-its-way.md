# Decide here: a decision on its way says so, and its presses wait

> 2026-10-08 · Luis: «Sigue con lo siguiente de la cola». Four of Codex's P2s on #174 (C7, decide here), answered there
> as follow-ups: one concern, what Still open says and does while a decision goes and once it is answered. No API
> change.

## What is wrong

- **Nothing says it is going.** Accept or Decline that takes a moment keeps its labels and an empty status; only
  `aria-disabled` changes, and Decline (a text button) is not even drawn as waiting.
- **Answered, the presses wake too soon.** The receipt lands before the brief is read again: for that moment, or for
  good if the read fails, the decided proposal is still listed with live Accept and Decline.
- **A refusal loses the focus.** A 409 reads the brief again, which can take away the press that had the focus; the
  status line takes it only for an answer, not for a refusal.
- **A refusal can say what didn't happen.** Every 409 says «Someone decided it first». But two proposals replacing the
  same decision both wait: once one is accepted, accepting the other is refused (`stale_revision`) while it still waits,
  undecided. The code alone can't tell the two apart; the brief read again can.

## What changes

- While a decision goes, the status says «Accepting…» or «Declining…», with the long wait's line after six seconds
  (`useSlow`, `SLOW_NOTE`). Decline waits drawn as a waiting press, as Accept does.
- The presses wait while a decision goes, while its outcome is unknown, and once answered until the brief read again no
  longer lists it (`pressesWait`, pure).
- The status line takes the focus whatever the answer: done, refused or not confirmed.
- A 409 whose proposal still waits in the brief read again says «It can’t be decided as it is: the brief changed since.
  This is the brief as it is now.» (`decideRefusal`, pure). One that left says «Someone decided it first», as before.

## Checks (written first)

- `decide.test.ts`: `pressesWait` for each state, and once answered, by whether the brief still lists it;
  `decideRefusal` by whether the proposal still waits.
- `conversations-decide.spec.ts`, with the fixture's `decide=slow` (the answer 3 s late) and `decide=replaced` (a 409,
  the proposal still waiting, now stale):
  - «Accepting…» while it goes, both presses waiting, Decline drawn so;
  - answered with the brief's read held: the presses wait, a press sends nothing, until the read lands;
  - refused while it still waits: the changed brief's words, and the focus on them; refused as decided first: the focus
    on its words too.
