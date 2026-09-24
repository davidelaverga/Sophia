# Milestones and goal sessions

A goal is a durable outcome and may require more than one coding session. Each native session receives the current goal, exact source context and bounded assignment. A session ending does not close the goal. The machine-readable graph is [planning.json](planning.json).

There are 14 detailed Sprint 1 goal briefs. Sprint 2/3 outcomes are mapped below; their detailed bindings are intentionally the next documentation installment, not hidden implementation instructions.

## Sprint 1 — complete shared creation and engineering workspace

| Milestone | Goals | Usable checkpoint |
|---|---|---|
| M1.1 — A real shared voice-to-work path | S1-01–S1-06 | Two people enter a project, talk to Gemini and launch real dsh/image work |
| M1.2 — Create and coordinate | S1-07–S1-11 | Luis edits a runnable prototype; existing context and all three engineers support one goal |
| M1.3 — Review, steer and carry forward | S1-12–S1-14 | Complete app review, useful reports/decks and the full founder episode |

| Goal | Owner | Depends on | Design depth |
|---|---|---|---|
| [S1-01 — Create the new repository and reproducible runtime source unit](goals/S1-01.md) | Davide | — | design_ready |
| [S1-02 — Admit a project command and replay its state in the UI](goals/S1-02.md) | Luis | S1-01 | design_ready |
| [S1-03 — Run, steer, stop and recover a native dsh worker](goals/S1-03.md) | Davide | S1-02 | design_ready |
| [S1-04 — Build the shared Studio shell and real room transport](goals/S1-04.md) | Luis | S1-02 | design_ready |
| [S1-05 — Connect Gemini 3.8 Live to real work and selected vision](goals/S1-05.md) | Davide | S1-03, S1-04 | design_ready |
| [S1-06 — Generate, compare and retain Google/OpenAI image assets](goals/S1-06.md) | Davide | S1-02 | design_ready |
| [S1-07 — Produce runnable UI source that Luis can edit](goals/S1-07.md) | Luis | S1-03, S1-06 | design_ready |
| [S1-08 — Import existing context and compile the next useful brief](goals/S1-08.md) | Davide | S1-02 | design_ready |
| [S1-09 — Connect the three owner-operated engineering resources](goals/S1-09.md) | Davide | S1-02 | binding_audit_pending |
| [S1-10 — Enable goal-scoped peer messages and responsive handbacks](goals/S1-10.md) | Davide | S1-03, S1-09 | design_ready |
| [S1-11 — Make the technical lead plan, review and steer the project](goals/S1-11.md) | Davide | S1-03, S1-08, S1-10 | design_ready |
| [S1-12 — Review and steer the complete application from Sophia](goals/S1-12.md) | Luis | S1-05, S1-07, S1-09, S1-11 | design_ready |
| [S1-13 — Deliver useful reports, PDFs and decks through isolated render jobs](goals/S1-13.md) | Davide | S1-03, S1-06 | binding_audit_pending |
| [S1-14 — Complete the founder project episode and release Sprint 1](goals/S1-14.md) | Davide and Luis | S1-03, S1-04, S1-05, S1-06, S1-07, S1-08, S1-09, S1-10, S1-11, S1-12, S1-13 | design_ready |

## Sprint 2 — outcome map

| Goal | Owner | Outcome |
|---|---|---|
| S2-01 — Semantic attention and milestone cooperation | Luis | Use the heartbeat and actual artifact milestones to create source-bound opportunities; retain separate required actions, quiet progress and controls. |
| S2-02 — Exact source-backed artifact revision | Luis | Integrate expected-base and component-scoped mutations, preserved-sibling checks and atomic candidate publication for supported artifacts. |
| S2-03 — Scenarios and executable application review | Davide | Add Storybook/MSW scenario fixtures and Playwright assertions/traces; distinguish simulation, recorded replay and live application evidence. |
| S2-04 — In-app native requests and mobile control | Davide | Answer supported native permission requests from authenticated Sophia mobile/desktop; retain exact native handoff for unsupported login/OS actions. |
| S2-05 — Consented discussion-following and richer voice | Davide and Luis | Add per-track transcription, consented following, attributed context and a single speak/silent/card policy; test English, Italian and Spanish. |
| S2-06 — Scoped project connectors and between-session continuity | Luis | Add selected Notion, Supabase and Vercel management workflows, one notification channel and source-linked return briefs; existing engineer deployments remain usable. |

## Sprint 3 — outcome map

| Goal | Owner | Outcome |
|---|---|---|
| S3-01 — Authorized multi-week project continuity | Davide | Continue dependent goals, reconcile unavailable hosts and uncertain effects, and preserve the mandate across idle periods and runtime restarts. |
| S3-02 — A useful Sophia-native application implementer | Davide | Deliver an actual end-to-end feature in the supported application stack using the same source, evidence, deployment and review contract as external engineers. |
| S3-03 — Adaptive execution and procedure improvement | Davide and Luis | Select and adjust approved model/effort/tool/team profiles from evidence; evaluate versioned procedure changes with rollback and current context eligibility. |
| S3-04 — Repeated external-team use and clean migration | Davide and Luis | Onboard a small team with a nontechnical contributor, observe repeated real work and willingness to pay, and retire old routes only after their obligations are discharged. |

## Session allocation and integration

Davide and Luis keep separate human ownership even when a model writes code. Davide's Codex/Claude sessions and Luis's Claude session can take independent assignments; a coordinator is assigned per goal, not fixed permanently by vendor. Source areas and shared effects have one current owner. The technical lead does not become a second writer merely because it proposes a correction.

Start S1-01, then the first schema/UI slice of S1-02. S1-03 and S1-04 proceed against the agreed contracts. S1-06 and S1-08 can proceed alongside them. Complete the external-engineer binding audit inside S1-09 before implementing its adapter. Luis's frontend work should not wait for the entire external-team implementation: use labelled contract fixtures during development, then replace them on S1-14's real route.

A binding-audit goal begins with a concrete source task and ends with code plus real integration evidence; it is not an open-ended framework competition. The renderer and external-engineer decisions are settled. Their remaining exact code/API mapping is named in CONTINUATION.
