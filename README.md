# Sophia Conversations design review

**Candidate tree** `da4ae241a210ecf698f4883f70fe62d4d381b603`

## What to review

- A reply shows the message it targets and lets the sender clear that target.
- Mentions and report-version selection are separate controls. The draft shows the selected members and the exact report version.
- The same thread can hold distinct drafts for different reply targets and report versions.

## Screenshots

| Scenario | Proposed desktop | Proposed narrow | Baseline desktop | Baseline narrow |
| --- | --- | --- | --- | --- |
| Reply and mentions | [Desktop](screens/mentions-desktop.png) | [Narrow](screens/mentions-narrow.png) | [Desktop](screens/main-reply-desktop.png) | [Narrow](screens/main-reply-narrow.png) |
| Start from a report version | [Desktop](screens/report-composer-desktop.png) | [Narrow](screens/report-composer-narrow.png) | [Desktop](screens/main-composer-desktop.png) | [Narrow](screens/main-composer-narrow.png) |
| Reply with a report version | [Desktop](screens/report-reply-desktop.png) | [Narrow](screens/report-reply-narrow.png) | [Desktop](screens/main-reply-desktop.png) | [Narrow](screens/main-reply-narrow.png) |

The desktop captures are 1440 × 900 and the narrow captures are 390 × 844. The baseline used Studio's built-in fixtures. The proposed design ran against a disposable local API and database using synthetic project data. The fixture content and flags differ.

## Checked behavior

Twelve local served browser checks passed. They covered Enter submission, reload and lost-response retry, stale member selection, separate drafts by reply target, replay with the exact report version, and recipient selection when starting from Search. The proposed integration carries the same Studio source used in the screenshot rehearsal. Production configuration, authorization and signed-in workflow verification remain open.

The requested approval covers the Conversations composer, reply targets, structured mentions and exact report-version controls for publication and integration review of this candidate. Please record the decision in [issue #502](https://github.com/davidelaverga/Sophia/issues/502).
