# Room: follow-ups to #122 and #123, the walk and following

> 2026-10-06 · Luis · PR 21 of the room's $20 plan · the P2s Codex left on #122 and #123, merged by the no-P1 rule · "Sigue con el juego arriba pero en low pririty"

## What changes

**Following is whole again after a reconnect** (#123, `following-signal.ts`):
- **Back from a drop:** a client back from a drop asks the members in the call what they follow, and they answer, even «nothing» (`{ ask: true }` on the same topic; the answer goes only to the asker).
- **Forgotten until answered:** what it heard before the drop is forgotten until then. LiveKit keeps no reliable packet for a receiver that was away.
- **Mine, even nothing:** it says what it follows to everyone again, «nothing» included, so a «stop» lost in the drop doesn't leave others counting it.

**Leaving the stage, or the project, says «nothing»** (#123, `StagePresent`): a follower who goes to Work, Resources, another view, home or Personal without leaving the call stops being counted. When the stage goes, or the project is kept out of sight (`background`), it says «nothing»; back, it says the version again.

**Only under the vision flag:** the resync after a drop and the answers to asks run only there. Without the flag nobody follows anything, and nothing is said.

**The fixture's connection forgets what was said** (#123, `fake-livekit.ts`). Each call starts afresh, so a rejoin says its version again, as the real one does.

**Sophia's walk reaches every heading** (#122, `PresentedReport`):
- A move to a subsection (an H3 under an H2) brings that heading to the top and says where she is.
- The index still marks only its sections; the nearest section above the heading is marked.

**Each of her moves is said** (#122): a move to the same section again is announced again. The status's words are drawn anew for each move.

## Checks (written first)

- **Units** (`voice-trail.test.ts`): a walk to a subsection finds its heading, and marks the section above it.
- **Units** (`following-signal.test.ts`):
  - after a reconnect, the client asks, forgets what it heard, and says «nothing» too;
  - an ask is answered to the asker only, «nothing» included;
  - a guest's ask is ignored;
  - without the flag, a drop says nothing and an ask goes unanswered.
- **Browser:**
  - `room-walk.spec.ts`: two moves to one section are both said (the status's words are drawn anew);
  - `room-following.spec.ts`: going to another view while following says «nothing»; so does going home with the call on, and coming back says it again; a rejoin says the version again.
