# Decide here: a decision with no reply is held by the view

> 2026-10-09 · Luis: «Continua». One of Codex's P2s on #174 (C7, decide here), answered there as a follow-up: a
> decision whose reply was lost keeps its key only while Conversations is on screen. No API change.

## What is wrong

- Accept or Decline with no reply says «Not confirmed… Try again», and «Try again» sends the same decision under its
  key. But the key lives in the context pane's own state (`useAdmission`): a trip to Goals, Tasks or the room and back
  forgets it. The decision may have landed; pressing Accept again then goes under a new key, as a second decision, and
  is answered as if someone else had decided first.
- A message's proposal already outlives such a trip (`useHeldWrite`, `talk-store.ts`); a decision should too.

## What changes

- A decision on its way, or sent with no reply, is held by the view with its key, its intent and its words, per project
  and account (`talk-store.ts`: `decision`), as proposals are. Coming back finds «Not confirmed… Try again», and «Try
  again» sends it again under its key, never a second. On its way when the person left, it is still on its way: the
  presses wait, it says «Accepting…».
- A refusal's words are kept with it the same way, chosen as now from the brief read again.
- Answered, it is let go; what it said («Accepted: …») stays with the pane that saw it.

## Checks (written first)

- `conversations-decide.spec.ts`, with the fixture's `decide=lost` (the first decision lands, its reply lost): Accept,
  «Not confirmed»; to Goals and back, still «Not confirmed… Try again»; Try again: answered, one decision recorded,
  under the first key (a second key would find nothing left to decide and be unexpected).
- The existing decide checks, unchanged.
