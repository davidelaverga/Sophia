# FND-B-C1-MINIMAL-PRIVACY-CARRY-01 — attempt 1

Carries the independently accepted refusal privacy correction onto C1 (`foundation/con-c1-current-main-20261017`, from
`42f65b5e`, the tree of `f3700656`). Nothing else from the common branches is taken.

- What: a protected conversations list or thread read is refused at its 403 status, without waiting on a delayed or
  malformed body (`client.ts` `protectedRead`, used by `conversations.ts`). The list and thread reads also fence or deny
  in their query functions as the client raises that refusal (`ConversationsView`, `OpenConversation`), so no frame
  shows protected content or controls after it (R-REFUSAL-MEASURE-01).
- Source: the donor is attention common `586327ce`: `e584a6c6..527d3b62` for the client and its unit tests, and
  `527d3b62..586327ce` for the UI and the semantic browser cases. C1's six base blobs equal the donor's bases, so each
  carried file is blob-equal to `586327ce`. No translation was needed.
- Proof on this branch: four semantic browser cases (list and thread, delayed and malformed 403 bodies) fail on the
  original C1 source and pass after the carry. The whole removal spec passes 46/46. A declared `protectedRead` guard
  mutant fails all four, and `client.ts` is restored to blob `2044ed49`. Client unit tests pass 9/9. The observer
  measures DOM layout and visibility in `requestAnimationFrame` callbacks, not compositor paint.
- Untouched: API, persistence, contracts, config, runtime, SQL and ACL inputs, locks, and the earlier 53-file Studio
  artifact. The artifact stays held until it is rebound and reviewed separately.
