# Implementation-session handoff

Goal and attempt: CALL-REACTIONS (reactions in the call; point 6 of the gaps report; Luis: «Sí, hazlos en ese orden»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `ui/call-reactions` from `ui/call-backgrounds`
(#342), since both touch `livekit-room.ts`
Writable scope: this worktree only (`apps/studio`, `packages/ui` for the icon, `docs/plans`, `docs/handoffs`); no
deploy.
Runtime unit: Luis's Windows host; CI as the run on record.
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: pending

## Outcome

- **The rules:** `reactions.ts` holds the six, the packet, the pace of 400 ms and the newest twelve.
  `reaction-channel.ts` listens on the reaction topic and keeps only one of the six from a person in the room, never
  from Sophia's participant.
- **The connection:**
  - `livekit-room.ts` adds `sendReaction`, on the topic `sophia.reaction`, and the callback `onReaction`.
  - `useProjectRoom.ts` gains `reactions` and `react` through `useReactions`, in the conversation's layer, so a call's
    end clears them.
- **The UI:**
  - `ReactMenu.tsx`: React in the dock, a round square with the kit's menu.
  - `Reactions.tsx`: the floating log, beside the dock and outside its measured box.
  - `packages/ui` gets a `react` icon.
- Fixture: the fake LiveKit records `reaction:<emoji>` and runs the Studio's own listener.
  `window.fixture.reactFrom(name, emoji)` sends any emoji as another person would.

## Evidence

- Plan: `docs/plans/call-reactions.md`.
- Written first and failing (commit `3afc1804`): `reactions.test.ts` and `call-reactions.spec.ts`.
- After the change:
  - `reactions.test.ts` passes 4/4.
  - Studio unit tests: 1238 pass.
  - Type-aware lint over the whole repo, typecheck and Prettier are clean.
- **Not run here:** `call-reactions.spec.ts` and the room suites, because the machine had too little free memory for
  the guard to start a browser. CI is the run on record.

## Remaining obligations

- CI, the new spec above all; Codex with no open P1. Retarget to `main` once #342 merges. Next from the report: point 10
  (⌘K to a project by name; search and sort in Work's list).
