# INC01-DES-001 — truthful resource controls: states, transitions and evidence plan

**Design change:** INC01-DES-001, revision 2 · **Mission:** SOPHIA-INC-2026-11, INC-01 (resource UX slice of INC01-S6) ·
**Owner of the decision:** Davide · **Author:** the dedicated Claude Code designer session.

**Sequence, recorded as it happened.** The assignment asked for this states plan before code. It was not written first.
The order was: setup and the pinned Impeccable context, reading the incumbent source and the issued pack, the *before*
captures (`?viewer=…` states below, taken on unchanged source), then code (`status-words.ts`, the sheet, the tile, CSS,
tests), and a first browser run. This document was written after that, at the coordinator's process correction. It
records the states the candidate covers and how each is checked; it does not claim to have preceded the code.

## Surface brief

- **User task.** An owner or a teammate opens a resource (tile → `ResourceSheet`) to judge whether its tool can take
  work and what its controls will do. What got in the way: the Stop tip promised "Ends its work at once, whatever else
  is waiting" (a request is not instant settlement, C02-R07); "Online" on the tile and "Host online" in the sheet read
  as a ready tool (C01-R05: host health is not readiness); the controls' support was a glyph (`✓ – ×`) explained only
  in a hover tip that can't be reached by keyboard and was clipped by the sheet's edge; "Requests ✓ supported" read as
  "answered from here", though no Studio path answers a native permission request.
- **Bounded change.** Words and grouping in the existing sheet and tile only. No new prop, no readiness/auth/grant field,
  no Connect or Manage-use action, no new control or transport semantics. `onAct`, receipts and the confirm flow are
  unchanged and are what the new words describe.
- **Preserved.** Studio primitives, type and palette, navigation, search/filters/roving focus, task links, owner-only
  Act, effort behaviour, J/K page turns, Esc/Close focus return, the receipt steps and their words (`receipts.ts`).

## States and what each says

| Area | State (props) | Said |
|---|---|---|
| Host | `online` + time | Tile: `Host online`. Sheet: `Host online · observed 2 min ago` |
| Host | `offline` + time | Tile: `Host offline · 1 day`. Sheet: `Host offline · observed 1 day ago` |
| Host | `unknown` + time / null | Tile: `Host unknown` (its room). Sheet: `Host state unknown · observed 3 h ago` / `… · never observed` |
| Readiness | not in props (every resource today) | Under the host: `Sign-in and readiness not reported` |
| Controls | per control `supported / unqualified / unsupported` | Grouped in words: `Qualified`, `Not qualified yet`, `Not offered`; empty groups omitted |
| Note | owner, a qualified sendable control, a port | `Each is a request until its runtime confirms it. Sent from a session’s Act.` |
| Note | owner, qualified, no port (`acts.canSend` false or no acts) | `Each is a request … None can be sent from here now.` |
| Note | owner, nothing sendable qualified | `None can be sent from here yet.` (no Act anywhere) |
| Note | teammate, something qualified | `Each is a request … Only <owner> can send them.` (no Act) |
| Note | teammate, nothing qualified | no line |
| Note | `permissions` qualified | adds `Permission requests are answered in <tool>.` |

## Transitions already in the incumbent (described, not changed)

Act → Stop asks first (`STOP_WARNING`) → `Sending…` → `Stop requested; waiting for the runtime to confirm.` (Recorded,
Delivered) → only a receipt with a settled effect and evidence says `Stopped. Completed work is kept.` An effect the
runtime can't confirm: `Stop requested. The runtime’s state is not confirmed yet.` A lost reply: `Not confirmed whether
it was recorded.` with Try again reusing the same operation. Refused: `… Nothing was sent.` Hold mirrors Stop.

## Revision 2: the settled Hold (review DES-R1-F01)

| Hold state | Said (Resources and Tasks, one function) |
|---|---|
| sent, no receipt | `Sending…` |
| recorded / delivered, effect pending | `Hold requested; waiting for the runtime to confirm.` |
| effect or delivery unknown | `Hold requested. The runtime’s state is not confirmed yet.` |
| reply lost | `Not confirmed whether it was recorded.` + Try again, same operation |
| `held`, with evidence | `Held. Its runtime confirmed the hold.` (was `Held. Work and remaining allowance are retained.`) |
| `held`, no evidence | not a receipt: refused, settles nothing |

## Revision 3: held work and its next action (Davide's iteration pack, written before r3 code)

Requested by Davide (`Sophia_INC01_DES_001_Iteration_Pack_v1_2026-11-09`, ZIP SHA-256 `363564bf…`, pack text files
verified against its manifest; the four reference images arrived re-encoded, so they serve as visual references only).
r2 is `changes_requested`. This section was written after reading the pack and the source, before any r3 code.

**Baseline confirmed in source.** Resources offers controls from route support alone (`routeOffers`): a session whose
Hold the runtime confirmed is still offered Hold, and its row's tag still says the projection's `Working`, the held
state visible only inside an opened Act panel. Tasks offers Hold only while the server's view says the task isn't held,
and Resume only while it is (`actions.ts`). Both send through `SessionActs`, into one command store per project and
viewer (`commandSpace`).

**One state source.** The work's control state is read from that store, for the exact execution shown (`sameTarget`):
the latest Hold, Stop or Resume sent for it, folded from its receipts. No local Held or Running flag, no replay: an
uncertain request keeps its operation, and its Try again stays the existing same-operation path. A new assignment or
generation is another target and starts with none of it. A teammate's space holds none of the owner's commands, so a
teammate sees the projection only.

| Latest control for this execution | Status (tag) | Sentence | Next action | Controls still offered |
|---|---|---|---|---|
| none, or refused | projection's own (`Working`, `Waiting`…) | — | Act (as before) | as offered |
| Hold sent or recorded, effect pending | Hold requested | Waiting for the runtime to confirm. | Open work | no Hold, no Guidance |
| Hold lost or unconfirmed | Hold not confirmed | The existing request is still followed. | Open work | no Hold (Try again: same operation), no Guidance |
| Hold settled, with evidence | Held (neutral) | Its runtime confirmed the hold. | Open work | Stop only; Resume where the view allows it (Tasks) |
| Resume sent, pending / unconfirmed | Resume requested / Resume not confirmed | as for Hold | Open work | no Resume, no Hold |
| Resume settled | projection's own | — | Act | as offered |
| Stop sent, pending / unconfirmed | Stop requested / Stop not confirmed | as for Hold | Open work | no guidance; Stop pressable again only as the same operation; Hold as before |
| Stop settled | Stopped (neutral) | Its runtime confirmed the stop. | Open work | none: a stopped generation isn't resumable |

*Amended during implementation, twice.* The first cut offered nothing once a Stop was sent; five reviewed checks
(Codex F-007, F-016, F-021, F-022, the Resources act check) keep a Stop on its way pressable, the same operation again,
its focus kept, so a Stop on its way kept the incumbent offers. Then the coordinator ruled on C01-R16 (current authority
over a legacy test): a Stop recorded, requested or unconfirmed fences new guidance to that exact assignment and
generation; stopped work receives none; Hold requested or held takes no guidance either; the safety Stop stays
pressable only as the same operation. Try again goes by what is still offered plus the control in play itself, so a lost
guidance is never sent again past a Hold or Stop. Where guidance is withheld, one line says why, and a draft in its field
is "kept on this page; nothing more is sent from it" (it may hold the words of a guidance already sent whose reply was
lost, so it never says "not sent"). Only that execution: other sessions and assignments keep their own offers.

`Open work` goes to the same work through the existing Tasks seam (`TaskLinks.open`, `#task-<work id>`): read-only, it
sends nothing. The address names the work, not its assignment or generation (the router that reads it is outside this
scope), so the task's sheet shows the assignment Tasks observes; the gap is disclosed. Where the work is on no board,
there is no Open work, only the status. View control receipt: no receipt view exists, so none is offered. Resume in
Resources: `not_applicable` (no qualified Hold/Resume route exists; Tasks' Resume in the fixture is the simulated
view's allowance, not qualification).

**Readiness.** The host line stays (`Host online · observed …`; the data names a host, not a computer). Under it, one
line and a disclosure, `Readiness details`, listing what is known and what isn't: Host (state, observed when), the
tool's sign-in (not reported), operations for this connection (not reported). No sign-in, profile, funding route or
capacity policy is in the props, so none is invented; the fixture adds none. Control support uses the pack's words:
`Verified for this connection`, `Not verified for this connection yet`, `Not supported by this connection`.

**Crossings checked.** Two sessions on one account (each row its own target and state); a reassignment at the next
generation (old controls gone from the row); owner and teammate; a lost reply, then reload (the page store starts from
the service again: nothing replayed); long titles at 390 px; keyboard: Open work and the disclosure reachable by Tab,
Escape still closes the sheet and returns to its tile. Tasks: Hold not offered again while a Hold for that execution is
pending or unconfirmed (the button, and the sheet's H key).

## Revision 3, repair 1: one fence derivation, focus, readiness (review INC01-DES-001-r3-SOURCE-PRE-PUSH-001)

Written before the repair's code. The review (SHA-256 `56a4434f…`) found four classes in `848f1105`; all four come from
one cause: `controlOf` read only the latest control for the exact target, and nothing else.

**One derivation, `workState(known, target, observed)`** (`work-control.ts`), used by Resources' row, `SessionActs`
(both views) and Tasks' `sheetKeys`:

- *Applicability* (F03): a command fences a target when project, work, assignment and generation are equal, and the
  attempt and session are equal or either is unnamed. A missing attempt is ambiguity, not proof of a different
  execution. Retry stays exact (`sameTarget`): an old operation is never rebound or sent again for a named attempt.
- *All applicable controls* (F02), refused ones aside, not only the latest: any Stop not yet settled fences new
  guidance whatever came after it (a Resume is not a Stop's settlement); a settled Stop fences everything; the latest
  of Hold and Resume decides the hold fence (Hold in play or held: no Hold, no guidance; Resume under way: no Resume,
  Hold or guidance).
- *Observed lifecycle* (F01): the view's own `held` or `stopped` (Tasks' `lifecycle`; Resources' new optional
  `assignment.runtimeControl`) fences as a settled Hold or Stop would, with an empty store, after reload or navigation,
  whatever a stale allowed-action list says. An empty store is not evidence the work runs.
- *What may be tried again*: what is still offered, and the unresolved controls in play (their own operations only);
  never a guidance past a fence, nothing once stopped.
- *What is said*: a settled Stop, else an unresolved Stop, else the latest Hold or Resume, else the observed state
  ("Held" / "Stopped", "as its runtime reports"); receipt words stay for receipt-proven states.

**Focus (F04).** When the control that had the focus leaves `SessionActs` because its offers changed (Hold pressed by
keys, a settled Stop), the focus moves to its status line in the same sheet (focusable, `tabIndex=-1`), never to the
page; nothing moves when the focus was elsewhere.

**Readiness (P1, bounded presentation).** An optional view-data projection on `Resource`, `readiness` (the tool's
sign-in, each operation's qualification for this connection, when observed, until when it holds, and its source), the
Studio's proposal; no service supplies it yet, and production props leave it absent. A pure `readinessSummary`
derives one line: host offline or unknown first; then a missing, past-its-time or unknown projection
(`Readiness not reported` / `Readiness last observed … ago`); then sign-in (`Sign-in needed`, `Sign-in not reported`);
then a capacity window used up; only with every fact current, `Ready for <operation>`, other operations said as not
verified. Readiness details list each fact apart with its provenance. Next actions only where a working callback
exists (Open work, the existing task link); no Continue sign-in or Reconnect button. The fixture shows the states only
behind `readiness=1`, labelled simulated.

**Reload and navigation (R3-01, R3-03, bounded).** A fixture `seed=held|pending|unknown` fills the page's store, as a
service's retained operation record would, before the page shows it: the UI is rebuilt from it after a reload or a
navigation with no command sent. It proves presentation only: the service's own recovery, binding and revocation stay
not run.

## Revision 3, repair 2: three bounded view and fixture classes (review INC01-DES-001-r3-repair1-SOURCE-PRE-PUSH-001)

Written before the repair's code. The review (SHA-256 `a601a6b1…`) closed F01–F04 and found three P2 classes in
`9c1ee251`; none reopens the fence derivation.

- **F05, the fixture's bridge to Tasks.** Open work from Resources' fixture decided `held=` from a rendered sentence and
  the page's store only, so a work seeded held as observed (`runtimeControl`, empty store) arrived in Tasks as Working
  with Hold offered. The bridge now reads the structural state: `workState` gains `held` and `stopped` booleans, the
  session's observed state and every applicable retained control (`covers`); held, by its view or a settled Hold,
  carries `held=`; every retained control is carried as itself (`retained=`: its command, original target and receipt
  observation, unchanged), so Tasks' page rebuilds the same operation, pending or unknown, never confirmed or rebound
  to its named attempt. Fixture-only: real service recovery and the exact assignment/generation route stay not run.
- **F06, operation states in the summary.** `operationsSummary` said every non-qualified operation was "not verified
  yet". The summary now keeps the four states apart, as the details do: verified (ready for), not verified yet, not
  supported by this connection, not reported; with none verified, the line names the group that holds them, and a
  mixed set lists each group in the trailer.
- **F07, observation time.** `current` checked only `validUntil`. A projection is current only when its `observedAt` is
  a finite instant not after now and its `validUntil`, when given, is a finite instant after `observedAt` and after
  now; otherwise it is not current, said why (time not valid, observed after now, limit before its observation, or
  last observed), every row not observed, never "NaN" or "just now". `validUntil: null` keeps its meaning for a valid
  observation. No age limit or clock tolerance is invented.

## Evidence plan

- Unit (`status-words.test.ts`): host words, grouping/order, every note branch including the teammate and no-port cases.
- Browser (`e2e/resource-control-status.spec.ts`, fixture page, simulated data): owner vs teammate note and Act
  presence; unknown/offline/online host with the readiness line; Stop by keys alone stays "requested" without a
  settlement and returns focus to its tile; `settle=unknown` vs `settle=confirmed`; `admission=lost` Hold with Try
  again on the same operation; `@phone` fit of host, readiness, controls and the tile's one-line host label.
- Existing `e2e/resources.spec.ts` assertions updated where they pinned the old wording.
- Captures before/after, desktop 1280×800 and narrow 390×844, same states and routes, labelled simulated: 13 pairs
  (26 PNGs) in r1, and in r2 the settled Hold in Resources and Tasks (4 pairs).
- r2: unit tests on the receipt's evidence and every unsettled Hold path; four `work.spec.ts` assertions; a settled
  Hold through ResourceSheet; each new guard mutation-checked against the old promise.
- Loading, empty and no-results, stale, unknown and past-reset usage are unchanged code paths; they are captured and
  checked by the existing suite, not re-specified here.

## Limits

The fixture is simulated; no host, sign-in, route qualification or account is read. The production shell does not yet
bind live resources (ProjectShell `resources` is fixture-only). This slice qualifies nothing and closes no INC-01 gate.
