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
  (`useSlow`, `SLOW_NOTE`). Decline waits drawn as a waiting press, as Accept does (the Studio's rule for a waiting text button, #187).
- Answered, or refused as stale, a decision settles once the brief has been read again (`useDecide` awaits it, as a
  proposal already does), so what it says agrees with what shows. With no reply it doesn't wait for that read.
- The presses wait while a decision goes, while its outcome is unknown, and once answered while the brief still lists
  it: a read again that failed keeps them waiting, with «This may be out of date. Try again» as the way on
  (`pressesWait`, pure).
- The status line takes the focus whatever the answer, if the focus is still in Still open or was lost with its press:
  never from where the person went meanwhile (the composer, another conversation).
- A 409 is worded from the brief read again (`decideRefusal`, pure): still waiting, «It can’t be decided as it is: the
  brief changed since. This is the brief as it is now.»; gone, «Someone decided it first», as before; the read failed,
  «It wasn’t decided here: the brief changed since.», true either way.
- A replacement refused this way still waits, unchanged and not stale (only a new direction moves the mission's
  revision): it can be declined, and an Accept is refused again with the same words. Telling it apart before the press
  (its `supersedesDecisionId` no longer accepted) is a later step.

## Checks (written first)

- `decide.test.ts`: `pressesWait` for each state, and once answered, by whether the brief still lists it;
  `decideRefusal` by whether the read came back and the proposal still waits.
- `conversations-decide.spec.ts`, with the fixture's `decide=slow` (the answer 3 s late) and `decide=replaced` (a 409,
  the proposal still waiting, unchanged):
  - decided first, with the brief's read held: «Accepting…» until it lands, then «Someone decided it first», focused;
  - refused while it still waits: the changed brief's words, focused, and the proposal still there to decline;
  - «Accepting…» while it goes, both presses waiting, Decline drawn so; the composer focused meanwhile keeps the focus;
  - answered with the read held: «Accepting…» and waiting presses until it lands; answered with the read failing: the
    presses wait until «Try again» reads it without the proposal.
