# The fixture pages as one project at work (`?demo=1`)

> 2026-10-07 · Luis, before the full walkthrough video: «El fixture … que sea algo elaborado. Simula lo más cercano
> posible a la experiencia real», and the walkthrough as a real arrival: signing in, the opening, a meeting on, joining.

## The gap

The fixture pages speak about themselves: «Fixture project», «Fixture report», «The fixture holds.», a decision «Keep
the room checks on fixtures», a conversation «Test data for the first release», the viewer «Fixture viewer», a shared
screen that reads «Marco’s screen (synthetic)». Hundreds of checks assert on those words, so they stay.

## What changes

**One switch, `demo` in the address,** read once in `fixtures/demo.ts`, swaps the words for one coherent project:

- **The project:** «Onboarding pilot». Fourteen customer teams took a new onboarding; two left in week three. Its
  direction: «Bring every new team to a first shared report inside its first week».
- **The report:** «Pilot readout: what kept 12 of 14 teams».
  - Version 1: an introduction, «What we measured» (with a table), «What kept teams», «Why two teams left», a
    conclusion and recommendations.
  - Version 2: adds «The second region» and revises the recommendations; its notes say so.
  - Its four sources are the project's own records (survey, tickets, call notes, dashboard), read in full.
  - Each version's SHA-256 is checked by the viewer as for any report.
  - Each version also carries a designed HTML page (`fixtures/demo-page.ts`), as Sophia's designer publishes one:
    four key figures, charts drawn in inline SVG (active teams by week, days to a first shared report, week-four
    sessions, the two regions in v2), the findings as cards, a timeline of why two teams left, the comparison
    table, recommendations with their reason, and the sources. Static, as the viewer's sandbox requires.
- **Around it:** the decision and open line of the last meeting, the brief's accepted decision, a conversation
  about who owns setup, Sophia's description, Home's live room (Marco, Lucía and Sophia), the viewer «Luis», and a
  shared screen that draws the pilot's weekly active teams.
- **Search:** a report section's snippet without citation ids or emphasis marks. The A13 proposal should say a
  snippet is plain words.
- **Still honest:** every page keeps its label, «Demo · simulated data». The checks' own controls (Lock, Leave Home)
  are left out of the demo.

**Without `demo` nothing changes:** every value is the fixture's, byte for byte.

## Checks

- **Unchanged checks:** the existing browser checks run without `demo` and must pass as they do on main.
- **The demo's own hashes:** each version's SHA-256 matches its text (checked by a one-off script; the viewer
  refuses a mismatch on screen).
- **A look:** every demo page scanned for «fixture», «synthetic», «labelled» or «test data» on screen. None left.
