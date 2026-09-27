# Implementation-session handoff: S1-04, attempt 1

- **Goal and attempt:** S1-04 "Build the shared Studio shell and real room transport", attempt 1.
- **Human owner / executor resource:** Luis (owner). The executor is Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** none.
- **Starting worktree/commit:** `s1-04/studio-shell`, branched from `s1-02/response-validators` (#6). It also carries the deploy branch (API origin, CORS, any-device sign-in).
- **Writable scope:** this repository. No hosted service was changed for S1-04: migration 0009 has **not** been applied to the hosted database, and no LiveKit service exists outside Luis's machine.
- **Ending commit/tree:** branch `s1-04/studio-shell`. The paths are the S1-04 rows of [DESTINATION_MAP](../DESTINATION_MAP.md).

## Outcome

Two signed-in people can open the same project, each in their own lens and view, without moving the other. They can join the project's LiveKit room, see who is there and who is speaking, and pass the input floor (who may address Sophia). The dock says plainly that Sophia's voice comes with S1-05. The record is in [docs/evidence/S1-04/2026-09-24-attempt-1.md](../evidence/S1-04/2026-09-24-attempt-1.md).

Not yet shown: **two people actually talking**. The Claude browser pane blocks microphones, and the dev LiveKit server listens on 127.0.0.1 only.

## Decisions and changes

- **Contract amendment A01** (`packages/contracts/amendments/`): the room is exposed in the snapshot, and `transferInputFloor` ships with S1-04 instead of S1-05, because acceptance needs the input role passed. The contract is now pack + JSON Patch amendments, checked by `contracts:check`. The generator still reproduces the pack's own types exactly from the pack's contract.
- **Migration 0009** (0008 went to the S1-02 review fix). Floor rules: free → anyone in the project may take it; the holder passes it; an admin reclaims it; viewers never hold it.
- **Room token:** a single-room grant, 600 s, microphone-only publishing, and viewers subscribe only. The display name comes from the verified token's email, never from the client.
- **Viewer-local state** lives on the device (per viewer and project). It is never a project mutation.
- **LiveKit loads on join**, so the first page stays at ~100 kB gzip.
- **Not done in this attempt:** `submitContribution` (sending the Converse draft to the shared conversation). It needs a text-to-source path, and the draft UI says sending comes later.

## Remaining obligations

- **A LiveKit server both founders reach.** LiveKit Cloud or self-hosted, chosen by Davide (cost). Then set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` on the API (Render) and run the two-person voice check.
- **Apply migration 0009 to hosted** (dry run, then apply) before deploying this branch.
- **Review:** amendment A01 and the floor rules need Davide's agreement.

## Next bounded action

- Luis and Davide: pick the LiveKit host. Luis deploys the branch and applies 0009. Both join from their own machines and talk, which closes the voice acceptance line.
- Then S1-05 (Davide) builds on the room: exchanges start against `room.revision` and the input floor.
