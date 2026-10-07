# Conversations, found: filters and quick asks (C4)

> 2026-10-07 · Luis approved this scope («Me parece bien el c4, procede»). Builds on
> `docs/plans/conversations-quiet.md`. No API change: A18 already lists what each needs.

## The gap

- A project with twenty conversations is a long list of titles. The only way through it is the title filter.
- «What is still open?» and «where did I write?» are the two questions a member brings to the list. Today the answer
  is in each row (the amber count, the faces), one row at a time.
- Asking Sophia means writing the whole ask, even the ones everyone asks: «summarise this», «what is still open?».

## What changes

- **Two quiet filters under the title filter:** «Open» (open questions > 0) and «Mine» (I wrote there). A segmented
  pair, off by default, both can be on. The list says how many it shows; nothing matching says so, with Clear.
- **Kept per project while the page lives** (`page-memory.ts`, as Tasks keeps its answers): leaving the tab and coming
  back finds them as left; a reload starts afresh.
- **Quick asks, in the field's foot while it is empty:** three chips that ask Sophia in one press:
  «Sum it up», «What's still open?», «What did we decide?». Each sends its words as a message with «Ask Sophia» on,
  so the thread shows exactly what was asked. They hide once anything is written, and for a viewer (who can't write).
- On a phone the chips scroll in one row; under a coarse pointer they are 40 px tall.

## Not in this slice

- The last message in each row: A18 has no `lastMessage` (a proposal for Davide).
- Unread: no read marker in A18.

## Checks (written first)

- «Open» shows only rows with an open count; «Mine» only rows where I'm a contributor; both together, both.
- The count line and the empty state with Clear; the filters survive leaving the tab and coming back.
- A quick ask sends its words with Sophia asked (the receipt has `askSophia: true`), and the thread shows them as mine.
- The chips hide with words in the field and for a viewer; 40 px on touch; contrast and type sizes.
