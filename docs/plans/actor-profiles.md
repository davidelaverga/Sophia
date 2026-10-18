# A person names themself; nobody is named by their address

> 2026-10-16 · FND-C1-PROFILE, #365 sections 6 and 8 (`Refs #365 — sections 6, 8`). Lane C of the foundation
> continuation. Stacked on #379 (0061), because 0062 replaces the `activity_name` that #379 adds. Migration 0062, amendment
> A32, both reserved for lane C by P's census.

## What was wrong

The API called the token's email the actor's name (`auth.ts`). That one value was used two ways:

- **as contact:** matching a member invitation (A16) and the addresses A26 offers an admin;
- **as a name**, which every member read:
  - kept on messages (0048), notes and decisions (0049) and carried notes (0021);
  - kept by the room (0050), and from there returned for the members (A25) and the activity (0057, 0061);
  - signed into LiveKit tokens, so everyone in a call and the Work list read it.

An account with no other name was therefore shown to every member by its full address. The Studio cut addresses to
their first word, but the API still returned them whole.

## What changes

- **Contact and name are separate.**
  - `Actor.contact` is the verified email: invitations match on it, as they did.
  - `Actor.name` is now only the account provider's name (`user_metadata.full_name`, `name`, `user_name`,
    `preferred_username`, in the Studio's order). It is never an address.
- **One profile per account** (`sophia.actor_profiles`):
  - a display name of 1–60 characters, trimmed, with no control or invisible characters and no `@`;
  - a `chosen` flag and a `revision`.
  - The provider's name seeds the profile until the person chooses one, and never replaces a name they chose.
- **`GET` and `PUT /api/v1/me/profile`** (A32):
  - The actor is always the token's subject. A request cannot say whose profile it is, so nobody can change anyone
    else's name.
  - `PUT` is compare-and-set on `revision` (0 before any edit) and idempotent per actor and key.
- **One reader names people: `sophia.actor_label(project, actor, kept)`.** It returns the first of:
  - the person's current display name, while they are or were in the project;
  - else what the row kept, unless that is an address;
  - else null.

  It answers only a member of the project. Every shared reader goes through it:
  - discussion, snapshot and earlier pages;
  - notes, and the proposer and decider of decisions;
  - members;
  - activity (a guest still falls back to the name they gave at the door);
  - carried notes («A member» when there is no name, as before).

  Invitation readers turn an inviter address kept before 0062 into null. New invitations keep the inviter's display
  name. LiveKit tokens carry the display name, or no name.
- **The room's address book stays an address book.**
  - `remember_room_name` keeps the contact, so A26's offer to admins is unchanged.
  - `name_from_room` gives a voice write the speaker's display name, not the kept address.
- **A rename shows on everything the person wrote before.** Author ids, text and times are untouched. Kept names stay
  as they were written; the readers no longer show an address from them.

## Compatibility

- **API from before 0062 on a database with 0062:** it keeps working. It still sets the email as `sophia.actor_name`.
  - `remember_room_name` reads that as the contact.
  - The new readers never show an email that a row kept.
- **API with 0062 on a database without it:** not ready. `REQUIRED_SCHEMA` needs `name_actor`, `my_profile`,
  `set_my_profile` and `actor_label`; `readiness.db.test.ts` has a «without 0062» step.
- **Studios built before A32:** they keep working (tolerant readers). Only descriptions changed on existing fields.
  `name`/`authorName` may now be null where an address used to be; the Studio already shows «A member» for that.

## DTO and route mapping for the Studio

| Route | Request | Answer | Refusals |
|---|---|---|---|
| `GET /api/v1/me/profile` | none | `Profile` | 401; 403 guest |
| `PUT /api/v1/me/profile` with `Idempotency-Key` header | `ProfileUpdate` | `Profile` | 401; 403 guest; 409 `stale_revision` or `idempotency_conflict`; 422 `invalid_request` |

```ts
type Profile = { displayName: string | null; chosen: boolean; revision: number }
type ProfileUpdate = { displayName: string; expectedRevision: number } // 1–60 characters; the service trims
```

- **Client calls:** `parseProfile` from `@sophia/contracts/validate`; operation ids `getMyProfile` and `updateMyProfile`.
- **Retries:** after an ambiguous reply, send the same key and body again; a new key is a new edit.
- **What a 422 means:** a blank name, one with `@`, a control or invisible character, or more than 60 characters.
- **After a rename:** names update on the next read. No project event is emitted, because a profile belongs to no
  project.
- **Fields that now carry display names only:**
  - `DiscussionEntry.authorName`, `MissionEntry.authorName`;
  - `MissionDecision.proposedByName` and `decidedByName`;
  - `ProjectMember.name`, `ActivityEntry.actor.name` and `target.name`;
  - `ProjectRelease.ownerName`, `PendingInvitation.inviter` and `InvitationPreview.inviterName`;
  - the LiveKit participant `name`.
- **Unchanged contact fields:** `InvitablePerson.email` and the invitation's `email`.

## Not here

- No Studio change and no flag. Enabling the profile editor is Luis's step after deployment.
- **Reserved names.** Nothing stops a display name from being «Sophia». A LiveKit participant's identity, not its name,
  says who Sophia is.
- **Name uniqueness.** Two people can share a name; actor ids identify them.
- Avatars (#365 section 9), mentions, Needs/Updates, corrections, search and tasks follow as separate packets.
- **Admins see addresses.** A26 shows an admin the addresses of people they share another project with. That is
  existing contact behaviour, kept, and noted for the D-NAMES ratification.

## Checks

- **`auth.test.ts`:** the email becomes the contact, never the name; the provider's name is trimmed, at most 60
  characters, and never an address.
- **`profile.db.test.ts`:**
  - reads, seeding and the provider's name;
  - a trimmed set, an idempotent replay, the reused-key and stale-revision conflicts;
  - blank, address, control, invisible and overlong names refused, with nothing kept;
  - only one's own profile changes: no actor field, a key is required, guests are refused;
  - a chosen name survives a provider rename;
  - an earlier message shows the current name, with its id, time and author row unchanged;
  - old rows that kept an address read null, and a kept non-address name stays;
  - members, the brief and the activity carry no address, while the room still keeps addresses;
  - the inviter is named by display name, and an old address reads null;
  - an invitation still matches by address.
- **Updated controls:** `access.db.test.ts` (members, discussion author, pending inviter), `mission.db.test.ts` (brief
  and voice names), `rooms.db.test.ts` (LiveKit name), `personal.db.test.ts` (carried note).
- **`readiness.db.test.ts`:** not ready without 0062.
