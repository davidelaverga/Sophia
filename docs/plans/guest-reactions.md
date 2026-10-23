# A guest is not offered React

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §2, fault 1). A guest in the call pressed React, saw
> «You 👍» float up, and nobody else did. Studio only.

## Cause

- The API signs a guest's room token with no data channel. `canPublishData` is set only when the standing carries a
  role (`apps/api/src/livekit.ts`: «guests keep their media-only grant»).
- The dock offers React to everyone in the call (`RoomDock.tsx`, `LiveControls`), and a guest's room is the same stage
  (`GuestRoom` → `RoomStage`).
- A reaction is shown here first, then sent as best effort, and the failure is let go (`useProjectRoom.ts`,
  `useReactions`). So the guest believes they reacted.

## What changes

- **`LiveControls`** offers React only when the token's signed standing is not a guest's (`me.standing`, read from the
  token's metadata by `standingOf`). That is the API's own rule for the data channel. A member's dock is unchanged.
- Nothing else sends a reaction: React is the one caller of `room.react`, and it has no key.
- **Not changed:** whether a guest may react at all. That needs a data grant for guests, which is the API's to decide.

## Checks

- **`call-reactions.spec.ts`:** a guest let in through the door (`join.html`) has no React in their dock; a member in
  the call keeps it.
- **The fixture:** the guest's page signs its viewer as a guest (`signViewerAs`, `fake-livekit.ts`), as the API's
  token does. Until now the fake LiveKit listed every viewer as an admin.
