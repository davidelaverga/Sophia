# Implementation-session handoff

Goal and attempt: HOST-CONTROLS (an admin mutes or removes someone in the call; point 8 of the gaps report; Luis:
«Sigue con los puntos del informe que necesitan API»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `api/host-controls` from `api/discussion-earlier`
(stacked, so the contract's generated files and amendment numbers stay in one line)
Writable scope: this worktree only (`packages/contracts`, `packages/persistence`, `packages/ui`, `apps/api`,
`apps/media-bridge` (a LiveKit test only), `apps/studio`, `scripts/livekit-test.ts`, `docs/plans`, `docs/handoffs`);
no migration, no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record (Docker Desktop doesn't start on the host, so the DB and LiveKit suites run in CI only).
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `e6a79f857596` (tree `031c66e4d148`), the last commit of `api/host-controls`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 23 files changed against
`api/discussion-earlier` at that commit: `apps/api/src/api.db.test.ts`, `apps/api/src/livekit.ts`, `apps/api/src/routes/rooms.ts`, `apps/media-bridge/src/host-controls.livekit.test.ts`, `e2e/host-controls.spec.ts`, `e2e/tabs-scale.spec.ts`, `fixtures/fake-people.ts`, `fixtures/fixture-api.ts`, `fixtures/room.tsx`, `src/api/client.ts`, `src/app/theme.css`, `src/features/studio/PeoplePanel.tsx`, `src/features/studio/SidePanel.tsx`, `src/features/studio/StudioShell.tsx`, `src/features/studio/side-panel.ts`, `docs/plans/host-controls.md`, `packages/contracts/amendments/A24-host-controls.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/src/generated-types.ts`, `packages/persistence/src/index.ts`, `packages/persistence/src/room.ts`, `packages/ui/src/Icon.tsx`, `scripts/livekit-test.ts`. The review notes below name the commit of each later change.

## Outcome

- **A24:** `POST /api/v1/projects/{projectId}/room/people/{identity}/mute` and `…/remove` answer 204, with no key:
  doing either twice is the same as once.
- **Checks, in order:**
  1. The caller is an admin, by `hostedRoom` in persistence (403 otherwise).
  2. The target isn't the caller (422). Sophia's identity isn't a UUID, so the schema refuses it (422).
  3. A room server is configured (503 otherwise).
  4. The target is a member in the call, by the standing the API signed into their token (422 otherwise). A guest
     leaves by the door's Deny (A07).
- **LiveKit** (`livekit.ts`):
  - `muteMicrophone` mutes their published microphone track, which only they can turn on again;
  - `removeFromCall` disconnects them;
  - `memberInRoom` reads their standing.
- **Studio:**
  - The side panel gains «People» (key P, kit icon `people`) between Chat and Brief: everyone in the call, you first,
    each with their role and microphone.
  - For an admin, each other member has the menu «Actions for {name}» (kit icon `more`): «Mute microphone» while it
    is on, and «Remove from call».
  - A refusal is said on the row. Esc closes that menu without closing the panel.
  - A guest's row offers nothing.

## Evidence

- Plan: `docs/plans/host-controls.md`.
- Written first and failing (commit `f38c225a`):
  - `api.db.test.ts` «host controls (A24)»: refusals, and the 503 past them;
  - `host-controls.livekit.test.ts`, beside the bridge's LiveKit test, which already joins rtc-node people and
    imports the API's LiveKit module: mute, remove, and a guest or someone absent is not a member here;
  - `host-controls.spec.ts`. Run without the change, all 5 cases failed (no People panel).
- **After the change, locally:**
  - `host-controls.spec.ts`: 5/5. The first run caught Esc in the menu closing the whole panel, which is fixed.
  - Room dock, people, tiles, call keys, side-panel and passage specs: 54 + 16 + 132 + 53.
  - `tabs-scale.spec.ts` was updated: ArrowRight from Chat now goes to People, then to Brief.
  - `side-panel.test.ts`: 10/10.
  - Type-aware lint over the whole repo, typecheck, Prettier and `contracts:check` are clean.
- **Not run locally:** the DB and LiveKit suites. CI runs them.

## Remaining obligations

- CI; Codex with no open P1. It merges after the earlier-discussion PR, retargeted to `main`.
- **Not done:**
  - the muted person's own notice («An admin muted your microphone»): their microphone shows off, and they can turn
    it on;
  - host controls for guests beyond the door's Deny.
