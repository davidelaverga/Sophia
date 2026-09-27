# Milestones and goal sessions

**Cumulative v0.4 Part 2.** All 24 goals have individual implementation briefs. These are goals, not 24 separately scheduled sprints. Product implementation remains not_started in this documentation pack; local reference tests are recorded separately.

## Sprint 1

| Goal | Owner | Dependencies | Design status |
|---|---|---|---|
| [S1-01 — Create the new repository and reproducible runtime source unit](goals/S1-01.md) | Davide | None | design_ready |
| [S1-02 — Admit a project command and replay its state in the UI](goals/S1-02.md) | Luis | S1-01 | design_ready |
| [S1-03 — Run, steer, stop and recover a native dsh worker](goals/S1-03.md) | Davide | S1-02 | design_ready |
| [S1-04 — Build the shared Studio shell and real room transport](goals/S1-04.md) | Luis | S1-02 | design_ready |
| [S1-05 — Connect Gemini 3.8 Live to real work and selected vision](goals/S1-05.md) | Davide | S1-03, S1-04 | design_ready |
| [S1-06 — Generate, compare and retain Google/OpenAI image assets](goals/S1-06.md) | Davide | S1-02 | design_ready |
| [S1-07 — Produce runnable UI source that Luis can edit](goals/S1-07.md) | Luis | S1-03, S1-06 | design_ready |
| [S1-08 — Import existing context and compile the next useful brief](goals/S1-08.md) | Davide | S1-02 | design_ready |
| [S1-09 — Connect the three owner-operated engineering resources](goals/S1-09.md) | Davide | S1-02 | source_bound_live_probe_required |
| [S1-10 — Enable goal-scoped peer messages and responsive handbacks](goals/S1-10.md) | Davide | S1-03, S1-09 | design_ready |
| [S1-11 — Make the technical lead plan, review and steer the project](goals/S1-11.md) | Davide | S1-03, S1-08, S1-10 | design_ready |
| [S1-12 — Review and steer the complete application from Sophia](goals/S1-12.md) | Luis | S1-05, S1-07, S1-09, S1-11 | design_ready |
| [S1-13 — Deliver useful reports, PDFs and decks through isolated render jobs](goals/S1-13.md) | Davide | S1-03, S1-06 | source_bound_live_probe_required |
| [S1-14 — Complete the founder project episode and release Sprint 1](goals/S1-14.md) | Davide and Luis | S1-03, S1-04, S1-05, S1-06, S1-07, S1-08, S1-09, S1-10, S1-11, S1-12, S1-13 | design_ready |

## Sprint 2

| Goal | Owner | Dependencies | Design status |
|---|---|---|---|
| [S2-01 — Semantic attention and milestone cooperation](goals/S2-01.md) | Luis | S1-14 | implementation_brief_ready |
| [S2-02 — Exact source-backed artifact revision](goals/S2-02.md) | Luis | S1-14 | implementation_brief_ready |
| [S2-03 — Scenarios and executable application review](goals/S2-03.md) | Davide | S1-14 | implementation_brief_ready |
| [S2-04 — In-app native requests and mobile control](goals/S2-04.md) | Davide | S1-14 | implementation_brief_ready |
| [S2-05 — Consented discussion-following and richer voice](goals/S2-05.md) | Davide and Luis | S1-14 | implementation_brief_ready |
| [S2-06 — Scoped project connectors and between-session continuity](goals/S2-06.md) | Luis | S1-14 | implementation_brief_ready |

## Sprint 3

| Goal | Owner | Dependencies | Design status |
|---|---|---|---|
| [S3-01 — Authorized multi-week project continuity](goals/S3-01.md) | Davide | S2-01, S2-02, S2-03, S2-04, S2-05, S2-06 | implementation_brief_ready |
| [S3-02 — A useful Sophia-native application implementer](goals/S3-02.md) | Davide | S3-01 | implementation_brief_ready |
| [S3-03 — Adaptive execution and procedure improvement](goals/S3-03.md) | Davide and Luis | S3-01 | implementation_brief_ready |
| [S3-04 — Repeated external-team use and clean migration](goals/S3-04.md) | Davide and Luis | S3-02, S3-03 | implementation_brief_ready |

Start integration through [S1 binding sessions](sessions/S1_BINDING_SESSIONS.md). A new coding conversation never resets accepted criteria, cumulative usage, prior failed probes or unresolved effects. Use the [session handoff](../templates/SESSION_HANDOFF.md).
