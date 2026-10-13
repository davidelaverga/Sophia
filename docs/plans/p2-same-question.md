# The same question: words that make it another (Codex P2s on #266)

Luis, 2026-10-12: «atiende los P2 en PRs pequeñas». First of the follow-ups to the kit stack's open Codex P2s, one
concern each. This one: `sameQuestion` (docs/plans/same-question.md) naming a conversation that asks something else.

## What was measured

Five threads on #266, each a pair the matcher calls the same question though it is not:

- 4250204701: «Can we enable dark mode?» against «We cannot enable dark mode» (`cannot` is not a negation).
- 4251415861: «Should we disable email notifications?» against «…enable…», «exclude» against «include».
- 4249599705: «2026 revenue forecast» against «2025 revenue forecast».
- 4251947540: «before review and after approval» against «after review and before approval» (both words said: the
  order reads as none, a wildcard).
- 4252376962: on a Turkish device, «INVOICE STATUS» folds to «ınvoıce statu» and no longer meets «invoice status».

## What changes

All in `new-conversation.ts`, pure, under `turnsAgree` (the gate before scoring):

- **Folding** is `toLowerCase()`, the same on every device, not the device's locale (`fold`, `wordsOf`).
- **Negation** counts `cannot` with `not`, `never`, `without` and a «n't».
- **Opposite actions** (`OPPOSITES`: enable/disable, include/exclude, add/remove, allow/block, accept/reject,
  open/close, start/stop, show/hide, increase/decrease, raise/lower, import/export, hire/fire), each in its plain forms
  («enable», «enables», «enabled», «enabling»): one side acting and the other undoing is another question.
- **Numbers**: both sides naming numbers, and not the same ones, is another question; a number on one side only does
  not part them («Revenue forecast» still meets «2025 revenue forecast»).
- **Order**: each «before»/«after» is read with the word it is said of («before review»). One word on each side: as
  before, opposite words part them. Both words said on either side: the same orders of the same things, or another
  question.

Nothing in the view changes; under the gate, the scoring (two shared words and 60 %) is as it was.

## Checks (written first; each failed before the change)

- `new-conversation.test.ts`, «the same question, words that make it another»: `cannot`; enable/disable and
  include/exclude, with «Should email notifications be enabled?» still meeting «Should we enable email notifications?»;
  2025 against 2026, a number on one side still meeting; both orders reversed against the same orders in other words; a
  Turkish locale standing in (`t.mock.method` on `toLocaleLowerCase`) still meeting.

## Left

- Other folds in the Studio still use the device's locale (`conversation-list.ts`'s search, `next-ask.ts`'s `sameAsk`);
  not flagged, and not this concern.
