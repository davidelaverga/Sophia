# More for the host: everyone muted, a camera or a screen stopped

> 2026-10-15 · Follows host-controls.md (A24): an admin mutes someone's microphone or takes them out of the call. A
> meeting's host also needs to mute everyone at once, and to stop someone's camera or screen share. Meet, Zoom and
> Teams all offer the three. Luis's queue, item 3.

## What changes

- **Room server** (`livekit.ts`):
  - `stopCamera` mutes their published camera track;
  - `stopScreen` mutes their screen share and its audio;
  - `muteEveryone` mutes every other person's microphone (members and guests, never Sophia's participant) and says how
    many were muted.
  - As with A24's mute, only they turn it on again.
- **The Studio's own call:** a screen share muted by the host stops sharing, so the browser's capture ends too. A
  camera muted by the host reads as off, as LiveKit reports it.
- **Migration 0060:** `sophia.record_room_act(project, target, act)`, the evidence after the room server has acted.
  - `camera` and `screen` on a member emit `room.host_camera_off` and `room.host_screen_off`.
  - `mute_all`, with no target, emits `room.host_muted_all`.
  - Admins only; an unknown act is refused.
  - A24's `record_host_act` is untouched.
- **Contract amendment A31:**
  - `POST /api/v1/projects/{projectId}/room/people/{identity}/stop-camera` and `/stop-screen`, members only as A24's;
  - `POST /api/v1/projects/{projectId}/room/mute-all`.
  - Each answers 204, and twice is the same as once.
- **Studio** (`PeoplePanel`):
  - A member's menu gains «Turn off camera» while it is on, and «Stop screen sharing» while they share, each with its
    under-way and refused words.
  - For an admin, while someone else's microphone is on, «Mute everyone» at the panel's head asks first.
  - Activity names the three acts.
- **The sanitizer** knows the three events.

## Checks

- `persistence.db.test.ts`, «room acts (0060)»:
  - camera, screen and everyone are recorded with their target, or none;
  - an editor is refused, and so is an unknown act.
- `readiness.db.test.ts`: not ready without 0060.
- `host-controls.spec.ts`:
  - an admin turns a member's camera off, and stops a member's screen;
  - «Mute everyone» asks first, then every other microphone is off;
  - an editor has no «Mute everyone».
