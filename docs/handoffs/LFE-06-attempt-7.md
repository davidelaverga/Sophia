# Implementation-session handoff: LFE-06, attempt 7 (finding what needs someone, and the window's pace)

- **Goal and attempt:** Luis asked what more could improve the Resources view visually, and chose two things:
  - what needs someone, found at a glance among 20 tiles;
  - a meter that says more than a percentage.

  This attempt also closes #50's open P2.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/scan-pace` from main `14687b8`, 2026-10-02.
- **End:** pending: the commit after the content commit fills it in.
- **Writable scope:**
  - `apps/studio/src/features/resources/`: the new `pace.ts` and `order.ts`, their tests, the meter, the tile, the capacity block, the panel and the stylesheet;
  - the resource fixture (`spent=1`) and its checks;
  - CONTRIBUTING and LFE-06's records.

  **No contract, schema, API or dependency changed.**

## Outcome (UI)

- **By attention, by default.** The tiles come in this order:
  - what waits on an owner;
  - what is online, the most used account first;
  - hosts not known;
  - offline ones last.

  A sort control at the end of the toolbar also orders them by owner or by tool. A change of order glides the tiles, as a filter does.
- **A waiting tile stands out.** Its edge warms to amber.
- **An offline tile steps back.** Its mark is greyed, its words dimmer, and it says how long it has been gone ("Offline · 26 h").
- **The window's pace.** A meter carries a thin mark at how much of its window had passed when it was read. A fill past the mark is spending faster than the window.

  The window's length is never made up. The observation has no length field, so only a source whose window ids name a fixed length gets a pace: Claude Code's status line (`five_hour`, `seven_day`). Codex reports each window's own duration, which must be kept rather than assumed (`04_OWNER_RESOURCES.md` §7), and the observation can't carry it yet, so Codex has no mark. A spend limit has none either.

  When the account runs out before the reset at that pace, the sheet says so under the headline: "At this pace, used up ~20 min before it resets." It says nothing in these cases:
  - in the first 5 % of a window;
  - for a window already full;
  - when the difference is under 5 minutes.

  The meter's spoken value adds "86% of the window passed".
- **#50's P2, closed.** A spend limit passed (120 %) keeps its meter's ARIA range true: the maximum holds the value, and the fill stops at the end of the track.

## Evidence

- `src/features/resources/pace.test.ts`: the time passed, the projection (92 % with 260 of 300 minutes passed runs out about 17 minutes early), and no pace for an unknown length, a balance, a window that may not apply, a reset due or no reset. The three orders. With `resource.test.ts`, 21 pass.
- `test:browser --repeat-each=2`: 88 of 88. That is 44 checks, 26 of them for resources, four of them new:
  - the pace mark and the projection on `busy=1`;
  - the spend limit's range on `spent=1`;
  - the attention order, the warm edge and the offline tile;
  - sorting by owner and tool, with the glide.
- **Fourteen new mutations** each made their check fail, every run on a fresh fixture server:
  - the pace read at the page time;
  - a projection while on pace;
  - a pace for an unknown length;
  - Codex's five-hour window assumed;
  - no projection;
  - no mark on the tile;
  - a range of 100 for 120 %;
  - what waits not first;
  - the least used first;
  - offline not dimmed;
  - no warm edge;
  - offline without its age;
  - sorting by owner ignored;
  - sorting without a glide.

  The first run of "what waits not first" survived: in the base fixture the waiting tile was also the most used. The check now runs on `busy=1`, where Codex is more used and the waiting Claude Code must still come first. The 35 mutations of attempts 5 and 6 still fail their checks.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 584 pass, plus the 5 known Windows failures, as on main.

## Codex's review of `dcf5f3e`

- **P2, fixed: the pace assumed Codex's `five_hour` lasted five hours.** The continuation asks to keep each Codex window's reported duration. `pace()` now takes the reading and knows lengths only per source: Claude Code's status line. The fixture's `busy=1` brings Davide's Claude Code to 95 % with 80 % of its window passed, to show the mark and the projection ("~47 min before it resets"). A new mutation that gives Codex a five-hour length again fails its check.
- With Claude Code at 95 %, the waiting tile was again the most used on `busy=1`. The attention check moved to `spent=1`, where Codex at 120 % outranks it.

## Decisions and changes

- **The pace mark is drawn from the reading's time, not the page's.** The value was true when it was read, so it is compared with how much of the window had passed then.
- **A projection is said only when it matters:** the account runs out at least 5 minutes before the reset. The mark itself is always there for a window with a known length.
- **The sort is a native select.** It is accessible as it is, and it takes the field's look.

## Remaining obligations

- **Luis:** evaluate this UI before it merges.
- **Davide:** the resource and action shapes (SCM-01/02). A window duration in the observation (Codex reports one) would give every window a pace.

## Next bounded action

- Luis's notes. LFE-02.2 when PR32 is in `main`.
