# Design change INC01-DES-001 — truthful resource controls (review record)

The proposed UI-R08 record for this candidate. Unknown fields stay unknown. It is a record in this repository, not an
assertion that a ledger table holds it.

| Field | Value |
|---|---|
| design_change_id | INC01-DES-001 |
| mission_id | SOPHIA-INC-2026-11 (INC-01, resource UX part of INC01-S6) |
| revision | 3, repair 10 (repairs 9 and 10 together, child of the published repair 8; repair 9 alone `28d1ec59…` / `1315ea9e…`, gate `0a162b8a…` needs revision on UI9-F13 and UI9-F14; repair 9: child of the published repair 8 `18a7320b…` / `ae8bfddf…`, accepted pre-push `9a66d20f…`, post-push `needs_revision` on UI18-F12; repair 8: child of the published repairs 4 to 7, `de661b30…` / `a71d97d8…`, accepted pre-push `6e50d169…`, post-push `needs_revision` on UI-DE66-F11; repair 7: `b466f693…`, `fbebda5e…` and `58e44a2a…` preserved, unpublished partial repairs, `58e44a2a…`'s whole-26 gate `7c72f635…` needs revision on UI58E-F10; published r3 repair 3 `85c4a886…` / `8aae2238…`, accepted pre-push `04d63f48…`, then `needs_revision` on UI85C4-F09; published r3 repair 2 `1164e75d…` / `fd233c6b…`, PR 506, approved by Davide for publication and integration review, then `needs_revision` on UI1164-F08; r3 repair 2 pre-push source-accepted `8a556808…`; r3 repair 1 `9c1ee251…` NEEDS_REVISION: DES-R3-REPAIR1-F05…F07, its F01–F04 closed; r1 `face2799…` NEEDS_REVISION: DES-R1-F01; r2 `00d8193c…` source-accepted, then `changes_requested` by Davide's iteration pack; r3 `848f1105…` NEEDS_REVISION: DES-R3-F01…F04) |
| author_thread_id | Claude Code designer, `session_01FGXfrKKdKs2Y9XbfrHzs3s` |
| coordinator_thread_id | Codex `01a1bd48-df51-7692-b30c-9e20f6eb4c81` |
| base | `main` at `953e5dc3d4c88e491517f3f0d0eaa18216fea98f`; repairs 9 and 10 are one local child of the published `18a7320bd74b43156a5824638a44e15dbad7573e`, a child of `de661b30ed60ce12e6ccfa81bf48e729116f638d`, itself a child of the published `85c4a88606704ba7a9ce88907d7b218086851cf2` |
| candidate_commit_sha, candidate_tree_sha | In the exported manifest (`MANIFEST.json` beside the bundle); a commit cannot name its own hash |
| affected_surfaces | Resources: tile host label; sheet host, Readiness details, session status and Open work, Control support; Act and Tasks' Act on it (shared `SessionActs`, `work-control.ts`); Tasks' H key |
| design_scope_digest | SHA-256 of `git diff --binary --full-index --no-ext-diff --no-textconv 953e5dc3..HEAD` (whole) and of `18a7320b..HEAD` (the candidate's parent), in the manifest, beside the raw canonical diff files |
| preview_reference | Fixture page `apps/studio/fixtures/resources.html` on the candidate commit (setup below) |
| evidence_references | repair 10: 5 before (`28d1ec59`) and 5 after captures with the focus recorded, the original keyboard failure, r3-repair10 export; repair 9: 5 before (`18a7320b`) and 5 after captures, r3-repair9 export; repair 8: 5 before (`de661b30`) and 5 after captures, r3-repair8 export; repair 7: 7 before (`58e44a2a`) and 7 after captures, r3-repair7 export; repair 6: 5 before (`fbebda5e` source) and 5 after captures, r3-repair6 export; repair 5: 5 before (`b466f693`) and 5 after captures, r3-repair5 export; repair 4: 7 before (`85c4a886`) and 7 after captures, r3-repair4 export; repair 3: 7 before (`1164e75d` summary) and 7 after captures, r3-repair3 export; r1: 13 pairs; r2: 4 settled-Hold pairs; r3: 12 before (r2 source) and 20 final after captures (17 earlier ones superseded pre-fence, kept as history), r3 export; repair 1: 15 before (`848f1105` source) and 15 after, r3-repair1 export |
| significance | significant |
| significance_reason | Product promise: changes what a Stop/Hold control and an online host are said to mean (UI-R06) |
| state | repairs 9 and 10 (one candidate, parent `18a7320b`) awaiting the same reviewer's whole-actual source review; root and that reviewer assess their materiality on the actual diff (an observed stop superseding a Hold or Resume in Act's status; the focus handoff saying the current state; a keyboard test reading one row). Repair 9 alone (`28d1ec59`) is kept unpublished: its gate `0a162b8a…` found F13 and F14. Repair 3 was judged an ordinary correction and published. Davide's approval is recorded for exactly `1164e75d` |
| requested_at | r3 repair 2: presented and approved by Davide for publication and integration review (root's record `INC01-DES-001-r3-repair2-DAVIDE-APPROVAL.json`); repair 3: accepted pre-push and published by root; repair 4: handed back, kept as a partial repair; repair 5: handed back, kept as a partial repair; repair 6: whole-26 gate needs revision (F10), kept as a partial repair; repair 7: accepted pre-push and published by root as `de661b30`; repair 8: accepted pre-push and published by root as `18a7320b`; repair 9: whole-26 gate needs revision (F13, F14), kept; repair 10: source review requested at hand-back (time in its export manifest); r3 repair 1 not presented; r2 presented, `changes_requested`; r3 not presented (source review NEEDS_REVISION) |
| decided_at, decision_actor, decision_reference | r3 repair 2 (`1164e75d`): Davide, root's approval record (time there); repairs 3 to 10: no decision of their own |
| approved_scope, conditions | none |
| final_candidate_sha, equivalence_record | unknown |

## What changes for the person looking

- **Tile:** `Online` becomes `Host online` (`Host offline · 1 day`, `Host unknown`): the host is what is online, not the
  tool.
- **Sheet, host:** `Host online · observed 2 min ago`, and under it `Sign-in and readiness not reported`. An online
  host is never shown as a ready, signed-in tool (C01-R05). Unknown stays `Host state unknown · observed 3 h ago`.
- **Sheet, controls:** the glyph row (`✓ Stop ✓ Hold – Guidance – Requests`, each explained only in a hover tip) becomes
  the route's controls grouped in words, `Qualified` / `Not qualified yet` / `Not offered`, and one line:
  - owner: `Each is a request until its runtime confirms it. Sent from a session’s Act.`
  - owner, nothing qualified: `None can be sent from here yet.`; owner without a port: `… None can be sent from here now.`
  - teammate: `Each is a request until its runtime confirms it. Only Davide can send them.`
  - answering requests qualified: adds `Permission requests are answered in <tool>.`
  - `Requests` is renamed `Permissions`, so a qualified one no longer reads as "requests answered from here".
- **Removed promise:** the Stop tip `Ends its work at once, whatever else is waiting` (and Hold's `Pauses its work at the
  next safe point`). Nothing in the props or the receipts supports an instant or safe-point effect.
- **Settled Hold (r2), in Resources and Tasks alike:** `Held. Work and remaining allowance are retained.` becomes
  `Held. Its runtime confirmed the hold.` A held receipt proves the native session is held, not anything about the
  account's allowance, a charge or the work.
- **Held work (r3), Davide's iteration:** a row whose Hold its runtime confirmed says `Held` (neutral) with Act
  closed, then "Its runtime confirmed the hold." and `Open work`, its one primary action, to the same work in Tasks. No
  second Hold, no guidance. `Hold requested` (amber) while one is on its way; `Hold not confirmed` (amber) for a lost or
  unknown one, its Try again the same operation. Tasks draws no second Hold and names no H for one. A confirmed Stop
  says `Stopped` and offers nothing. Resume in Resources: not offered (no qualified route).
- **Guidance fenced (r3, C01-R16 ruling):** while a Hold, Resume or Stop is in play for that exact work, or once it is
  held or stopped, no guidance is offered, in Resources and Tasks alike; one line says why, and a draft is "kept on this
  page; nothing more is sent from it". A Stop on its way stays pressable only as the same operation. Other work keeps
  its own offers.
- **Readiness (r3):** `Readiness details`, on request: Host (state, observed when), the tool's sign-in and operations
  for this connection, those two `Not reported`. Control support reads `Verified for this connection`, `Not verified for
  this connection yet`, `Not supported by this connection`.
- **One fence for both views (r3 repair 1):** a work's control state now comes from every control sent for it (any Stop
  not yet settled keeps fencing guidance, whatever came after it) and from what its view observes (held or stopped
  fence as such with nothing sent here, after a reload too); a command sent without naming its attempt fences the same
  assignment and generation on a named attempt, and is never sent again for it. When the press that had the focus
  leaves, the focus goes to its status line in the same sheet.
- **Readiness summary (r3 repair 1):** where a readiness projection exists (simulated in the fixture behind
  `readiness=1`; no service supplies one yet), one line says what the connection can do or waits on: host offline or
  unknown, readiness past its time, sign-in needed, a used-up capacity window, and only with every fact current
  "Ready for" what its profile verifies, the rest "not verified for this connection yet". Readiness details list each
  fact with its source. No sign-in or reconnect press: no seam exists for one.
- **Repair 2:** Open work from the fixture carries the work's state as structure (held as observed or confirmed, and
  each retained control as itself, unconfirmed and unrebound); the readiness summary keeps verified, not verified yet,
  not supported and not reported apart; a readiness observation is current only with a valid, non-future time and a
  limit after it, else said not current and why.
- **Repair 3 (UI1164-F08):** credits or tokens at zero now wait like a used-up window, with the existing line
  `Waiting for capacity: <name> window` and its own reset, whatever window is beside them and in either order; every
  window of a current reading is weighed, so a percentage that runs out first at its pace no longer hides a used-up one.
  Credits left, a window applying only in part, unknown, due for its reset or a reading past its time read as before.
- **Repair 4 (UI85C4-F09):** a reset that isn't an instant is said as none is: no `resets in NaN days` in the
  readiness tooltip or sheet, the capacity line or the tile, and no pace estimated from it; a used-up window with such a
  reset still waits.
- **Repair 5 (UI85C4-F09, pace):** no pace is estimated from a reset or a reading time that isn't an instant: a meter
  in the list of other windows, or the headline's, says its value without "NaN% of the window passed" and draws no mark;
  no early warning is made up. A valid pace is unchanged.
- **Repair 6 (UI85C4-F09, history and age):** a reading whose time isn't an instant gives no history point, no span and
  no age: the capacity's line of facts leaves the age out and counts only the readings with a time; a sparkline is drawn
  from those alone (an invalid earlier reading no longer stops the sheet from opening). The host's state is said alone
  when its time isn't one.
- **Repair 7 (UI58E-F10, host age):** a host time that isn't an instant (empty, whitespace or otherwise) says the
  host's state alone in the sheet's heading, Readiness details and the offline tile, with no age, no bare "observed",
  no empty time and no dangling separator; "never observed" only when there is no time at all.
- **Repair 8 (UI-DE66-F11, the settled control a work rests on):** a Stop, Hold or Resume its runtime confirmed, sent
  for the same work without naming the attempt shown (or naming it where the view names none), stays said in Act's
  status line as its own record (`Stop sent without naming its attempt`, then its receipt's words), in Tasks after Open
  work and in Resources alike, even while the task's view still says Working; never tried again, never rebound.
- **Repair 9 (UI18-F12, a newer stop):** once the work is observed stopped (or a Stop is confirmed), a Hold or Resume
  it overtook is no longer said as current in Act's status; a confirmed Stop and a command still under way are said as
  before, and nothing is made up.
- **Repair 10 (UI9-F13, the focus handoff):** when the controls go because the work is observed stopped and no row is
  said, the status line says and is named "Stopped. Its runtime reports it stopped.", so the focus handed to it lands on
  the current state; a focus put elsewhere stays there.
- **Unchanged:** Act, the Stop confirmation, the receipt steps (Requested → Recorded/Delivered → only a settled receipt
  says Stopped/Held), the effort controls, task links, navigation, J/K, Esc focus return.

## Preview

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm --filter @sophia/studio exec vite --config vite.fixtures.config.ts
```

Then open `http://127.0.0.1:5199/resources.html` with `?viewer=davide` (owner) or `?viewer=luis` (teammate); add `more=1`
(offline Grok, Gemini), `reset=bad|bad-7day|ok-7day|bad-observed|bad-history`, `more=1&host=empty|blank|bad|none`, `readiness=1&count=credits0-badreset|tokens0-emptyreset|percent100-badreset|spend-badreset|badreset-percent100|credits-badreset|credits0|tokens0|percent-credits0|credits0-percent|tokens-credits0|credits0-tokens|credits|partial|unknown|due` (repair 3), `stale=1`, `settle=unknown|confirmed`, `admission=lost|refused|slow`, `loading=1`. The page
says `Simulated — no tool, host or account read`. The settled Hold on Tasks: `http://127.0.0.1:5199/work.html` with
`?viewer=davide&settle=confirmed`, open "Review the report pane", press Hold.

## Limits stated plainly

`Refresh pending` is also said for a reset the Studio only saw pass, not one a collector reported: a disclosed,
pre-existing copy follow-up, not part of this change. Simulated fixture data only; no host, sign-in, route
qualification, grant or account is read or changed. The production `ProjectShell` does not bind live resources yet. This candidate qualifies no route and closes no INC-01 gate.
