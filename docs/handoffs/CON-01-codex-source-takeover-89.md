# CON-01 takeover89 — current-main preservation refresh

14 October 2026. Previous turn made concrete progress: corrected and independently reviewed the exact pending27/36 proposal; owner approval still pending. Same source-only expiry18:00Z/20:00Rome, no new authority. No product-source write, push, merge or operational effect this checkpoint.

Main advanced from e3bc38d263fe2071e02cf8e91560fdbdbdc40d2b to **34c87ec3bda06afe0d5f243028172eb1ef2b14b6**, merging322/323. Exact comparison retained in private main-refresh-20261014-1642/compare.json. Read actual source patches and added regression assertions. No local/browser rerun of these other-owner changes is claimed.

Preserve these additional behaviors when integration is authorized:

- Search's boardReading flows from ServedWork.useBoard through ProjectShell.useTasksWork/BodyProps/ProjectSheets into ProjectSearch/useLocal/SearchOutcome. While initial board read is pending, no empty verdict or Ask-instead offer. Board read failure leaves search's own result available. Keep CON's answers/cohort guard as well.
- Search uses current goal notes via useLedger/withNotes. Health is omitted while unknown, task doer text is highlighted, and local goal/task hits still count toward empty results.
- Personal's crowded day pill transfers focus to the actual divider before paint; hiding an inert button must not strand focus. A revisit with opening suggestions still offered re-establishes the centred start. These are separate Personal behaviors, not CON permission to activate unrelated proposals.

Existing Luis199 comments6115106416/6118092274/6120119263 remain current in that author's returned comment list. PR199 head d527f3854222020abb6ba723bf0ea7480c76bb82 remains open. Historical ui/kit-with-con01 heads are reference resolutions, not current-main replacement authority. Issue198 is the open coordination issue (attempting its pulls endpoint returned404; the correct issues endpoint confirms identity).

Read-only git fetch refreshed origin/main. `git merge-tree --write-tree HEAD origin/main` returned1 with11conflicted files and preview tree bc1790a4d5c5be8a9c8d29b01e037d7bf920eb45. This is **published457053b3 versus main only**, excluding all dirty source, and is not an integrated candidate. No index/worktree/branch reset or merge performed. Conflicts: fixture-api.ts, room.tsx, route.ts, ConversationsView.tsx, OpenConversation.tsx, next-ask.test.ts, next-ask.ts, useNextAsk.ts, ProjectShell.tsx, profile/pnpm-lock.yaml, runtime-unit.json. Exact paths/stage identities in private receipt.safe.json and published-merge-tree.txt. Recorder-generated identities must be regenerated for an eventual combined artifact, never manually chosen from one side.

Automatic review activity:322 comment6171975884 reports Completed forff06b16;323 comment6172083426 reports Completed for9740b3e. Their formal reviews endpoints return empty arrays; completion-summary comments are not independently asserted no-findings verdicts. No new CON push;273 automatic6144338846 still covers457053b3fe only. Review after every future push remains required.

Authority, readiness and acceptance remain unchanged from88: pending source amendments, Q8/Linux/shared integration and live batch gates. OP0002r6/OP0001r4 unapproved/not ready; no serving CON tuple, signed-in two-account episode or app_verified. Ledger18partial_L1/3passed_L1/15not_run. H87 remains the last verified implementation component; no broader mission completion.

No active processes, hosted effects, credential/provider use or spending; only read-only GitHub/Git discovery and local evidence/documentation. No live rollback needed. Next bounded action remains applying the independently reviewed27/36 amendment only after owner approval, with affected tests and independent recheck; retain these new main behaviors for Luis-owned integration. No autonomous monitoring.
