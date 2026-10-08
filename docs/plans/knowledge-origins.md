# Knowledge: a source says where it came from, and goes there

> 2026-10-08 · The third of three PRs after Luis's critical look at Knowledge («¿pagarías 20 dólares?», «evalúalo
> aislado y como parte de un todo»), after `knowledge-honest.md` and `knowledge-quiet-two.md`. As part of the whole,
> Knowledge was an island: a report's project sources said only «From the project», never the conversation, the meeting
> or the file they came from. Under the vision flag; the API part is a proposal for Davide (A19).

## What reads as an island

- A report cites four of the project's records. Each says «From the project»: the reader can't tell the survey from
  a meeting's notes, nor go back to where it was said.
- The contract can't carry more: `ReportSource` is `additionalProperties: false`, and the database keeps no origin for
  a source object (`source_objects` has none).

## A19 (proposed, for Davide): a version's source origins

`GET /api/v1/artifacts/{artifactId}/versions/{versionId}/source-origins` → `{ origins: SourceOrigin[] }`, RLS as
the sources' read (a source the reader may not see is left out):

```
SourceOrigin = {
  sourceId: string
  kind: 'conversation' | 'meeting' | 'decision' | 'file'
  id: string            // the conversation's, the meeting's, the decision's or the file's own id
  title: string | null  // the conversation's or decision's title, the file's name; null for a meeting
  by: string | null     // who added a file, as the member list names them; null otherwise
  at: string            // when it was said, held or added
}
```

A source with no known origin is simply absent. A separate read keeps `ReportSource` and its contract as they are.

## What changes in the Studio

- **The Sources tab says the origin in words** where the read gives it: «From the conversation “Who owns setup…”»,
  «From the meeting on Oct 4», «From the decision “…”», «A file Lucía added · Sep 29». Without it (no flag, the read
  absent or failing) the row keeps «From the project».
- **A conversation's or a meeting's origin goes there:** Conversations with that one open; Updates with that meeting's
  recap open. Beside the report on a wide screen, the report stays open; where the report covers the page (a phone,
  the full page) it closes first, so the press never lands out of sight.
- **One way across views:** the project gives its views a way to be shown with something open
  (`features/studio/project-go.tsx`); the view takes it once.

## Checks (written first)

- The pilot readout's Sources: a file says who added it and when, as words; a conversation and a meeting are presses.
- At 1440 px the conversation's press shows Conversations with it open, the report still beside it; the meeting's
  shows Updates with its recap open.
- At 390 px the conversation's press closes the report and shows the conversation.
- With the origins' read failing, every project source says «From the project».
- The words: unit-tested for each kind.
