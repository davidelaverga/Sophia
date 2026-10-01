# Implementation-session handoff: the Studio audit (#23), attempt 1

- **Goal and attempt:** a detail pass over the real Studio and room, since Davide asked that the details look perfect. The pass covered a first screen that says what it is, a pulse that says what was sent, fewer dead ends on phones, measured alignment, less text in the room, and a round on security and on screens that can't be left. Asked by Luis on 2026-09-30. Not a pack goal. This file was written after the merge: #23 went in without one, and AGENTS.md asks for one per attempt.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `studio/audit` from main at `503e38d` (#18 merged); first commit `9c59144`, 2026-09-30. It merged main twice: `68a836d` (#19, #20, #22 through #25) and `dfcaf97` (#28 and #29).
- **End:** merged to main on Luis's go as `ba983e7`, 2026-09-30 at 19:48 Atlantic time: 54 files, +2055 −415. This follow-up (`studio/after-23`) adds this file and fixes Codex's last review, which arrived two minutes after the merge.
- **Writable scope:** this repository. **No hosted service was changed by this attempt.** On 2026-09-30 at 20:25 Atlantic time, production still served the build from before #23.

## Outcome

What #23 changed in the Studio:
- **First screen and Work:**
  - the first screen says what it is;
  - the work pulse says what was sent, and folds repeats into one row with a count.
- **Invite sheet:**
  - a calendar that fits a phone, says what it scheduled and moves to the next slot;
  - the link on one line, and closed invitations folded;
  - "Sent" only when the email went;
  - the title and tabs stay while the sheet scrolls.
- **The room says less:**
  - words that repeat a control are gone (102 words to 54 in the room);
  - the stage clears the dock at any height (`--dock-h`).
- **Alignment is measured:**
  - the lens labels are centred, the home fits a laptop, and the pulse's head sits on the view head's rule;
  - CONTRIBUTING gained "Studio UI" and "Alignment is measured".
- **Every screen can be left, and the room's controls outlive trouble:**
  - a failed refresh keeps the room, and a closed door ends the call;
  - the guest lobby's wait and its refusal can be left;
  - a camera or a shared screen that is on stays in sight, with its off switch;
  - no wait is endless: reads end at 30 s, writes at 90 s, and "Taking longer than usual…" shows after 6 s;
  - Home says that it leaves the room in a call.
- **Sign-in links:**
  - a link never switches accounts, and never puts its own words on the page;
  - with nobody signed in, a link's session asks "Sign in as this account?" first.
- **Review fixes:**
  - `702ed9c`: invite tabs keep their state; keyless writes are never retried; on `/join`, a sign-in link is offered first;
  - `c0e0a36`: an admission whose outcome is unknown can't make a second invitation or session, and a sign-in link check has an end.

Fixed in this follow-up (Codex's review of `c0e0a36`):
- **The link offer's Continue could wait for good on "Signing in…".** The wait now has an end, and the offer comes back with Continue and "That's not me". A sign-in that lands after "That's not me" is signed out on this device and never shows (`link-accept.ts`).
- **After scheduling, an overlap of the next slot hid the receipt.** The note now says both (`scheduleLines`).

Missing or unverified:
- Nothing is deployed.

## Evidence

- **CI:** green on every pushed head of `studio/audit` (38 runs).
- **Gates for this follow-up:**
  - format, lint and typecheck;
  - Studio tests (156);
  - unit tests: 383 pass, plus the 5 known failures on Windows (launch environment and bundle digest tests);
  - the build.
- **Browser checks** (dev stack and local Supabase, synthetic identities):
  - the invite sheet (20), its scroll (7), the calendar's and invitations' quality of life (16), and the batch checks (9 and 12);
  - words in the room (102 to 54);
  - the security round's walks: account switching by a link, reproduced against local Supabase and then fixed;
  - this follow-up: the calendar's receipt beside an overlap, and a held sign-in that gives the offer back; a sign-in landing after "That's not me" never shows and is signed out.
- **Reviews:**
  - Codex in three rounds: `dfcaf97`, `702ed9c` and `c0e0a36`;
  - Davide's CX-0016 raised the first round's three findings, and his CX-0017 on #24 found those fixes in place.
- **Mutation checks:** every fix has a test that fails without it. The follow-up's fixes also fail their browser checks when undone.

## Decisions and changes

- **Luis's calls on 2026-09-30:**
  - the hosting headers went in their own PR (#28);
  - capture moved behind the command key (in #24);
  - with nobody signed in, a link's session asks first (`1aa89a9`).
- **The merge:** on Luis's go, as a merge commit, after the fixes for Codex's second review. The third review came two minutes later and is fixed here.

## Remaining obligations

- Deploying is Davide's; production still served the build from before #23.
- API-side findings from the security round wait for Davide; they are not described here.

## Next bounded action

- Davide reviews and merges this follow-up.
