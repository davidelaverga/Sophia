# Handoff: focus kept, and what opens has an address, attempt 1

Goal and attempt: UI-FOCUS-KEPT (`docs/plans/focus-kept.md`; improvements 2, 3, 28 and 29 of the independent
evaluation of 2026-11-22), attempt 1. Batch B of seven; batch A is #544.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/mejoras-b-foco` from `origin/main`
`2697f002c`.
Ending commit/tree and changed files: content commit `d8e72667f` (tree `7fdb7c68e`): 28 files changed, 730
insertions, 84 deletions, under `apps/studio` and `docs/plans`; this record is the next commit.

## Outcome

- After Hold, Resume, Stop for good, Create the room link, Send invitation, and Join or Leave by key, the focus is on
  the control that took the pressed one's place, never the page.
- An open goal (`#goal-<id>`), the room's panel (`?panel=`) and Invite's tab (`?invite=`) are in the address; a reload
  or a pasted link reopens them. Back doesn't close them: that is Luis's decision (the note's «For Luis: Back»).
- The first run focuses each step's field; a role change says «Saved» and clears an earlier refusal.
- Not verified locally: the Playwright specs (the guard refused twice for RAM, 7.5 and 6 GB free; not insisted).
  CI's browser job is the run on record for `focus-kept`, `goals-overview`, `home-first-run`, `member-roles`,
  `type-tip`, `room-discussion` and `app-auth`.

## Evidence

- Before, on the evaluation's stack (`df4b4a518`, :5173): Join and Leave left the focus on `body`; the panel's
  address was `?lens=converse` with Chat open.
- After, on this branch's Studio (:5176, same API): Join by key → «Microphone», Leave by key → «Join the room»; by
  mouse, the page (push-to-talk); `?panel=people`, `?panel=chat`, `?invite=members` → `guests`, a reload reopening
  Invite on Guests with Chat open, closing dropping `invite`; a goal `#goal-8bd6931d…`, reopened by a reload, gone
  on Close; a role change: the earlier «A project needs an admin…» cleared, «Saved» under Davide's select, the focus
  kept, «Saved» gone after 2.5 s (Davide's role put back). Fixtures (:5181): Hold → (Stop while holding) → Resume →
  Hold, Stop for good → the status line, by key and by mouse; first run: step 2 → «On my own», step 3 → «Project
  name».
- Studio units: 2543 pass; the 2 failures are the known Windows-only ones, as on main.
- `pnpm lint` 0, Studio `tsc --noEmit` 0, Prettier clean.
- One independent review of the whole diff before the push: one P1 (the dock's handoff against push-to-talk), P2s
  (a press outside a control, `?invite=` for anyone, three specs), P3s (`routed` for the panel, one «Saved» per save);
  all fixed. Its P3 on Stop's at-rest press was checked and is not one: `ConfirmButton` waits with `aria-disabled`.

## Decisions and changes

- Addresses written with `replaceState`, as the lens, not `pushState`: Back left as it is, for Luis.
- The dock hands the focus on after a key's press only, for push-to-talk.
- First run: the field takes the focus instead of the title (the improvement's first option); `home-first-run.md`
  updated.

## Remaining obligations

- The PR is not merged; CI's browser job is the run on record.
- «Saved» under a role's select pending Luis's approval; the Back decision.

## Next bounded action

Luis reviews the PR and decides Back. Batch C (`ui/mejoras-c-chat`: optimistic send, a new message's notice, grouped
messages, one clipboard notice) follows.

Source IDs consulted: `AGENTS.md`, `CONTRIBUTING.md` (Studio UI, the room's side panel), `apps/studio/src/features/resources/link.ts`, `docs/plans/`
`work-copy-links.md`, `addressed-follows-back.md`, `studio-lens-address.md`, `home-first-run.md`,
`focus-handoff-follow-ups.md`, `goal-controls-text.md`, `member-roles.md`.
