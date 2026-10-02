# Implementation-session handoff: the follow-ups to #42 and #43, attempt 3 (refresh one image, not all)

- **Goal and attempt:** Codex's P2 on #45 ([attempt 2](STUDIO-follow-ups-42-43-attempt-2.md)). Luis asked for it to be fixed.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `follow-ups/per-asset-refresh` from main `648a37c`, 2026-10-02.
- **End:** pending: the commit after the content commit fills it in.
- **Writable scope:** `apps/studio/src/features/explore/`, its fixture and checks. **Nothing else changed.**

## Outcome

- **The bug.** Attempt 2's fix made Back move a gallery-wide `attempt`, and so did Try again. Every tile whose read had failed then read its image again, on every Back or Try again, behind the person's back.
- **The fix.** Each asset now has views that hear its checks (`VerifiedImages.watch`). When any view's check of an asset settles, every view of that asset hears the result, so a tile shows what its detail read without reading anything. Try again checks that image only. Back reads nothing. The `attempt` counter is gone.

## Evidence

- **New check:** "going back or trying one image again reads no other image", with two images failing and one tried again. It fails if Try again reads every image.
- **Attempt 2's check** ("a tile whose read failed shows the image once it was read up close") fails if a tile doesn't hear its detail.
- **Twenty Explore mutations** each make their check fail, every run on a fresh fixture server.
- `pnpm --filter @sophia/studio test:browser`: 18 checks. With `--repeat-each=3` and 4 workers, 54 of 54 pass, twice.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 563 pass, plus the 5 known failures on Windows, as on main.

## Decisions and changes

- **A failed read is read again only on an explicit act:** opening that candidate, or its Try again. Nothing retries on its own, and nothing retries another image.

## Remaining obligations

- **From LFE-03:** Davide confirms the read shapes and where a candidate's bytes and the choice live (S1-06). The read and retry strategy will be revisited when S1-06 serves real bytes.
- **LFE-02:** waits for PR32.

## Next bounded action

- LFE-02 when PR32 is in `main`. LFE-03.2 when S1-06 has a route to bind.
