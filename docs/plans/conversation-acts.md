# A message's acts: copy, quote, propose

> 2026-10-11 · Luis: «sigue con UIKIT-17: Updates y Conversations». Informe-pasada-3 §2 and §5 on Conversations:
> «no action per message (0 buttons in the bubbles)»; asked for copy, quote, «to the brief», `↑` to edit the last
> message, a draft kept per conversation. No API change.

## What was measured

- A message already has one act at its corner, for those who can write here: «Propose as decision» (C7,
  `ProposeHere`), shown under the pointer or the focus, on the message pressed on a phone. The pass's probe counted
  buttons inside `.msg`/`.turn` classes that do not exist here, and missed it.
- The draft is already kept per conversation and per project while the Studio is open (`talk-store.ts`), with whether
  it asks Sophia; coming back from another view finds it.
- There is no way to copy a message's words or to answer one by quoting it; the API has no edit of a message, so
  «`↑` edits the last message» cannot be honest: nothing would be edited.

## What changes

- **`message-acts.ts`** (pure): `clipOf(message, who, now)` (the words, then who and when on a line of their own) and
  `quoteOf(message, who)` (each line after «> », then who said it).
- **`MessageActs`**: the cluster at the message's corner (`.conv-acts`), the same place and the same rules as the
  propose press had: **Copy** (everyone: the clipboard takes `clipOf`; «Copied» said for two seconds), **Quote in your
  message** (writers: `quoteOf` goes under the draft, and the field takes the focus), then **Propose as decision** as
  before. Two icons join the kit (`copy`, `quote`).
- `OpenConversation` hands `onQuote` down to each message; the draft grows by the quote, a blank line after it.
- `↑` is left as it is (the field's own), said in the note; the draft per conversation is already there.

## States

- Under the pointer or the focus (a wide screen); on the message pressed (touch); a 40 px target on a coarse pointer.
- A viewer: Copy alone. A writer: Copy · Quote · Propose. While the propose form is open: Copy · Quote.
- A clipboard refused (no permission, no focus) or absent (an old webview): the press says «Not copied: select the
  words to copy them.» (Codex on #240). Every copy that goes through says «Copied» anew, its own announcement.
- On a coarse pointer, another's message (at the pane's left) has its presses start at the bubble's left and run
  right, inside the pane; one's own keep the right.

## Checks (written first)

- `message-acts.test.ts`: `quoteOf` one and several lines, `clipOf`'s shape.
- `e2e/conversation-acts.spec.ts`: under the pointer the three presses; Copy → the clipboard holds the words and who
  said them, «Copied» said; Quote → the field holds «> …», «— who», is focused; a second quote goes under; a viewer
  has Copy alone.
- `pnpm check` clean; `conversations-decide.spec.ts` unchanged (the propose press keeps its name and its place).

## Left

- Editing a message needs the API (and a record of the edit for the room's truth); then `↑` edits the last own one.
- «To the brief» as a note (not a decision) from a message: the brief's notes take words today only from their own
  field.
