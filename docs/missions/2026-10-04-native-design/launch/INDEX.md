# Launch sequence

Start Claude Code and Codex separately; a GitHub comment does not launch either one.

For the current PR, use [Claude — M75](CLAUDE_CODE_M75.md) and [Codex — M75](CODEX_M75.md). They recover the actual PR and use existing issue #31 with new M75 message IDs.

For the new feature, use [Claude — SDD-01](CLAUDE_CODE_SDD01.md) and [Codex — SDD-01](CODEX_SDD01.md). They bind the final M75 source and create/reuse one actual SDD-01 coordination issue within existing authorization. The feature PR number is intentionally not prefilled.

Provide this pack to both harnesses or install it once under an owner-approved repository documentation path and give both agents the same commit. Do not assume the other machine has this conversation's sandbox path. The prompts name documents relative to the pack and require the harness to resolve its actual location.

Local implementation/review can proceed within the launched assignment. Hosted changes, merges with effects and paid model/app tests require real scope-bound authority; templates with null approvals are not instructions to execute them.

**Resume pointer template:** `M75/SDD-01: read <actual message ID> on <actual issue URL>, recover the exact candidate and operation revision, and act only within its scope.` The pointer wakes/addresses the agent; all durable detail remains in the message and pack.
