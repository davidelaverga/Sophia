# Implementation-session handoff

Goal and attempt: who follows what is shown (`docs/plans/room-following.md`), attempt 1. It is PR 17 of the room's $20 plan, behind the vision flag (A14's «N following», issue #105).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/following` on `room/walk` (#122), 2026-10-06
Ending commit/tree: the content commit «Room: who follows what is shown (A14 on the fixture, behind the vision flag)», the parent of this handoff's commit.

## Outcome

**Saying what one follows:** under the vision flag, each member says the version they follow, or nothing, in a reliable data packet on its own topic (`sophia.following.v1`, `following-signal.ts`).
- It goes to members only, and only when it changes.
- It is said again to whoever joins, and to all on reconnecting.
- It is read by the sender the SFU authenticated. Guests are ignored and receive nothing; whoever leaves is forgotten.

**The count:** whoever shows a report sees «Shown by you · 2 following», announced politely. Followers see no count, because it would be ambiguous for them.

**Not a participant attribute** (A14's first idea). Setting one's own attributes needs `canUpdateOwnMetadata`, which would let a participant rewrite the standing the API signed, and the media bridge trusts it. That grant was refused on purpose, and nothing is asked of the API.

**Independent review, two passes:**
- **First pass:** two P1s:
  - the attribute was written on every render, because an unstable `setFollowing` was in the effect's dependencies;
  - the proposal asked for `canUpdateOwnMetadata`.
- **The fixes:** the packet design, a stable `setFollowing`, and sending only on a change. Also done: the count only for whoever shows it, a polite live region, and nothing sent to guests.
- **Second pass:** no P1 or P2. Its P3s (two stale comments) are fixed.

## Evidence

Runs used the guards' gentle mode, beside Luis's games at Idle priority, on his word.

- **Units:** `following-signal.test.ts`, 5 of 5. With a fake Room, it checks that the signal:
  - sends only on a change, and never to a guest;
  - tells whoever joins;
  - keeps what it hears by sender, and ignores guests and other topics;
  - forgets whoever leaves;
  - and that the codec reads only well-formed packets.
- **Browser:** `room-following.spec.ts`. With room, report, walk and present, 80 of 80 pass. room and report also check what the connection is asked.
- **Mutations** (`light_mutants.py`): before the redesign, 3 of 4 were killed (nobody counted, following never said, a stop not unsaid), and the control survived. The fourth, «showing said as following», survived because its guard was redundant, so the guard was removed. After the redesign, the exact-sequence check covers sending only on a change.

**Gates:**
- `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.

**Source-register IDs consulted:** none.

## Remaining obligations

- **#105:** A14's note should say «a members-only data packet», not a participant attribute.
- **This PR** awaits #121 and #122, CI and Codex.

## Next bounded action

Approve a version or request changes, on the fixture behind the flag. Then a passage to a task.
