# Room: what Sophia made is born in the room

> 2026-10-05 · Luis · third PR of the room's $20 plan ([prototype](https://claude.ai/artifact/HFtEbbCuzYN834bu7LahWb), scene 3) · "Procede con ese orden"

## The gap, measured

When Sophia finishes a report, the room shows a dot on the Chat toggle. The card is inside the closed panel and says only "Research report ready": no title, nothing of what the report says, who asked for it, or how long it is. The moment Sophia delivers her work, the reason the room exists, happens out of sight.

## What changes

**The arrival.** When a result's notice reaches this member in the call, an object is born under Sophia's line. It rises from where the light is, from soft to sharp, with the room's ease, once. Under reduced motion it just appears. The light itself keeps saying only what is true (A15): no pretend speaking.

**The object shows the report the way Knowledge already shows it:**
- its title and version;
- Sophia's description of it (the summary Knowledge shows, its author's words);
- who asked, by the chat's names;
- a few facts read from its record:
  - minutes of reading (words ÷ 230);
  - sections (the Markdown's `##` headings);
  - sources cited;
  - limits noted, marked when there are any.

**The words around it stay Studio's.** The notice packet carries no text (plan §2.4). The object's title and description are the report's own, shown as data in its card, as Knowledge does. Until the task's record is read, the object says what the chat's card says, "Research report ready", and Open waits (aria-disabled, never disabled).

**What you can do with it:**
- **Open** (the primary action, key O) opens the report in the viewer, as the chat's card does.
- **Close** (×, Esc) puts the object away for this person.
- The chat keeps its card either way.
- Show everyone is not here: it needs the shared focus the API doesn't serve yet (plan item 6).

**When it shows:**
- **Room state:** in the call, Converse, no video on the stage, and the Chat panel closed. With Chat open, its card is there instead: one place at a time.
- **One at a time:** a newer notice (another result, or a revision) takes its place.
- **Put away stays put away:** an opened or closed object stays away after a visit to another view, as the captions' hold does.
- **Placement:** on the stage's axis, under Sophia's line, above the captions and the dock. On a phone it rests on the dock, without its facts row.

**Also here, from Codex on #101:** a guest's caption stays marked ("Name · guest"), as CONTRIBUTING's Studio rule asks. The fixture gains `guest=1`: the last person in the room is a guest.

## Out of scope

- Sophia's work line with real progress (anticipation): PR 3b, from the research record's reads and PDF rendering.
- Asking about a passage, a version arriving live, and citations' sources: PRs 4–5.

## Checks (written first, `e2e/room-made.spec.ts`)

- **The object:** a notice in the call brings it, with the report's title and version, Sophia's description, "Asked by you", and its facts (reading minutes, sections, sources).
- **Open** opens the report in the viewer, and the object goes. **Close** puts it away. The chat still has its card, and after a visit to Knowledge the object stays away.
- **A revision's notice** replaces it with v2.
- **Chat open:** not on the stage; closed, back.
- **While the record is held** (`hold=task`): the Studio's words, Open aria-disabled; then filled.
- **Placement:** on the axis, between Sophia's line and the dock, not over the captions; a phone fits.
- **Guest:** a guest's caption reads "Name · guest".
