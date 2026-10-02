# Implementation-session handoff: LFE-03, attempt 1 (the direction gallery, on a simulated fixture)

- **Goal and attempt:** [LFE-03](../execution/2026-10-01-unified/frontend/LFE-03.md), session 03.1: DirectionGallery and DirectionDetail over asset and candidate identities, on a labelled fixture.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-03/direction-gallery` from main `f60c387`, 2026-10-02.
- **End:** pending: the commit after the content commit fills it in.
- **Writable scope:** the Studio's new `features/explore/`, its fixture and browser checks, CONTRIBUTING and LFE-03's records. **No contract, schema, API, dependency or hosted service was changed. The Studio's Explore lens is unchanged.**

## Outcome

- **[`DirectionGallery`](../../apps/studio/src/features/explore/DirectionGallery.tsx)** shows every candidate in job order. Each tile carries its picture or its state in words, its route, and a "Chosen" tag. Arrows, Home and End move between tiles, and Enter opens one.
- **[`DirectionDetail`](../../apps/studio/src/features/explore/DirectionDetail.tsx)** shows the picture beside the choice and the provenance:
  - the route, and the model the provider reported, or "Not reported";
  - the brief's revision and the references;
  - the asset id, its SHA-256 and its size.

  "Choose this one" asks for that choice only, with the direction's revision. After the choice the focus goes to Back, and Esc returns to the same tile.
- **An image is drawn only from bytes that match their record** ([`useVerifiedImage`](../../apps/studio/src/features/explore/useVerifiedImage.ts)). A candidate without bytes shows its state in words, never a stand-in picture. An image that doesn't match its record can't be chosen. Nothing is offered while the check runs.
- **Permissions:** editors and admins choose. Anyone else sees "Editors and admins choose." instead of a button.
- **On a phone,** two candidates sit side by side to compare. Back and Choose are in view without scrolling.
- **The shapes are the Studio's proposal** for S1-06's read contract ([`direction.ts`](../../apps/studio/src/features/explore/direction.ts)). The bytes and the choice go through ports, so nothing invents an endpoint. There is no generation port at all.

Missing or unverified:

- **Fixture evidence only.** No API reads jobs or candidates yet, and nothing implements `startImageJob`.
- **The Studio's Explore lens still says it is coming.** The package keeps it that way until the route is real.
- **IMG-03** (edits) and IMG-02's reconciliation before a paid retry need S1-06.

## Evidence

- `pnpm --filter @sophia/studio test:browser`: the 6 Explore checks and the 6 room checks pass. With `--repeat-each=3`, 36 of 36 pass.
- **Twelve mutations of the new code** each made their check fail, every run on a fresh fixture server:
  - choosing asks twice;
  - the choice names the wrong revision;
  - a refused candidate can be chosen;
  - a stand-in picture appears;
  - bytes are shown without the check;
  - an unverified image can be chosen;
  - a viewer can choose;
  - the arrows do nothing;
  - Back doesn't return to the tile;
  - the focus falls after choosing;
  - one column on a phone;
  - the state is shown by color only.
- `node --test` on `direction.test.ts`: 4 pass.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. The Studio's production build has no fixture string. `pnpm test`: the new tests pass, plus the 5 known failures on Windows, as on main.

## Decisions and changes

- **Production is untouched.** The package says to replace the coming lens only when the visible state represents a configured route.
- **The checks found two bugs while being written, both fixed here:**
  - choosing by keyboard dropped the focus to the page, so Esc did nothing;
  - while the image was being checked, the choice said it "doesn't match its record".
- **The fixture images are plain gradients** drawn for the fixture, not provider output. Their SHA-256 values are in the fixture data.

## Remaining obligations

- **Davide:** the read shapes, and where a candidate's bytes and the choice live (S1-06).
- LFE-03.2 to 03.4 once `startImageJob` and a candidate read exist.

## Next bounded action

- LFE-02 when PR32 is in `main` (Luis's fixes, as agreed on #31). LFE-03.2 when S1-06 has a route to bind.
