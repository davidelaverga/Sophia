# Handoff: the chat at a person's pace, attempt 1

Goal and attempt: UI-CHAT-PACE (`docs/plans/chat-pace.md`; improvements 1, 9, 17 and 10 of the independent evaluation
of 2026-11-22), attempt 1. Batch C of seven; A is #544, B #545.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/mejoras-c-chat` from `origin/main`
`2697f002c`.
Ending commit/tree and changed files: content commit `ac52d443a` (tree `4643fa9e5`): 22 files changed, 1031 insertions(+), 87 deletions(-), under `apps/studio` and `docs/plans`; this record is the next commit.

## Outcome

- A message to the room is drawn at once, dimmed with «Sending…», and the bar empties; it is drawn exactly once
  before, during and after the reply. A lost reply's row offers Try again under its key; a refused message goes back
  to an empty bar, or keeps a row of its own, whole, until its own Try again lands.
- A new message from someone else peeks beside the closed chat for 6 s (author, first line), said politely; a press
  opens the chat.
- One author's run within a minute shows one name and time; the name stays for screen readers, the time shows under
  the pointer.
- In Invite, a refused copy says so in Your data's words and hands the link over in a focused, selected field.
- Pending: the visible words in the note's table, for Luis.

## Evidence

- Dev stack (:5176, the same API as the evaluation's :5173): with every `POST` held 5 s the row showed in 11–12 ms at
  0.55 opacity, and the words were drawn exactly once at every half second; a 500 put the words back in the bar with
  «That didn’t go through. Try again.», the retry wrote one; a lost reply's row sent it again, one message; A refused
  while the bar held B kept its row through B's send, its Try again wrote it once; Davide's message from another tab
  peeked at Luis over the corner and opened the chat; a run of three showed one name; a refused room-link copy showed
  the link selected (the link created for it was turned off again). Test messages were written to the dev discussion.
- Studio units: 2553 pass; the 2 failures are the known Windows-only ones, as on main.
- `pnpm lint` 0, Studio `tsc --noEmit` 0, Prettier clean.
- Playwright through `pw-gentle.ps1`, one worker: `chat-pace` and `room-discussion`, 24 passed; `room-chat-replies`,
  `chat-times`, `invite-members`, `room-dock`, `goals-overview`, 49 passed. Before them, a run stopped by the guard (RAM
  5.7 GB) and one with 8 failures: the lost-reply row given up when the feed showed the message (now kept, see the
  note), an empty discussion's baseline that never peeked, and the spec reading the copy notice as an alert.
- One independent review of the whole diff before the push: two P1s, four P2s and P3s; all fixed but the three lines
  in the note's «Left».

## Decisions and changes

- The row is a portal from the composer into a slot after the discussion: no state lifted out of the send pipeline.
- The fixture's receipt names the entry's id, as the API's does (the message acts already rely on it).
- The lost reply's line above the bar is not repeated while online: the row carries it; offline words unchanged.
- A refused copy in Invite is said in place, in Your data's approved words, not in the app's toast (which lives above
  the projects).

## Remaining obligations

- The PR is not merged; CI's browser job is the run on record.
- Words pending Luis's approval (the note's table); the toast for a message out of the room's sight is a decision.

## Next bounded action

Luis reviews the PR. Batch D (`ui/mejoras-d-llamada`: a reload rejoins or offers to; «Let in instead» lasts) follows.

Source IDs consulted: `AGENTS.md`, `CONTRIBUTING.md` (Studio UI, the room's side panel), `docs/plans/chat-times.md`,
`room-discussion.md`, `reliability-held-on-reload.md`, `drafts-survive-reload.md`, `work-copy-links.md`.
