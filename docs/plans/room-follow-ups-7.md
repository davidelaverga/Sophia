# Room: follow-ups to #130

> 2026-10-06 · WBC-02-CC-0039, for Codex's review · the four P2s Codex left on #130, reproduced by Codex on merged main `52819159` · a small separate PR from main, behind the vision flag

## What changes

**Each call has its own following** (`useFollowing`, `StagePresent`). Leaving and joining again is another call. What the last call followed stays with it and is never written under the new call's key. The new call follows nothing until Follow is pressed there. A Stop following owes its focus to that call only. Back in a call, what it followed is followed again, and back from another view too, as before. A call's number comes from one page-wide count (`newCall`, `useProjectRoom`). So a room mounted again never reuses an earlier call's number, nor what that call followed (Codex on #138).

**Following after a reconnect keeps what it heard since** (`following-signal.ts`). What was heard before the drop is forgotten once the ask is published, as before. An answer heard since stays, even the same version heard again in the same clock tick: each word heard is numbered as it arrives, not timed. Failed asks are still asked again, and a later drop or the call's end still stops them. Guests are still never asked.

**A recap not yet read neither takes nor doubles the leave's recap** (`RecapSheet`, `useLeftCall`; Codex on #130 and #138). Until its recap is read, a sheet goes by what its opener knows. Search now knows too: it reads the project's latest meeting as a recap hit opens. While neither has said, the sheet can't tell, and a leave's recap waits until it can, or until the sheet closes. A failed read says nothing about the meeting, so the sheet still can't tell; its Try again, or closing it, settles the wait.
- Leaving from a past meeting's sheet opens the recap of the meeting left, on top.
- Leaving from the running meeting's sheet, opened from Search or from Updates, opens no second. That holds even before anything says it runs, and when the latest meeting can't be read.

**«After the meeting» waits for every task running at close** (`AfterMeeting`, `pollAfter`). The tasks running at close are kept as the sheet opens. It is read again every four seconds until each has its own `work_finished`, or for ten minutes at most. The first task to finish no longer ends the wait for the others. Nothing new is said on screen.

## Checks (written first)

- **Units:**
  - `following-signal.test.ts`: answers heard between the drop and the published ask are kept: a changed version, the same version in the same tick, a second member's, and «nothing». So is an answer between a refused ask and the one published. An answer heard only before the drop is forgotten.
  - `recap-view.test.ts` (`recapping`, `leaveRecap`): a sheet goes by its recap once read, else by its opener. It can't tell while neither has said, even after a failed read. A leave's recap opens only when no sheet recaps the running meeting, and waits while one can't tell. It opens once the sheet tells or closes, and a second leave while the first waits takes the wait over.
  - `new-call.test.ts`: a call's number is never another's.
  - `recap-view.test.ts` (`pollAfter`): the first of two finished still polls, and both finished stops. Only a task's own finish after the close counts: an earlier one, a version made, another task or no task does not. No work never polls, nor does ten minutes.
  - `search-view.test.ts` (`hitRunning`): running only when the latest meetings say so, and unknown until they are read.
- **Browser:**
  - `room-following.spec.ts`: after leaving and joining again, the report is offered, not followed, until Follow.
  - `room-following-keys.spec.ts`, on its own fixture page (`fixtures/following-keys.tsx`): the stage's useFollowing as calls change. A fresh call follows nothing, back to a call follows its choice, and a Stop following owes nothing to the next call.
  - `room-search.spec.ts`: a past meeting's recap from Search, with its recap and the latest meeting both unread: the leave's recap waits, then opens on top once the latest meeting says it's past. The running meeting's recap from Search, its recap unread, opens no second, whether the latest meeting was read before Leave, after it, or can't be read at all. Closing a sheet that can't tell lets the leave's own recap open, even after both of its reads failed.
  - `room-return.spec.ts`: with two tasks running at close, the second's outcome still comes into the open sheet. Then nothing is read again.

## Not here

The Room fixtures that open Project PRs are changing (`fixture-api.ts`, `room.tsx`, `meeting-data.ts`) are untouched. The second task is the check's own: it wraps the page's fetch. The fixture's LiveKit stand-in replaces `livekit-room.ts`, where the following signal is wired, so the reconnect is checked on the real module with controlled events, not in a browser. The room fixture keeps the project mounted, and adding a remount means changing `room.tsx`, so a remounted room's call number is checked by its unit test, not in a browser. A second leave while the first waits can't be reached through the page: the sheet is modal, and its call row has no Join. It is checked by `leaveRecap`'s units.
