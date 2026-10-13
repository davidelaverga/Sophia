# Ask instead and the next ask on Home: what is offered, and when (Codex P2s on #267 and #268)

Luis, 2026-10-12: «atiende los P2 en PRs pequeñas». Third follow-up to the kit stack's open Codex P2s. This one: what
the asks from Knowledge, Home's line and a task's field offer, and to whom.

## What was measured

- #267 4251418870, 4251422174 (one finding twice): Knowledge's «Ask Sophia about “…”» stays pressable for the 300 ms
  the edited search takes to settle, and carries the old words.
- #267 4249588405: a confirmed viewer's ask on a phone skips the form but still shows the open pane, so the newest
  conversation opens instead of the promised list.
- #268 4252501468: Tab puts «Help me get ready for Standup in Product launch» in Home's line; sent, she never learns it
  starts in 10 minutes (the reason is only the tip's, gone by then).
- #268 4252391630: Home's line and a task's field describe the suggestion to a screen reader without its reason.
- #268 4249599799: Home's put-away resets when Home is hidden, which a move reversed before it settles never does
  (`usePlaceMotion` keeps both places shown while moving).

## What changes

- **Knowledge** (`askAbout`): no ask while the words in the field are not yet the words searched.
- **Conversations' arrival** (`useArrivals`): words to ask show the open pane only for a member, whose form opens; a
  viewer stays on the list.
- **Home's next ask** (`homeNextAsk`): a `full` sentence with the timing («… It starts in 10 min.») is what Tab puts in
  the line; the placeholder stays short.
- **Descriptions**: both fields' descriptions say why («Because it starts in 10 min», «The first question its state
  invites»), as the conversation field's does.
- **A visit**: the line's put-away resets when another place is arrived at (`here`, from `placeAt(v.shown)`, the place
  moved to from the move's first frame), not when Home is hidden.

## Checks (written first)

- `places-view.test.ts`: `homeNextAsk`'s `full`; `placeAt` is the place moved to, a reversed move included.
- `e2e/next-ask-places.spec.ts`: Tab fills Home's line with the timing; both fields' descriptions say why.
- `e2e/ask-instead.spec.ts`: Knowledge offers no ask with the old words the moment they change, then the new; a viewer's
  ask on a phone shows the list (fails without the change: «thread»).

## Left

- The reversed-move case itself is held by `placeAt`'s unit check, not a browser run: the fixture's Home toggles its
  place at once, with no motion to reverse.
