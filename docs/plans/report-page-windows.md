# The report page on Windows: lines in the measure, and the PDF checks' fonts

> 2026-10-16 · Luis: «Corrige esos 2 fallos». On Windows, four checks of `report-page.spec.ts` failed, the same on a
> clean `main`; on CI (Linux) they pass. Two causes, one of them the page's own.

## What was measured

- **C1, the reading column holds 60 to 80 characters a line, failed on Windows with 57.** The text font's stack
  (`page-css.ts`) puts «Sitka Text» before Cambria, and Windows has Sitka, a wide face. Characters a line for the
  kitchen fixture, on screen and in print, measured in Chromium on Windows:

  | Font | Screen | Print |
  | --- | --- | --- |
  | The stack as it is (Sitka Text) | 57 | 57 |
  | The stack without Sitka (Cambria) | 65 | 65 |
  | Georgia | 62 | 63 |
  | Liberation Serif (CI's) | 69 | 69 |

  A Windows reader got lines shorter than the page's own rule.
- **C9 (print, two checks) and C17 failed before any measure.** `report-probes.ts` gives pdfjs its standard fonts as a
  path from `fileURLToPath`, which on Windows ends in a backslash. pdfjs asks for a trailing `/` and refuses it. In
  Node, pdfjs reads `base + file` with `fs.readFile`, which takes forward slashes on Windows too.

- **Then C9 failed on «espanol» once pdfjs could read the PDF.** With Cambria, Chromium cuts the paragraph's run at
  the accented letter, and pdfjs gives it as an item of its own, decomposed: «El equipo empez» + «ó» + « » + «por
  los…». The size check looked for one item starting with the paragraph's first 24 characters. That item is 10.5 pt,
  as it should be; the check couldn't see it.

## What changes

- **`page-css.ts`:** «Sitka Text» leaves `--font-text`, so Windows sets the text in Cambria. Mac (Charter) and Linux
  (Noto Serif or Liberation Serif) keep theirs. The page's bytes move. The pinned digest in `report-page.test.ts`
  moves with a note, as M75's did.
- **`report-probes.ts`** (test-only):
  - the fonts' path uses forward slashes, keeping its trailing `/`;
  - the size check reads the paragraph's opening across the items after the one it starts at, composed (NFC).
  - The size is still the item's own.

- **The Studio's Document tab** (`artifacts.css`, `.md`) leaves Sitka Text out too, so a report keeps its lines between
  the Studio and its download (Codex P2 on #400). `reader-stack.test.ts` keeps the two stacks equal, face by face.

## Checks

- `report-page.test.ts`: the text stack holds no Sitka Text, and the pinned digest is the new one.
- `report-page.spec.ts` on Windows: C1 (60 to 80 characters on screen and in print), C9 and C17 pass, as they already
  do on Linux.
