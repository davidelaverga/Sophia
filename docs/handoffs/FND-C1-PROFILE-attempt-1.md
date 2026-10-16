# Implementation-session handoff

Goal and attempt: FND-C1-PROFILE (#365 sections 6 and 8, #307; display profile and contact separation), attempt 1
Human owner / executor resource: Davide (assignment, relayed from P) and Luis (product, merge) / Claude Code lane C,
session `local_557a0040-996c-4a7f-874d-01449e49b493` (bound by P)
Native session: as above
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-c1-profile-names`, branch
`api/profile-names` from `origin/studio/activity-followups` at `22907b82db6e527478142bc59b472572cee67cfc` (#379's head:
stacked, because 0062 replaces #379's `activity_name`). Main at the start: `f6be9fa7cd7b83ca688878390d474f0f2899bf69`.
Writable scope: this worktree only. Covers `apps/api`, `packages/persistence`, `packages/contracts` (amendment A32,
generated outputs isolated on this branch for B's integration), `db/migrations/0062`, `docs/plans` and `docs/handoffs`.
No Studio file.
Runtime unit: Davide's macOS host (no Docker or PostgreSQL here); CI's `test:db` is the run on record for SQL.
Existing authority: Davide's forwarded C launch prompt (FND-01 pack, `launch/CLAUDE_SERVED_UX.md`); P's confirmation
relayed by Davide: lane C, slice C1 only, base #379 head, 0062/A32, new worktree. P's binding correction keeps 0062/A32
for C and moves B. No production, inference, delegation or desktop use.
Ending commit/tree: implementation `38ea60db4a73dea3f762d8dba60b359f3dc74777` (tree
`72496e675c5e25a82f090a263f7f5dff9ea374c1`), 31 files against #379's head; this record follows it on `api/profile-names`.

## Outcome

- **Contact and name are separate.** `Actor.contact` is the verified email, used only to match invitations and to fill
  the room's address book. `Actor.name` is the provider's name from `user_metadata`, and is never an address.
- **0062** adds:
  - `actor_profiles` and `actor_profile_writes`;
  - `name_actor`, `my_profile` and `set_my_profile`;
  - `actor_label` as the one shared name reader.

  It also replaces `remember_room_name` (now keeps the contact), `name_from_room` (now the display name),
  `project_members_named` and `activity_name`.
- **A32** adds `GET`/`PUT /api/v1/me/profile` (`Profile`, `ProfileUpdate`, `parseProfile`). It rewrites the
  descriptions of every name field so each says «display name, never an address».
- **Readers through `actor_label`:**
  - the discussion (snapshot and earlier pages);
  - the brief's notes and decisions;
  - members and activity;
  - carried notes.
- **Elsewhere:**
  - Invitation readers return null for an inviter address kept before 0062.
  - New invitations keep the inviter's display name.
  - LiveKit tokens carry the display name or none.
- **Not verified here:**
  - every `.db` test, the new `profile.db.test.ts` included, because this host has no PostgreSQL;
  - the live Supabase crossing;
  - the Studio;
  - production.

## Evidence

- `pnpm check`, exit 0: unit 2414 tests (2344 pass, 70 environment skips, 0 fail); integration gate 97 (95 pass,
  2 skipped for want of a disposable database, 0 fail). It ran on the tree just before three small edits, which were
  then checked with Prettier, oxlint and `tsc` on their own:
  - the SQL regex written as `\u` escapes;
  - a plpgsql variable renamed `cur`;
  - the test file's escapes and formatting.
- `node --test apps/api/src/auth.test.ts`: 6 of 6.
- `pnpm --filter @sophia/contracts run generate`, then `contracts:check` clean.
- SQL behaviour: CI's `test:db` on PostgreSQL 16 for the pushed head. The PR body records the run.

## Decisions and changes

- The display name is not copied over author rows. Readers resolve the current one, so a rename shows on earlier
  writing while author ids, text and times stay as they were. Kept names that are addresses are never shown.
- `room_names` keeps its name and its contact use (A26). It is no longer read as a name anywhere.
- No project event on rename: a profile belongs to no project. Readers pick the change up on their next read.
- Invitation matching is unchanged: the same email value now travels as `actorContact`.

## Remaining obligations

- **CI `test:db`** must pass on the pushed head before anyone calls this ready.
- **Combined source.** B integrates the shared generated outputs: `openapi.json`, `generated-types.ts`, the validators,
  `generate-validators.ts` and `validate.ts`. The same goes for `app.ts`'s `REQUIRED_SCHEMA` and
  `readiness.db.test.ts`, which Luis's #356/#368/#369/#379 also touch.
- **D-NAMES ratification** (Davide/Luis) stays open.
- **Admins see addresses.** A26 shows an admin the addresses of people from their other projects. That is unchanged and
  noted.
- **After deployment:** V deploys, then Luis enables a profile editor. The Studio is not touched here.

## Next bounded action

- **Review:** P/V review the PR, and automatic review covers its head.
- **Integration:** B takes the combined-source slot with this branch's diff.
- **Next packet for C:** Needs/Updates (#365 section 2), from P.
