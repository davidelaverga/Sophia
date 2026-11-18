# README interface references

The root README combines deployed-interface captures with an explicitly
labelled prepared interface. These files document appearance and visible
state; they do not independently qualify provider execution or complete a
programme acceptance case.

## Deployed interface

Captured on **18 November 2026** from the authenticated
[Sophia Studio](https://studio.sophia-ei.com/) interface. The selected project
contains research on public topics and an explicitly fictional reading-room
test brief. No private conversation bodies, credentials, account identifiers
or payment details are included.

| File | View | What the image establishes |
|---|---|---|
| [current-room.jpg](current-room.jpg) | Project Studio, room at rest | Current shell, central presence light, room entry and optional side-panel controls. No call was joined for this capture. |
| [current-artifact.jpg](current-artifact.jpg) | Knowledge with an existing report open | Report presentation, version metadata, sources/history/tasks navigation and download affordance. |
| [current-knowledge.jpg](current-knowledge.jpg) | Knowledge collection | Existing output cards, format and project filters, search and history affordances. |

The serving build identity was not established by this visual inspection.
Repository claims were checked separately against main at
[`de7a6ab257a98861bb3790dea65f228014a5d2cd`](https://github.com/davidelaverga/Sophia/commit/de7a6ab257a98861bb3790dea65f228014a5d2cd).
These images are the original browser JPEG bytes, without content retouching.

## Prepared resource interface

Recovered from the supplied `Sophia_UI_8c1077b3_Review.zip` review packet.
The screenshots show the implemented UI at candidate
`8c1077b3df4c17e07a36c322eda26db4096eeece`, rendered with synthetic fixture
responses. They are not new captures of the deployed resource catalogue.

| README file | Original screenshot |
|---|---|
| [prepared-resources.png](prepared-resources.png) | `after-8c1077b3-catalog-complete-owner-desktop.png` |
| [prepared-resource-detail-narrow.png](prepared-resource-detail-narrow.png) | `after-8c1077b3-catalog-owner-sheet-collapsed-narrow.png` |

Both files are unmodified PNGs. The desktop capture is 2560 × 1600; the
narrow capture is 780 × 1688. Display names, resource records, connection
observations and the project are fixture data. The desktop image includes the
fixture notice. The narrow image's adjacent caption carries the same
qualification because the notice is clipped in the original capture.

The catalog deliberately separates recorded connection information from live
readiness, activity, capacity and execution controls. Its source is in
[`ProjectResources.tsx`](../../apps/studio/src/features/resources/ProjectResources.tsx),
with activation controlled by
[`native-resources.ts`](../../apps/studio/src/app/native-resources.ts).
The current [incremental programme](../execution/2026-11-08-incremental/README.md)
defines the remaining connection, contribution, selection and delivery work.

## Maintaining the tour

Replace captures when their visible interface changes. Keep deployed,
prepared and planned states explicit. Recheck the captured contents before
publication and preserve any fixture notice or necessary qualification.
Do not replace unknown quotas with sample percentages or infer live execution
from a connection label.

Local asset paths make the README render on its branch and after merge. No
expiring download links, hosted private exports or generated UI mockups are
used.
