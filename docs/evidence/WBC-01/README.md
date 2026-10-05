# WBC-01 walkthroughs (fixture captures)

Taken from `apps/studio/fixtures/work.html`, which is labelled "Simulated — no lead, tool, host or conversation read". These screens show the real Studio components over simulated board views. They are not live behavior, and no service, runtime or conversation is behind them. Each screen is taken on desktop (1280×800) and on phone (390×844, at 2×), in `walkthrough/`.

| Screen | Page | What to look at | Case |
|---|---|---|---|
| `01-board-davide` | `?viewer=davide` | The four lanes. A finished run waiting for its check is Active. The decision names what it is about | G2 |
| `02-sheet-waiting-on-you` | the same, `work-1` | The typed wait ("Permission in its tool · You answer it"). The commands allowed for Davide | UI-07 |
| `03-replan-beside-accepted` | `?case=replan` | Plan r3 proposed beside r2, compared item by item. The board is still r2 | UI-03 |
| `04-review-complete-work-needs-changes` | `?case=defects` | The review is Complete, and its findings open. The retry needs changes | UI-04 |
| `05-check-of-v1-not-v2` | `?case=stale-pass` | "Review passed for retry-v1, not this version". Review candidate is offered | UI-05 |
| `06-closed-work` | `?case=closed` | Closed work, each with its reason. The repair is still Active | UI-06 |
| `07-luis-resource-waits-two-people` | `?case=luis-resource` | Davide's decision and Luis's own permission, each with its own person | UI-07 |
| `08-builder-within-mandate` | Luis | Luis guides Davide's session, within Davide's mandate. The permission stays Davide's | UI-08 |
| `09-viewer-reads-only` | `?viewer=mara` | Nothing to send, and why. Asking still works | UI-08 |
| `10-lost-reply-try-again` | `?admission=lost` | "Not confirmed whether it was recorded", with Try again (the same operation) | UI-09 |
| `11-stop-requested-not-stopped` | `?viewer=davide` | "Stop requested; waiting for the runtime to confirm." The task is still Working | UI-10 |
| `12-stop-settled-closed` | `?settle=confirmed` | "Stopped. Completed work is kept." The task moves to Closed work | UI-10 |
| `13-sophia-native-reviewer` | `?case=native` | "Sophia · Source reviewer", with no subscription. Ask is unavailable and keeps the question | UI-16 |
| `14-old-report-connection-apart` | `?case=old-report` | A 9-minute-old report, still Working. The lost connection is said apart | UI-17 |
| `15-last-usable-result` | `?case=revision-failed` | The last usable version, marked. The failed one isn't offered | UI-18 |
| `16-choice-recorded-plan-updating` | `?case=reacting` | "Davide chose Ship it now. The plan is updating." | UI-14 |
| `17-work-outside-the-plan` | `?case=outside` | Work the plan in force doesn't hold, listed rather than hidden | UI-01 |
