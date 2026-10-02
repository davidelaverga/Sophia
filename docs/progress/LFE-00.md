# LFE-00 — preserve the merged room and reconcile active frontend work

Package: [frontend/LFE-00](../execution/2026-10-01-unified/frontend/LFE-00.md) of the [v2.0 continuation](../execution/2026-10-01-unified/00_START_HERE.md). Implementation and integration: Luis. Product: Davide. Read on 2026-10-02 around 02:00 UTC. Each row says how it was observed; "reported" means taken from a record and not re-checked here.

## Where the source stands (LFE-00.1)

| Source | State | How it was observed |
|---|---|---|
| main | `9b6d526` (2026-10-02 01:30 UTC, #38's merge) | `git fetch`, `git log origin/main` |
| Merged since the pack's read (`aadd192`) | #35 personal data and API (`c740b8d`), #30 personal Studio (`7e640bc`), #37 its follow-ups (`b8b0f65`), #34 #23's handoff and last review (`b1776f2`), #33 CONTRIBUTING: read a PR to break it (`96f1485`), #38 their follow-ups (`9b6d526`) | `gh pr view` for each |
| PR29 | Merged as `41ac3e7` on 2026-09-30. Its runtime/Studio release record is consumed as reported; nothing here repeats it | `gh pr view 29`; the pack's [baseline](../execution/2026-10-01-unified/02_CURRENT_BASELINE.md) |
| PR24 | Merged as `860a01a` on 2026-10-01 | `gh pr view 24` |
| PR32 (SMC-M03) | Open draft. Its head is `54293806`, updated 2026-10-02 01:35 UTC; the pack read `bb25f058`. Coordination issue #31 is open | `gh pr view 32`, `gh issue view 31` |
| PR21 | Closed on 2026-10-02 as superseded. Its goal document is in main, unchanged | `gh pr close 21` |
| Open PRs | Only #32 | `gh pr list --state open` |

## Deployments (observed read-only)

| Service | State | How it was observed |
|---|---|---|
| Studio (Vercel `sophia-studio`, studio.sophia-ei.com) | Production is deployment `dpl_89dxuk…`, created 2026-10-01 00:56 UTC from Davide's account. Every deployment `vercel ls` lists took 1–2 s and came from a person's account: uploads of a prebuilt Studio. None is a Git-triggered build. The served bundle has the Chat/Brief side panel and none of the personal space's words. That fits Davide's reported release of #24 at `19a41e0` | `vercel inspect`, `vercel ls`, the served bundle |
| API (Render `sophia-next-api`) | Live on `98e7525` (in main) since 2026-09-30 01:26 UTC. `/ready` answers ready | `render deploys list`, `curl /ready` |
| Render services | api, runtime, bridge and worker track `claude/affectionate-cannon-496z9m` (behind main), with auto-deploy off | `render services` |
| Consequence | Nothing merged since 2026-10-01 is in production. Deploying is Davide's release flow. Main's API answers `/ready` with 503 `schema` until migration 0021's functions exist (`REQUIRED_SCHEMA` in `apps/api/src/app.ts`), so 0021 goes first ([PS-01's owner actions](../handoffs/PS-01-attempt-1.md#to-turn-it-on-owner-actions)). 0021 was on no hosted database when PS-01 was handed off. That is reported: reading the hosted ledger needs the owner's database access | the code, and the handoff as cited |

## Migrations and contracts

| Where | Range | How it was observed |
|---|---|---|
| main | 0001–0021; 0021 is A10, the personal space (#35) | `ls db/migrations` |
| PR32 | A11, migrations 0022–0035 at `54293806` (the pack read 0022–0031) | `gh api …/pulls/32/files` |

Reserve a new ID only after refreshing every open branch.

## One writer per shared file (LFE-00.2) — proposed, for Davide to confirm

| Scope | Writer | Until |
|---|---|---|
| `apps/studio/src/app/App.tsx`, `route.ts`, `useProjectRoute.ts`, report deep links, personal call retention | Luis | each merge window, as the pack assigns |
| `features/studio/StudioShell.tsx`, `SidePanel.tsx`, `features/voice/CallSwitches.tsx`, the dock and mini dock, focus and keys | Luis | as above |
| PR32's report and Knowledge components | PR32's author | an explicit handoff. Luis integrates them visually |
| A11 and migrations 0022–0035, `config/specialists.json`, generated contracts | PR32's author | PR32 lands |
| `config/runtime-unit.json`, `packages/dsh-bundle/`, runtime locks and digests | Davide | as above |
| Personal space (`features/personal/`, `packages/persistence/src/personal.ts`, A10) | Luis for data and UI; Davide for privacy and the Companion runtime | as above |

## Acceptance cases

| ID | Status |
|---|---|
| BASE-01 Chat and Brief switch, close and reopen; drafts survive | fixture: passes in CI (Chromium, desktop), with unread state. Live and hosted: not run |
| BASE-02 Letters typed with panel focus or nowhere reach the typing sink; no device turns on | fixture: passes in CI (Chromium, desktop), with text-mode exit. Live and hosted: not run |
| BASE-03 Phone panel in an active call keeps mute, sending, errors, leave and return reachable | fixture: passes in CI (Chromium, 390×844 touch). Live and hosted: not run |
| BASE-04 Research and personal route changes coexist in a reviewed combined candidate | not run: it needs PR32's candidate (LFE-02) |

LFE-00.3 put BASE-01 to BASE-03 in the repository ([`apps/studio/e2e/room.spec.ts`](../../apps/studio/e2e/room.spec.ts), CI job `studio-browser`). They cover the six behaviours LFE-00.3 names: Chat/Brief switching, drafts, unread state, mobile media controls, text-mode exit and keyboard capture. They are fixture evidence: the Studio's own project shell, feed, query cache and room controller on a labelled fixture page, with only the API and LiveKit faked ([attempt 2](../handoffs/LFE-00-attempt-2.md), [attempt 3](../handoffs/LFE-00-attempt-3.md)). They don't show a live call, LiveKit or a hosted Studio.

## Next tickets (LFE-00.4)

1. **LFE-00.3** (Luis): done on fixtures, in CI ([attempt 2](../handoffs/LFE-00-attempt-2.md); [attempt 3](../handoffs/LFE-00-attempt-3.md) runs them over the real controller and cache; [attempt 4](../handoffs/LFE-00-attempt-4.md) checks a lost call with the panel open). The same cases in a live call wait for a hosted candidate.
2. **LFE-02** (Luis with PR32's author): review the report and PDF UI on PR32. Integrate it after the handoff.
3. **LFE-03** (Luis): Explore's image-direction UI on labelled fixtures, independently of S1-06's backend.
4. **LFE-01** (Davide): the personal space is merged but not live. Davide decides whether it goes to production. A real owner-scoped Companion is bound before messaging is enabled; there is no rehearsal in production.
