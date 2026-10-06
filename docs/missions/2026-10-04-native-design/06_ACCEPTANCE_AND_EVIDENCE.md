# Acceptance, tests and evidence

## Evidence levels

**L0 — source/fixture:** static inspection and deterministic tests. **L1 — real local runtime:** pinned dsh, actual composed tools and controlled Chromium; faux providers only where labelled. **L2 — paid model qualification:** authorized real image-capable route and full accounting. **L3 — real app:** actual deployed tuple, authenticated users and source-bound artifacts. **L4 — owner acceptance:** Davide's explicit decision about the delivered product.

No lower level is described as a higher one. In particular, a mocked render URL or a fake reviewer result does not prove visual inspection, and a source screenshot does not prove deployed UI behavior.

## Existing command baseline

Reconfirm scripts in the checked-out commit before invoking. The inspected project exposes:

```sh
pnpm toolchain:check
pnpm install --frozen-lockfile
pnpm check
pnpm test:sql
pnpm test:db
pnpm --filter @sophia/studio build
pnpm --filter @sophia/studio test:browser
```

`pnpm check` includes formatting, lint, build/type checks, generated contracts, tests, runtime artifact reproduction and integration checks. Run `pnpm artifacts:record` only when intentionally changing runtime/bundle identity, commit its real diff, and then verify `pnpm artifacts`. Do not regenerate identities merely to hide a mismatch. Hosted migrations use Codex's approved operation, not a local test command pointed at production. [SRC-S3, SRC-S8]

For focused browser checks use actual filenames from the current checkout (`e2e/report-page.spec.ts`, `report-reading.spec.ts` in M75). New test paths are reserved by G0. Record skipped tests separately with reasons.

## M75 mandatory checks

| ID | Case | Pass observation |
|---|---|---|
| A-01 | Current complete diff and previous findings | All findings resolved/rechecked on final SHA, or explicitly blocking |
| A-02 | Fixed-profile identity | Existing PDF output bytes unchanged; new page profile byte snapshots intentional |
| A-03 | Content safety | Hostile text/URLs escaped; no active/remote resource introduced |
| A-04 | Navigation/citation closure | Unique IDs, valid citation/backlink targets, no competing tap targets |
| A-05 | Real reader at 390/1280px, light/dark/print | No clipped columns, illegible critical text or broken keyboard navigation |
| A-06 | EN/IT/ES and long/weak-source content | Correct labels/limitations and readable dense sections |
| A-07 | Native-feature boundary | No statement that fixed conversion ran a native designer or independent reviewer |
| A-08 | Handoff and rollout | All converter callers mapped; default coordinated rollout documented |

## SDD-01 mandatory cases

| ID | Case | Required evidence |
|---|---|---|
| B-01 | Required prompt/skill missing | New role refuses readiness/admission, not warning-only success |
| B-02 | Donor inventory | Pin + four entry blobs verified; full selected tree inventory and reference closure; rights/disposition recorded |
| B-03 | Scoped composition | Designer sees only allowed tools/skills; researcher/reviewer cannot gain authoring tools through nesting or inheritance |
| B-04 | Markdown request | Existing source-only/research path remains correct; no unnecessary designer |
| B-05 | New HTML request | Native design attempt is admitted and visible; no browser conversion bypass |
| B-06 | Frozen content | Values, claims, citations and limitations preserved in visible output; deliberate omission/hidden-text mutant fails |
| B-07 | Actual reference perception | Model receives real gallery/reference image bytes; missing image never counted as observed |
| B-08 | Real representative frame | Native authored HTML + actual source hash/captures, not manual developer mock |
| B-09 | Image-capable reviewer | Deliberate clipping/low-contrast/overlap defect is detected on real rendered content; a path-only control does not qualify |
| B-10 | No author-biased independent review | Separate session, input manifest excludes author rationale/self-rating; review output bound to correct hashes |
| B-11 | Stale render/review | Edit after render or review prevents use of the old result for ready/publication |
| B-12 | Bounded repair | Two repair revisions maximum by default; no retry-to-green or budget reset on restart |
| B-13 | Actual static HTML confinement | Script/form/network/CSS escape attempts refused; Studio DOM/origin/credentials not exposed |
| B-14 | Long-report coverage | Whole view plus readable coverage of required sections; missing/truncated coverage explicitly fails readiness |
| B-15 | Active steer | Same attempt receives attributed input at native boundary; final source demonstrates requested change |
| B-16 | Selective revision | Correct base and selected section change; protected content/assets/style relationships checked |
| B-17 | Collateral edit mutant | Attempted global restyle or sibling rewrite is refused or returned for repair; prior candidate preserved |
| B-18 | Stale/concurrent patch | CAS conflict, no last-writer-wins overwrite or double publication |
| B-19 | Disconnect/return | Browser closes; admitted work is independent; return shows true current record, not replayed fake progress |
| B-20 | Hold/Stop during render/review | Dispatch fenced; native/process settlement checked; late result cannot publish |
| B-21 | Source/reference revocation | Affected drafts, images, caches and resumable histories lose eligibility; no stale-context resurrection |
| B-22 | Retry/uncertain effect | Same operation reconciles; no duplicate candidate, model task or paid admission |
| B-23 | Open/download parity | Exact selected saved HTML hash is shown and downloaded; repeated download calls no model |
| B-24 | Viewer freshness | New version never silently replaces one under review; pending card reloads current authorization/state |
| B-25 | Required format not ready | UI/API cannot offer unqualified format; Markdown partial is labelled; no fixed-template fallback |
| B-26 | Billing and limits | Design, review, images and compaction accounted; unknown usage remains uncertain and constrains further work |
| B-27 | Legacy compatibility | Historical MD/PDF readers and IDs survive; newly admitted non-MD work obeys design policy |
| B-28 | Versioned recovery | Exact preset/asset/bundle available after restart, or safe explicit block; no definition drift |
| B-29 | Private/shared context | Runtime review and reference access scoped to authorized work; no EverOS/background capture or broadened sharing |
| B-30 | Final real-app episode | Actual source/runtime/schema/deploy tuple + authorized input→HTML→steer→revision→download evidence |

## Controlled design comparison

Use at least three fixed input packages: (1) dense English comparison with a wide table and citations; (2) Italian or Spanish report with long headings/URLs and limitations; (3) narrative research with uneven section length and a missing/partial evidence case. Add hostile-content and source-preservation mutations as deterministic fixtures, not hidden production input.

Compare #75's fixed editorial control with the native output on the same content. A control is allowed in the test harness, not as a newly offered basic-HTML delivery path. Record each output's real model route and full cost; no Raven result is included until a later explicitly authorized ACP comparison.

Report content fidelity, readability, visual hierarchy, consistency, accessibility/interaction, coverage, human correction effort, wall time and measured cost separately. Do not invent numerical targets from a showcase or turn an average score into permission to overlook a missing citation or clipped table. Codex collects blinded comparison labels when feasible; Davide chooses product acceptance with the evidence visible.

## Real-app episode owned by Codex

Use an explicitly approved pilot environment and synthetic/non-sensitive project. Verify the actual URL and deployment identity, not a guessed host. The expected Sophia domain is not proof of which release it serves.

Run a new HTML task, observe real designing/reviewing states, inspect the representative frame, send an active steer, disconnect the browser, return to the saved state, inspect the exact final HTML, download and hash it, and request a section-only revision. Separately exercise Stop and a stale-card action. A second participant uses actual consent or a preapproved test identity; never impersonate Luis or share personal context to make a test pass.

Capture DOM/behavior observations, screenshots and artifact hashes. Private URLs, content, tokens and signed links stay in the authorized evidence store. Public GitHub gets sanitized summaries and safe refs. A screenshot demonstrates appearance, not a working backend by itself; include server/runtime/artifact identities.

## Evidence record

Each test records case ID, base/candidate SHA, environment, input hash, actual steps/commands, expected result, observed result, outcome (`pass`, `fail`, `blocked`, `not_run`), evidence refs and hashes, model/runtime versions, limitations and cleanup. Include representative negative controls. The absence of a tool, host or credential is `blocked`/`not_run`, never a pass.
