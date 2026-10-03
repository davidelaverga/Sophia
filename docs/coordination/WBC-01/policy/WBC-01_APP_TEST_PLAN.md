# WBC-01 — Codex app-test plan

Codex is the independent test owner relative to Claude's implementation. This file adds test/deployment reporting to WBC-01; it does not replace UI-01–UI-21 or certify them. All new cases below start **not run**.

## Prerequisites

Read the actual current `AGENTS.md`, `CONTRIBUTING.md`, package scripts and WBC-01. Bind the source SHA, review base, toolchain, configuration and actual browser under test. Use current package names rather than past example filters. Run exact locked dependencies; do not upgrade to cure a test failure without a reviewed dependency change.

Local fixtures use synthetic data and no provider credentials. Production smoke uses only an owner-authorized QA identity/project and non-destructive allowed actions. Avoid real voice/provider work unless a separate existing authorization covers it. Desktop and mobile viewport checks in Chromium are not equivalent to testing Safari on a physical iPhone; record that distinction.

## Matrix

| ID | Level | What Codex exercises | Required evidence |
|---|---|---|---|
| QA-01 | Source | Exact WBC diff plus current shared-file changes | Base/head, scoped paths and unresolved findings. |
| QA-02 | Local fixture | Every mission UI-01–UI-21 case | Case-by-case pass/fail/not-run and meaningful evidence. No inferred passes from CI counts. |
| QA-03 | Local fixture | Negative review, new candidate with old check, stopped/closed items | Review may complete negatively; implementation is not falsely complete. |
| QA-04 | Local fixture | Shared builder vs viewer vs account-owner request | Only projected shared-work actions available; native owner authority preserved. |
| QA-05 | Local fixture | Pending decision, stale revision, expiry, lost response | Correct choice receipt, original key retained, no default answer or conflicting retry. |
| QA-06 | Local fixture | Sending/Recorded, delivery without stop settlement, out-of-order observations | Accurate uncertainty and no false Held/Stopped state. |
| QA-07 | Local fixture | J/K, close/reopen, replan, same session/new assignment, late answer | Original task/command/draft/answer identity remains intact. |
| QA-08 | Local fixture | Desktop, phone viewport, keyboard/touch, reduced motion, zoom | Operable controls, readable states and no clipped dependencies/results. Exact dimensions recorded. |
| QA-09 | Local fixture | Active-call shell and task sheet coexist | Existing microphone/sending/leave controls remain reachable; no silent capture. Media simulated and labeled. |
| QA-10 | Production-mode build | Ordinary entry points and production asset graph | No reachable fixture page/data/mock handler; supported release routes remain functional. |
| QA-11 | Compatibility | Candidate against the actual API configuration and current hosted contract | New backend-only actions remain unavailable; no schema or service upgrade smuggled into release. |
| QA-12 | Preview when authorized | Same production artifact/candidate on existing preview target | Source/config/artifact identity, safe auth/network checks; no public fixture data. |
| QA-13 | Release | Approved exact target and artifact | Real deployment/promotion receipt and matching served asset/build identity. |
| QA-14 | Hosted smoke | Sign-in/navigation, room shell, Chat/Brief and Tasks/Resources supported paths | Actual browser/network/console observations. No fabricated plan or paid job. |
| QA-15 | Hosted smoke | Refresh/deep link/mobile controls and missing capability behavior | Current app continues to work; unsupported work paths clearly unavailable. |
| QA-16 | Recovery | Outcome uncertain, newer unrelated deploy, named rollback conditions | Read/reconcile first; no duplicate promotion or rollback over another release. Actual rollback is not forced merely to get evidence. |

Browser tests should target actual assertions, not just screenshots. Redact screenshots and traces before sharing; retain raw sensitive material only in an approved private location and only as needed. Do not create a personal-data corpus for a UI regression.

## Running discipline

Reproduce the changed behaviors first, plus the shared session-action and room controls. Run the repository's formatting, lint, type/contract checks, relevant unit suites, browser suite and production build on the final candidate. For a behavioral fix, use a regression that fails without it. Do not run paid probes or unrelated long suites repeatedly.

A test may write a disposable database only when the tooling resolves and validates a disposable target. Read a test command before invoking it when its target could be ambiguous. Keep the release artifact from a clean checkout; never deploy a tree containing test perturbations or instrumented fixture handlers.

## Report template

```text
APP_TEST_RESULT
source: <full candidate SHA>
artifact: <digest/build identity or not built>
environment: local-fixture | local-production-mode | preview | production
backend: <actual origin/contract identity; sanitized>
browser: <name/version; viewport; physical device or emulation>
cases: <IDs with pass/fail/not_run>
evidence: <test outputs; trace/screenshots; safe refs>
paid_calls_started: 0 | <separately authorized reference>
source_or_hosted_changes: <what actually changed>
limitations: <unknowns and untested paths>
next_actor: <name/role>
```

A deployed dormant workboard can satisfy QA-10–15 without proving new live execution. State this clearly in the handoff. Full live command, account, quota, native-permission and Paperclip tests belong to the later integration missions.
