# Implementation-session handoff: LFE-06, attempt 8 (identity and quality of life in the Resources view)

- **Goal and attempt:** Luis asked for the whole list of next improvements. This is the first of three small PRs: who and which tool at a glance, and the view working the way it was left.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/identity-qol`, stacked on `lfe-06/scan-pace` (#51) at `8a34a09`, 2026-10-02.
- **End:** content commit `1e30716`; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/features/resources/`: the new `OwnerAvatar`, `CopyLink`, `prefs.ts`, `link.ts` and their tests, plus the panel, tile, sheet, motion and stylesheet;
  - `src/app/Avatar.tsx`: it now takes only the fields it shows (name, display name, picture), so an owner can use it; its only other caller passes a whole identity, as before;
  - the resource fixture and its checks;
  - CONTRIBUTING and LFE-06's records.

  **No contract, schema, API or dependency changed.** The resource's owner gains an optional `avatarUrl` in the Studio's proposed shape (SCM-01).

## Outcome (UI)

- **Each owner as the Studio shows a person.** Owners appear on the tile and in the sheet through the app's own `Avatar`: their account's picture, or their initial when there is none or it fails to load. The fixture gives Davide a drawn picture; Luis has none.
- **Every tool has its own colour.** Codex is blue (its mark's colour). The one-colour marks (Grok, Copilot, Cursor) take a cool silver. None borrows the app's lavender any more. The colour tints the mark's tile and the light that follows the pointer.
- **The view opens as it was left.** The filter and the order are kept per viewer, in this browser only (`sophia.resources.v1.<viewer>`). Anything unreadable or unknown opens as All, by attention.
- **A resource's sheet has its own address.** Opening it puts `#resource-<id>` in the address and closing takes it away, without a history entry. An address naming a resource opens its sheet. "Copy link" in the sheet's head copies it, and says "Link copied" for a moment. The project's path stays the router's.
- **Arrow keys across the tiles.** Only one tile is in the Tab order (the last one focused), so Tab leaves the grid in one step.
  - The arrows move by one, or by a row at the grid's current width.
  - Home and End go to the ends.
- **Found on the way:** a glide cut short by the next one rejected its `ready` promise unheard. Two filters chosen in quick succession left "Transition was skipped" as an unhandled rejection. It is now caught (`motion.ts`, from #50).

## Evidence

- **Unit tests:** `prefs.test.ts` (per viewer, the fallbacks, refused storage, the address). With the others, 24 pass.
- **Browser checks:** `test:browser --repeat-each=2` passes 100 of 100. That is 50 checks, 32 for resources, six of them new:
  - pictures and initials;
  - a colour per tool;
  - the view kept per viewer;
  - the address, its copy and reopening;
  - arrow keys and the single Tab stop;
  - glides cut short leave no unhandled rejection.

  The last check first passed without its fix: Playwright clicks too slowly to cut a glide short. It now clicks every filter in the same task and records `unhandledrejection` in the page. It fails without the fix (three rejections) and passes with it.
- **Twelve new mutations** each made their check fail, every run on a fresh fixture server or the unit tests:
  - no picture;
  - Codex in lavender;
  - the kept filter not read;
  - nothing kept;
  - one memory for every viewer;
  - no address;
  - an address opening nothing;
  - an unknown id taken as one;
  - the wrong link copied;
  - every tile in the Tab order;
  - down moving by one;
  - the rejection unheard.

  The 49 mutations of attempts 5 to 7 still fail their checks.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 587 pass, plus the 5 known Windows failures.

## Remaining obligations

- **Luis:** evaluate this UI before it merges.
- **Davide:** the owner's picture comes with the resource shape (SCM-01).

## Next bounded action

- Attempt 9: the view feels live. Ages and countdowns tick, a tile flashes when it changes, the tab's title counts what waits on you, and skeletons show while it loads.
