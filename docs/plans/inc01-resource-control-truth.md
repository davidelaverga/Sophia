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

## Revision 3, repair 3: a used-up count waits like a used-up window (review INC01-DES-001-r3-repair2-SOURCE-FINAL-001)

Written before the repair's code. Davide approved exactly `1164e75d` (tree `fd233c6b`) for publication and integration
review; root published it once as PR 506. The automatic review on that head found, and the same reviewer confirmed,
one P2 class (UI1164-F08); this repair is its child and claims no approval of its own.

- **The class.** `readinessSummary` asked only whether the window `capacity()` picked (the one that runs out first at
  its pace, else the most used percentage) stood at 100 % or more. A count is never that window: a balance of
  `credits_remaining` or `tokens_remaining` at 0 comes back as `balance` with `limiting: null`, so a signed-in,
  verified connection with no credits or tokens left read `Ready for repository analysis`, in the tile and the sheet
  alike (both call `readinessSummary`). The same pick also hides a used-up count behind a percentage with room, and a
  100 % window behind another that runs out first at its pace.
- **The repair, in `status-words.ts` only.** The summary weighs every window of a current reading, in no favoured
  order: used up is a percentage (`percent_used`, `spend_percent_used`) at or past 100, or a count at or below 0, read
  from the window's unit and numeric value, never from its words. Only a window known to apply whose state is observed
  now counts: no reading, one that can't see the account (`unavailable`) or past its `valid_until`, a window unknown
  (or without a value), a reset already due (refresh pending), or one that applies only in part or may not apply is
  never used up, and none of it is made zero or made capacity. Used up, the summary says the existing
  `Waiting for capacity: <name> window`, tone `wait`, with that window's own reset; with several used up, the one that
  holds the connection longest names it (no reset known first, else the latest reset). Host, freshness and sign-in
  still say first; positive, unknown, partial, expired and due windows read exactly as before.
- **Bounded.** No layout, CSS, component, flow, copy or capacity-line change; `resource.ts`, `capacity()`, the tile's
  capacity line, Tasks and every control, Open work, focus and lineage class are untouched. Paths: `status-words.ts`,
  `status-words.test.ts`, `fixtures/resources.tsx` (a `count=` reading for Codex), `e2e/resource-control-status.spec.ts`
  and the three records.
- **Evidence.** Unit and browser (tile and sheet) cases: credits 0 and tokens 0 alone; each beside a 25 % window and a
  positive count, in both orders; 100 % as before; positive, partial, unknown, expired and due siblings unchanged.
  Fail-before on exact `1164e75d` with the new checks, pass after; guard mutations that must fail assertions;
  before/after captures, desktop and narrow.

## Revision 3, repair 4: a reset that isn't an instant is an unknown reset (review INC01-DES-001-r3-repair3-SOURCE-FINAL-001)

Written before the repair's code. Root published `85c4a886` to PR 506 after the same reviewer's whole-diff acceptance;
the automatic review on that head found, and the reviewer confirmed, one P2 class (UI85C4-F09). Davide's approval stays
that of `1164e75d`; this repair is an ordinary correction within it and claims no approval of its own.

- **The class.** `holds` already ordered a reset that isn't an instant (`'not-an-instant'`, `''`) as unknown, but
  `windowView` still formatted it: `Date.parse` gives NaN, so it was never due and read `resets in NaN days`, in the
  readiness line's `more` (the tile's tooltip, the sheet), in the capacity line and the tile's capacity, for every unit.
  The same value reaches `pace()` through `capacity()`, whose early warning then read `used up ~NaN days before it
  resets` (probe on `85c4a886`).
- **The repair, at one boundary in `resource.ts`.** `resetAt(w)`: a window's reset as an instant, or null when it has
  none or it isn't one. `windowView` formats only that instant (due, or in how long) and says nothing for null, as for a
  window with no reset reported; `capacity()` asks no pace of a window without one; `holds` reads the same instant.
  Found while checking, after this plan was first written: `pace()` itself (`pace.ts`, not leased) gives `passed: NaN`
  for such a window, and `CapacityBlock` passes it to the meter of a non-headline window directly; see the handoff's
  repair 4 bounds.
  The raw `resets_at` is kept as reported (`saysNow`, `history.ts` compare it as given), never rewritten.
- **Preserved.** A used-up window with an unknown reset still waits (its state stays observed; never Ready by guess,
  never refresh pending by guess); null, valid and due resets read as before; the longest-holding order (no reset
  known first) and the current, applicable, observed checks; host, freshness and sign-in first. No CSS, component,
  layout, flow, Tasks or control change.
- **Evidence.** Unit cases through the real helpers (`readinessSummary`, `capacity`, `windowView`): malformed and empty
  resets on percent, spend percent, credits and tokens; null, valid and due controls; two used up with one unknown;
  precedence. Browser: tile line, tooltip and capacity, and sheet, at desktop and phone widths, no `NaN` or
  `Invalid Date`. Fail-before on exact `85c4a886`, pass after, guard mutations, before/after captures.

## Revision 3, repair 5: pace refuses a time that isn't one (root's lease extension, the rest of UI85C4-F09)

Written before the repair's code. Repair 4 (`b466f693`) stays unpublished, a preserved partial repair. Root confirmed the
gap it reported and leased `pace.ts` and its `pace.test.ts` to this designer; `CapacityBlock.tsx` and `Meter.tsx` stay
untouched.

- **The class, in `pace()`.** It parsed the reset and the reading's `observed_at` without asking whether either was an
  instant. On `b466f693` (probe): a reset that isn't one gives `passed: NaN` and `~NaN days`, which `CapacityBlock`'s
  list of other windows hands to `Meter` (`aria-valuetext` "… · NaN% of the window passed", its mark `left: NaN%`);
  an `observed_at` that isn't one does the same through `capacity()` too, since repair 4 guarded only the reset there.
- **The repair.** `pace()` returns null, its existing "no pace" answer, unless the reset, the reading's time, now and
  the value are each a finite number; every valid pace is computed as before. `capacity()` then calls `pace()` as it
  did on `85c4a886`: repair 4's own guard there (`paceOf`) is removed, one boundary for pacing, `resetAt` for the
  words. Nothing is invented: no date, no elapsed fraction, no availability; the raw reading is kept.
- **Reported, not edited.** A reading time that isn't an instant also reaches `ago()` (`resource.ts`): the capacity's
  line of facts says `NaN days ago`; and `windowHistory` (`history.ts`, not leased) makes a point at NaN for the
  sparkline. The first needs words for an observation time that isn't valid (new copy), the second a file outside the
  lease: both are left as a concrete gap for root, with the probe as evidence.
- **Evidence.** `pace.test.ts`: malformed and empty reset and reading time, null reset, valid, due, an unknown source,
  a balance, a window that applies in part. The fixture gains `reset=bad-7day` (Claude Code's 7-day window, below the
  5-hour headline, its reset not an instant, so it sits in the other-windows list) and `reset=bad-observed` (the
  reading's time isn't one). Browser: open that list and read each `Meter`'s `aria-valuetext` and its mark's `left`, at
  desktop and phone widths. Fail-before on exact `b466f693`, pass after, a mutation removing the finite-time refusal.
  Development as a signed child of `b466f693`; the candidate is one signed child of `85c4a886` with the same tree.

## Revision 3, repair 6: a reading time that isn't an instant gives no history point, span or age (UI85C4-F09)

Written before the repair's code. Repair 5 (`fbebda5e`) stays unpublished, a preserved partial repair. Root leased the
existing `history.ts` and `history.test.ts` to this designer; `CapacityBlock`, `Meter`, `Sparkline`, `time-words`,
components and CSS stay untouched.

- **The class (probe on `fbebda5e`).** `windowHistory` made a point at `Date.parse(observed_at)`, NaN for a reading
  whose time isn't an instant, latest or historic; `spanOf` then formatted `6 readings in NaN days` (and `Infinity days`
  from an infinite one); `resource.ago` formatted any non-empty string, `NaN days ago` in the capacity's line of facts,
  and took an empty string for `never observed`, false for a reading that exists. The host row in `readinessRows`
  (`status-words.ts`) gets the same `NaN days ago` from a host time that isn't an instant.
- **The repair.** `windowHistory` makes no point from a reading whose time isn't a finite instant (the reading itself
  is kept as given; no time, zero point or count is put in its place). `spanOf` says nothing unless its first and last
  points are finite and in order. `ago` keeps `never observed` for null and its words for a valid time, and gives
  nothing (`''`) for a string that isn't an instant: the line of facts already drops an empty fragment
  (`CapacityBlock.Meta`), so no age is said. The host row, which would then read `· observed ` with nothing after it,
  says the host's state alone, as the line of facts omits its fragment.
- **Direct consumers checked.** `Sparkline` draws from the finite points only (its `since`, x, y and caption follow);
  `observedSaid` already says an invalid readiness time as not valid before it asks `ago`; `windowView` and the
  expired-reading line call `ago` only with an instant. Reported, not edited: `ResourceSheet.Since` (not leased) would
  show `observed` followed by an empty age for a host time that isn't an instant; `expiry` (`resource.ts`), used by
  Tasks' decisions too, would say `expired` with no age for a deadline that isn't one; both lose their NaN, neither is
  changed here.
- **Evidence.** `history.test.ts`: malformed latest and historic readings, an infinite span, valid controls.
  `status-words.test.ts`: `ago` and the host row. The fixture's `reset=bad-observed` (malformed live reading) and a new
  `reset=bad-history` (one earlier reading's time malformed): the line of facts, the sparklines' `aria-label`,
  `points`, caption and marker style, at desktop and phone widths, no `NaN`, `Infinity` or `Invalid Date`, the valid
  readings and the 57 % pace kept. Fail-before on exact `fbebda5e`, pass after, a mutation removing the finite-time
  guard. Development as a signed child of `fbebda5e`; the candidate is one signed child of `85c4a886`, same tree.

## Revision 3, repair 7: a host time that isn't an instant is an unknown age, never "never observed" (UI58E-F10)

Written before the repair's code. Repair 6 (`58e44a2a`) stays unpublished, a preserved partial repair. The same
reviewer's whole-26 pre-push gate (`7c72f635…`) found one P2 class: host age. Root leased `ResourceSheet.tsx` for `Since`
and its host age and separator; on this designer's report, it also leased `ResourceTile.tsx`'s offline host label
(`hostLabel`) only.

- **The class (probe on `58e44a2a`).** Each host-age reader guarded by truthiness, not by absence: an empty host time
  read as absence (`Never observed` in the details row, with `observed: true`; `never observed` in the sheet's
  heading), and a whitespace or malformed one as a time (the heading's bare `observed `; the offline tile's
  `Host offline · NaN days`).
- **The repair, one boundary in `status-words.ts`.** `hostAge(at, now)`: null when the host has no observation time
  (`never observed`, as before), `''` when it has one that isn't an instant, else the existing words (`2 min ago`).
  `offlineFor(host, now)`: an offline host's time gone in a word (`1 day`), or null when there is none to say. The
  details row says `Never observed` only for null, the state alone for a time that isn't one, and keeps
  `observed: host.observedAt !== null` (a host state was reported). `ResourceSheet.Since` renders its own separator:
  `· observed <time>` with its `dateTime` and title for a valid time, `· never observed` for null, nothing at all for
  a time that isn't an instant: no bare `observed`, no empty `<time>`, no dangling `·`. `ResourceTile.hostLabel` says
  `Host offline · 1 day` only from a valid time, its bare label otherwise. Raw `observedAt` is kept as reported.
- **Not changed.** CSS, layout, copy, other components; Tasks and `expiry` (disclosed, not leased).
- **Evidence.** Unit: `hostAge`, `offlineFor` and the details row for null, empty, whitespace, malformed and valid
  times, online, offline and unknown hosts. Browser, desktop and phone: a fixture `host=<case>` that sets the Codex
  host's time (and, for `offline`, Grok's), read through the real tile label, sheet heading (text, `<time>`, title,
  separators) and Readiness details; focus returns to the tile on Escape. Fail-before on exact `58e44a2a`, pass after,
  mutations on each guard. Development as a signed child of `58e44a2a`; the candidate one signed child of `85c4a886`.

## Revision 3, repair 8: the settled control a work's state rests on stays said (UI-DE66-F11)

Written before the repair's code. Root published repair 7 as `de661b30`; the same reviewer's post-push gate
(`cc68625c…`) kept every earlier closure and confirmed one P2 class from the automatic review. Lease: `SessionActs.tsx`
(status and receipt presentation), a pure selector in `work-control.ts` with its existing tests, the two e2e specs and
the three records.

- **The class.** `workState` fences a work by every control that `covers` it (same project, work, assignment and
  generation; attempt and session the same or unnamed), but `SessionActs` said only the latest command for the exact
  execution (`sameTarget`) and the earlier ones still open. A settled control sent without naming the attempt (Resources)
  covers the named attempt Tasks shows, yet is neither: on `de661b30`, Stop confirmed in Resources, then Open work, and
  Tasks' Act is empty while its task still says Working; the same for a confirmed Hold when the task's view lags. (With
  the view reporting it held, the task already says Held; that path is kept as the control.)
- **The repair.** `inForce(known, target)` in `work-control.ts`: the settled control the work's state rests on, the last
  Stop its runtime confirmed, else the last Hold or Resume it confirmed, among the controls that cover the execution
  shown (refused ones never). `SessionActs` says it in its status line when it isn't already the latest there, as its
  own record: its kind and, when it isn't the shown execution's, which (`sent without naming its attempt`, as earlier
  lines say), then its receipt's words. Its operation and original target are kept; it is never tried again (retry stays
  exact, `retryableNow` unchanged), never rebound, and never said as the named attempt's own settlement. A Hold or Stop
  still under way stays where it is said now (latest or earlier, still open).
- **Not changed.** `sameTarget`, `retryableNow`, receipts, `covers`, the fences, TaskActions, fixtures, CSS, navigation.
- **Evidence.** Unit: `inForce` for settled, pending, unknown and refused controls; a later Resume, a later Stop; a
  foreign generation or session; an unnamed attempt on either side; retry denied. Browser, desktop and phone, through
  Resources and the real Tasks consumer: Stop confirmed then Open work; a confirmed Hold whose task view lags (the URL's
  `held` removed, nothing else); the view-held control; a later Resume from Tasks; reload; nothing sent on arrival, the
  original target retained. Fail-before on exact `de661b30`, pass after, a mutation removing the selector's use.

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
