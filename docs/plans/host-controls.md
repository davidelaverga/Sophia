# An admin mutes or removes someone in the call

> 2026-10-15 · Point 8 of the gaps report (`evaluacion-2026-10-15/informe-brechas-funcionales.md`): in Meet, the host
> mutes a noisy microphone or takes someone out of the call from the people list. Here an admin could do neither, and
> the call had no people list beside the tiles (only «+N» past the cap). Luis: «Sigue con los puntos del informe que
> necesitan API».

## What was measured

- The API already removes a guest after a Deny or Block (A07): the removal is pending until the worker's LiveKit call
  lands (`removeParticipant`, migration 0014). Admitted guests and their removal state show in the door's list.
- Members have nothing. LiveKit's server can mute a published track (`mutePublishedTrack`), though only its owner can
  unmute it, as in Meet. It can also remove a participant (`removeParticipant`).
- The Studio says «You were removed from the call» on LiveKit's `PARTICIPANT_REMOVED` (`call-end.ts`). The side
  panel holds Chat and Brief. «In the call» opens only from «+N».

## What changes

- **Contract amendment A24:**
  - `POST /api/v1/projects/{projectId}/room/people/{identity}/mute` turns off that member's microphone;
  - `POST /api/v1/projects/{projectId}/room/people/{identity}/remove` takes them out of the call;
  - both answer 204 and need no key, since doing either twice changes nothing more.
- **Checks, in order:**
  1. The caller is an admin of the project (403 otherwise; a non-member looks the same).
  2. The target isn't the caller (422). Sophia's identity isn't a UUID, so the schema refuses it.
  3. A LiveKit server is configured (503 otherwise).
  4. The target is in this project's room as a member, by the standing the API signed into their token (422
     otherwise). A guest leaves by the door's Deny, which keeps its pending removal and retries.
- **Mute:** their microphone track is muted; with no microphone on, nothing is done.
- **Remove:** they are disconnected. A member can join again, as an invited person can in Meet. Taking someone out
  of the project is a different act.
- No database write and no event, since neither act changes a record. The call's own state shows the change to
  everyone.
- **Studio:**
  - The side panel gains «People» (key P) between Chat and Brief: everyone in the call, you first, each with their
    role and whether their microphone is on.
  - For an admin, each other member has a menu «Actions for {name}»: «Mute microphone» while it is on, and «Remove
    from call».
  - A refusal says so in the panel.
  - The person muted sees their microphone off, and can turn it on again. The person removed sees what the Studio
    already says.

## Checks

- `api.db.test.ts`, «host controls» (no LiveKit server in that suite):
  - an editor and an outsider are refused (403);
  - an admin aiming at themselves is refused (422), and Sophia's identity too;
  - an admin aiming at another person reaches the room server, so with none configured it is 503.
- `host-controls.livekit.test.ts` (`pnpm test:livekit`, real LiveKit and rtc-node participants):
  - a member's published microphone is muted;
  - a member is removed;
  - a guest and someone not in the room are refused.
- `host-controls.spec.ts`:
  - People lists everyone, you first;
  - an admin mutes a member whose microphone is on, and removes one;
  - an editor sees no actions;
  - a guest's row offers none;
  - a refusal is said.
