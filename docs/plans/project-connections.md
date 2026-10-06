# Project: connections, shown before anything connects

> 2026-10-06 · Luis · Davide's vision, chapter 7 «Connect» («Let the work travel. Keep its meaning here.»), behind the vision flag · "Procede y continua con lo otro"

## The gap, measured

Davide's chapter has two ways for the work to leave Sophia without becoming another source of truth:

- a member's own external assistant reading an approved excerpt of the project;
- the team's Slack channel receiving one selected update.

His sketch says «Nothing connects or sends from this sketch», and so does this. No API can grant an assistant access or reach Slack yet, so the Studio shows exactly what each would do, built from the project's real records. It offers nothing that can't work.

## What changes

**«Connections»,** in Knowledge, under the reports (vision flag only): «Your work can be reachable, without becoming public.» Two parts.

**From your own assistant:** an example («What did we decide about our checks?»), and «Review the read-only access». It opens a sheet, «A small window into the project»:

- **Project:** this one only, by its title.
- **Allowed reads:** meeting recaps, the current brief, the project's reports, project search.
- **Excluded:** personal notes, private conversations, credentials and work controls.
- **Policy:** current membership + source eligibility + outbound permission + a grant bound to one assistant.
- **Revocation:** stops future access; it can't erase copies already received elsewhere.
- **The sheet's last line:** «No assistant is connected, and none can be from here yet: connecting one is an integration Davide qualifies client by client.»

**To the team's Slack channel:** «Share a selected milestone, not every discussion», and «Preview the update». It opens a sheet, «One update, the right audience», built from the newest closed meeting's recap (A12):

- **Its lines, each with a box:**
  - what was decided and what was made: checked;
  - what is still open: not checked.
- **The exact update:**
  - the project's title, «Project update», and the date of that meeting;
  - the chosen lines, as recorded;
  - a link to the project.
  - No one's name, and nothing else.
- **«Copy the update»** copies exactly that text and says so. Where copying isn't allowed, it selects the text instead.
- **The sheet's last line:** «No Slack channel is connected. Nothing is sent from here.»
- **With no closed meeting:** «An update is built from a closed meeting’s recap. There is none yet.», and nothing to copy.
- **A recap that can't be read** says so, with Try again.

## The proposed API (A19, issue #105; not used here)

For Davide, when he qualifies it:

- grants bound to one assistant (`POST/GET/DELETE /api/v1/projects/{id}/grants`), read-only, over the allowed reads above;
- an outbound delivery of one selected update to one channel. Connecting a channel never widens membership or mirrors conversations.

## Out of scope

- Connecting anything, sending anything, OAuth, MCP.
- Choosing which reports are eligible (source eligibility exists in the brief's revisions; showing it per report is later).

## Checks (written first)

- **Browser** (`e2e/project-connections.spec.ts`):
  - Knowledge shows Connections with both parts; nothing claims to be connected;
  - the access sheet lists the allowed reads, what is excluded, the policy and the revocation, names the project, and says no assistant is connected; Close returns the focus;
  - the update's preview is built from the newest closed meeting: the decision in it, the open item not, until its box is checked; no one's name;
  - Copy the update copies exactly the preview and says so;
  - with no closed meeting, it says so, with nothing to copy;
  - a recap that can't be read says so, with Try again;
  - controls are at least 24 px, and the text keeps to the scale.
- **Unit** (`update-text.test.ts`): the update's text from a recap and the chosen lines.
