# CON-01 coordination (Claude ↔ Codex)

CON-01 completes saved project conversations. Two or more named text conversations in one project, durable member messages with real authorship and stable paging, Ask Sophia on or off, a real read-only native answer in the conversation it was asked in, the three quick asks, the shared current mission context with separate histories, coverage-aware summary and question projections, and enforceable withdrawal ([pack](../../missions/2026-10-09-con01-conversations/README.md), [mission](../../missions/2026-10-09-con01-conversations/01_MISSION.md)).

| Item | Value |
|---|---|
| Mission | CON-01 (the parallel conversation mission; not CTX-01, CON-02 or a Paperclip mission) |
| Pack | `Sophia_CON01_Mission_Pack_v0.1_2026-10-09.zip`, [installed here](../../missions/2026-10-09-con01-conversations/README.md) ([installation record](../../missions/README.md)) |
| Message ids | `CON-01-CC-####` (Claude), `CON-01-CX-####` (Codex). Findings and operations are named in their messages |
| Coordination issue | [#198](https://github.com/davidelaverga/Sophia/issues/198) |
| Branch / PR | `claude/con01-project-conversations` / [#199](https://github.com/davidelaverga/Sophia/pull/199) (draft) |
| Base | `main` `4f7470c`; `main` `71dbea3e` merged at `8f5cbea` |
| Implementer | Claude Code, cloud session `session_01KUDtFK9gWthsXSrepcLQz3`. Sole feature-source writer for the paths in the [binding map](BINDING_MAP.md) §1 |
| Reviewer / operator | Codex, session `01a1224a-32b4-7222-a017-50a277572d95`, worktree `codex/con01-review-attempt-1`. Independent review at G0, G1, G2 and the combined candidate; the hosted batches and the in-app test under Davide's approval. It writes only review, evidence and runbook records |
| Owner | Davide: product, the saved-text policy, spend, merge and release. Luis: the Studio's design and shared shell, and integration review (AGENTS.md) |
| Parallel lanes | PR #190 (SDD-01 G7 voice, A15, 0046–0047); WBC-02 and SDD-01's combined runtime. The shared-file order is in the [binding map](BINDING_MAP.md) §2 |
| Progress | [docs/progress/CON-01.md](../../progress/CON-01.md) |

A comment wakes nobody. Davide resumes either agent with one line, for example: `CON-01: read <the latest CON-01-CC message> on <the coordination issue>, recover the exact candidate, and act only within its scope.` No message here is an approval. A merge, a release, a hosted read or write, a migration and a paid call each need Davide's own scoped approval.

## Messages

| Id | Kind | About | State |
|---|---|---|---|
| CON-01-CX-0001 | kickoff | Codex's reviewer kickoff, given to the implementer session: review scope; #190 is SDD voice; no retention, cohort, allowance or operation approval exists yet | Received; answered by CC-0001 |
| [CON-01-CC-0001](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088598535) ([file](CON-01-CC-0001.md)) | review_request | The G0 binding at `b00d07f` (tree `90cd838`) | Reviewed in CX-0002 |
| [CON-01-CX-0002](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088652493) | review_finding | G0 at `b00d07f`: changes requested (five corrections); option C preferred as direction; disabled local G1 may continue | Answered by CC-0002 |
| [CON-01-CC-0002](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088728643) ([file](CON-01-CC-0002.md)) | review_request | G0 binding revision 2 at `c703b2d` (tree `e4fd211`), the five corrections | Reviewed in CX-0003 |
| [CON-01-CX-0003](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088757330) | review_finding | Revision 2: G1 binding reviewed at specification level; G2 still needs full project, scope, audience and source-revision fences, and transitive dependencies through summaries; B-1 and the impact inventory stay open | Fences and dependencies answered by CC-0004; the inventory by CC-0007; B-1 open |
| [CON-01-CX-0004](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088806698), CX-0005 | evidence, request | Codex's independent records at `1d730a6f` (tree `6bb61270`); publish the G1 intermediate early; integrate `main` (`5489bd2a`, then `71dbea3e`) before G3; #190 needs shared-window acknowledgment | Answered by CC-0003 (intermediate) and CC-0005 (`main` merged) |
| [CON-01-CC-0003](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088984254) | review_request | The G1 intermediate (source and tests) at `6092d93` (tree `74df931`) | Reviewed in CX-0006 |
| [CON-01-CC-0004](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6089001749) | review_request | Binding revision 3 at `f4c2355` (tree `45065db`): CX-0003's full source predicate and transitive summary dependencies | Superseded for §8.2 by revision 4 (CC-0007) |
| [CON-01-CX-0006](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6089025000) | review_finding | G1 at `6092d93`: a SQL authorization race (membership read before the project lock) | Answered by CC-0005 |
| [CON-01-CC-0005](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6089070398) | review_request | The CX-0006 correction at `a7cc081` (tree `ada2700`), with `main` `71dbea3e` merged | Accepted in CX-0007 |
| [CON-01-CC-0006](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6089457700) | review_request | The full ordinary gate at `a7cc081`, and the Studio on A16 at `95ea512` (tree `8b4f68d`) | PG and HTTP rerun in CX-0007; the Studio's browser review is pending |
| [CON-01-CX-0007](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6089616601) | review_finding | The CX-0006 correction accepted at L1 within G1 scope (29/29 at `95ea512`); CI failures there are Docker Hub pull rate limits before any test, neither passes nor waived; publish the G3 slice and the inventory with the corrected binding before G2 shared-runtime code | Answered by CC-0007 |
| CON-01-CC-0007 | review_request | The G3 slice (`839fb45`), the option C impact inventory and binding revision 4, at the commit that adds this row | Awaiting Codex; D-6 and B-1 with Davide; shared windows with #190 and the runtime owner |
