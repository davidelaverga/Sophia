# The improvements PRs' open P2s (#544–#556), answered

Luis 2026-11-26, «Sigue con los P2, en orden». The P2s were frozen on the merged PRs (#544–#556): no more pushes there.
This change answers them in one place, in PR order, one commit each. No new words for people except where a P2 asked
for one to move (none here), and no endpoint is invented.

## What each answer is

| PR | P2 | Answer |
| --- | --- | --- |
| #544 | People before joining doesn't mark guests | **Not here.** `ProjectSummary.room.people` carries names only; marking guests needs the API to send the condition. Left for Davide's lane. |
| #544 | A failed presence refresh keeps the old attendees as current | `presenceRead` (room-presence.ts): a failed latest read is unknown, even with an older answer kept. |
| #544 | A stopped goal with a note shows the note alone | `rowLine`: at rest (held, holding, stopping, stopped), the state leads and the note follows («Stopped · 1 of 5 done · …»). |
| #545 | Back to an earlier Studio entry writes the held panel over `?panel=` | `useOnBackForward` (app/): after each Back or Forward, the shell reads `?panel=` again before writing, as the lens is read. |
| #545 | Back/Forward don't restore the Invite sheet | The same hook: the sheet opens or closes as the entry's `?invite=` says, and an open sheet takes the tab it names. |
| #546 | A refused row retried with a lost reply stays «Not sent» | The row goes by the message sent, not by `again`: the unknown line's Try again sends the row's own message, and the row goes when it lands. |
| #546 | A new draft with the same words is cleared when the first lands | `recorded` no longer clears the bar: it emptied as the message went, so what it holds is new words. |
| #546 | A refused row back in the bar loses its mentions and reply | A row's own refused Try again keeps its row, which holds the whole message (the bar can't take mentions or a reply back). |
| #547 | The Decline's timer keeps rescheduling at 1 ms after the minute | `nextExpiry(declined, now)` looks only ahead: past the last minute nothing is scheduled. |
| #547 | J and the palette join without the reload's options | The reload offer moves up to the stage (`useReloadOffer` in RoomStage), which hands it to the dock and to the join command alike. |
| #554 | 98 px of card in a 75 px box at 390 × 844 | **Already gone with #556**: the card is one row, and room-made.spec measures where its words end at 390 × 844 with two captions (green on main). |
| #555 | Escape on an extra in the row is swallowed by the closed tray | The tray takes keys only while open. |
| #555 | The focus is dropped when the fold changes | The fold's observer runs open or closed and hands the focus over: a hidden extra → More controls; More controls gone → the first extra back in the row. |
| #555 (on LobbyPanel) | A Decline all that fails partway loses the undo of those that went | `decide` says which entries went; `keptAfter` keeps their «Let in instead». |
| #556 | On a phone, Show everyone's failure squeezes the title | The row wraps and the failure takes its own line under it (order 1, full width, indented as a failed read's line). |

## Checks

- Unit: `goals-glance`, `room-presence`, `room-message-send`, `lobby-undo` (new cases each); the Studio's units 2658/2660
  (the two Windows-only failures, `attention` and `browser-imports`, fail on main too).
- E2E added: focus-kept (panel and Invite by Back/Forward), chat-pace (same words kept; refused row's lost retry),
  call-way-back (J after a reload in text mode), dock-fold (Escape in the row; focus across the fold), room-present
  (failure under the row, desktop and @phone).
- Each case was walked first on the fixtures in the app's browser pane (Opera was open, so the Playwright guard would
  refuse): Back/Forward panel and Invite, the refused row's lost retry, the same-words draft, Ctrl+J after a reload in
  text mode (`connect`, `text:on`, no microphone), the fold's focus both ways, Escape in the row (not prevented), and the
  made row at 375 × 812 dark and paper (title 132/132 px, the failure on its own line, content inside the box).
- CI is the record for the specs.
