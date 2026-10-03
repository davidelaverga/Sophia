// The html-report-v2 stylesheet: the page's one <style>, alone (pdf-report-v1's REPORT_CSS is not part of it). A
// monograph's voice (a serif for the reading, a sans for the apparatus) on warm paper, five sizes on one ratio, a
// 30-em measure, a contents rail on wide screens, Studio's palette in a dark scheme on screen, and A4 print that never
// cuts or scales a table. Nothing loads and nothing runs: no url(), no @import, no @font-face. Its bytes are part of the
// page's identity (report-page.ts), so a change here is a change of profile.
export const PAGE_CSS = `/* Sophia html-report-v2. A research report set as a monograph: one serif voice for the reading (title, headings, text,
   quotes, source titles), one sans for the apparatus (masthead, byline, contents, tables, citation numerals, source
   meta, colophon), mono for code and the hash. Warm paper and ink; violet marks the page's own evidence (citations,
   source numbers, contents), blue the web. Two sections carry a heavier rule: the answer (ink) and the limitations
   (amber). Hairlines, no fills, no shadows. Nothing loads and nothing runs: no url(), no @import, no @font-face. */

:root {
  /* Paper and ink (light: Ivory reading). */
  --paper: #faf6ee;
  --paper-2: #f1eadd;
  --ink: #1f1b18;
  --ink-2: #4a433b;
  --muted: #6b6359;
  --rule: #e0d6c6;
  --rule-strong: #b3a690;
  --accent: #5f4489;
  --accent-line: #c6b6db;
  --link: #2b5197;
  --link-line: #b3c2df;
  --mark: #f0e1bf;
  --caution: #85550a;
  --caution-rule: #b07a1c;
  --ok: #2e6a3e;
  --gold: #a47c3b;
  --shade: rgba(31, 27, 24, 0.2);

  /* Faces: system stacks only. */
  --font-text: Charter, "Bitstream Charter", "Sitka Text", Cambria, "Iowan Old Style", "Noto Serif", "Liberation Serif", Georgia, serif;
  --font-ui: Seravek, "Avenir Next", "Segoe UI", Ubuntu, Cantarell, "Noto Sans", "Liberation Sans", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, "Cascadia Mono", Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace;

  /* Type: one ratio (1.25), five sizes. */
  --text-base: 1.09375rem;
  --text-sm: calc(var(--text-base) * 0.8);
  --text-md: calc(var(--text-base) * 1.25);
  --text-lg: calc(var(--text-base) * 1.5625);
  --text-xl: calc(var(--text-base) * 1.953125);

  /* Space: a 4-pt scale. */
  --space-3xs: 0.125rem;
  --space-2xs: 0.25rem;
  --space-xs: 0.5rem;
  --space-sm: 0.75rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2.5rem;
  --space-2xl: 4rem;
  --space-3xl: 6rem;

  /* Composition: the reading column; on wide screens a contents rail on the left and a bleed for wide tables. */
  --measure: calc(var(--text-base) * 30);
  --gutter: 1rem;
  --rail: 13rem;
  --rail-gap: 3rem;
}

* { box-sizing: border-box; }
html { background: var(--paper); color: var(--ink); -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body {
  max-width: calc(var(--measure) + 2 * var(--gutter));
  margin: 0 auto;
  padding: var(--space-xl) var(--gutter) var(--space-2xl);
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-text);
  font-size: var(--text-base);
  line-height: 1.6;
  font-kerning: normal;
  font-variant-numeric: oldstyle-nums proportional-nums;
  overflow-wrap: break-word;
}
main { display: block; }

/* ---- Masthead, title, byline ------------------------------------------------------------------------------------- */
.title-block .eyebrow {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  padding: 0 0 var(--space-sm);
  border-bottom: 3px double var(--ink);
  color: var(--muted);
  font: 700 var(--text-sm)/1.2 var(--font-ui);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.title-block .eyebrow::before {
  content: "S";
  content: "S" / "";
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 1.9em;
  height: 1.9em;
  border: 1px solid var(--rule-strong);
  border-radius: 50%;
  color: var(--gold);
  font: 400 1.25em/1 var(--font-text);
  letter-spacing: 0;
  text-transform: none;
}
.title-block h1 {
  max-width: 20em;
  margin: var(--space-xl) 0 0;
  font-family: var(--font-text);
  font-size: var(--text-xl);
  font-weight: 400;
  line-height: 1.08;
  letter-spacing: -0.015em;
  text-wrap: balance;
  overflow-wrap: anywhere;
}
.byline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-xl);
  margin: var(--space-lg) 0 0;
  padding: var(--space-sm) 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  font: 400 var(--text-sm)/1.4 var(--font-ui);
  font-variant-numeric: lining-nums tabular-nums;
}
.byline { max-width: var(--measure); }
.byline > div { min-width: 0; }
.byline dt { color: var(--muted); }
.byline dd { margin: 0; color: var(--ink); }

/* The standfirst: what the report says before its first section (the question and the scope). */
.lead { margin: var(--space-xl) 0 0; }
.lead > p:first-child { color: var(--ink-2); }
main:not(:has(> section[data-report-role="summary"])) > .lead > p:first-child { color: var(--ink); font-size: var(--text-md); line-height: 1.45; }
.lead > :last-child { margin-bottom: 0; }

/* ---- Sections ---------------------------------------------------------------------------------------------------- */
section, .lead { display: flow-root; }
h1, h2, h3, h4, h5, h6 { color: var(--ink); font-family: var(--font-text); text-wrap: balance; overflow-wrap: break-word; }
section > h2 {
  margin: var(--space-2xl) 0 var(--space-sm);
  padding-top: var(--space-md);
  border-top: 1px solid var(--rule-strong);
  font-size: var(--text-lg);
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.01em;
}
h3 { margin: var(--space-xl) 0 var(--space-xs); font-size: var(--text-md); font-weight: 700; line-height: 1.25; }
h4, h5, h6 { margin: var(--space-lg) 0 var(--space-2xs); font-size: var(--text-base); font-weight: 700; line-height: 1.35; }
h2 + h3 { margin-top: var(--space-md); }
p { margin: 0 0 var(--space-md); text-wrap: pretty; }
strong { font-weight: 700; }
hr { height: 0; margin: var(--space-xl) 0; border: 0; text-align: center; }
hr::before { content: "·  ·  ·"; color: var(--rule-strong); font-family: var(--font-ui); white-space: pre; }
section > hr:last-child { display: none; }

/* The answer: a 2px ink rule, its heading as a small label, its first paragraph one step up, its list the key findings. */
section[data-report-role="summary"] > h2 {
  margin-top: var(--space-xl);
  padding-top: var(--space-sm);
  border-top: 2px solid var(--ink);
  color: var(--ink-2);
  font: 700 var(--text-sm)/1.3 var(--font-ui);
  letter-spacing: 0;
}
section[data-report-role="summary"] > h2 + p { font-size: var(--text-md); line-height: 1.45; }
section[data-report-role="summary"] > ul { padding: 0; list-style: none; border-top: 1px solid var(--rule); }
section[data-report-role="summary"] > ul > li { margin: 0; padding: var(--space-xs) 0 var(--space-xs) 1.5em; border-bottom: 1px solid var(--rule); list-style: none; }
section[data-report-role="summary"] > ul > li::before { content: "–"; display: inline-block; width: 1.5em; margin-left: -1.5em; color: var(--muted); }
section[data-report-role="summary"] > ul > li:is(.d1, .d2, .d3) { margin-left: 0; padding-left: 3em; }
section[data-report-role="summary"] > ul > li:is(.d1, .d2, .d3)::before { content: "·"; }

/* The limitations: a 2px amber rule and amber markers, so a reader finds the caveats without a banner. */
section[data-report-role="limitations"] > h2 { border-top: 2px solid var(--caution-rule); }
section[data-report-role="limitations"] > ul > li::marker { color: var(--caution); }
section[data-report-role="limitations"] > .aside { color: var(--muted); font: 400 var(--text-sm)/1.5 var(--font-ui); }

/* ---- Contents ---------------------------------------------------------------------------------------------------- */
.toc { position: relative; margin: var(--space-2xl) 0 0; font: 400 var(--text-sm)/1.35 var(--font-ui); font-variant-numeric: lining-nums tabular-nums; }
.toc > h2 { margin: 0; padding: 0 0 var(--space-xs); color: var(--ink); font: 700 var(--text-sm)/1.3 var(--font-ui); }
.toc-key { position: absolute; top: 0; right: 0; margin: 0; color: var(--muted); }
.toc ol { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--ink); }
.toc li { display: flex; align-items: baseline; gap: var(--space-md); margin: 0; padding: var(--space-xs) 0; border-bottom: 1px solid var(--rule); break-inside: avoid; }
.toc li a { flex: 1; color: var(--ink); text-decoration: none; }
.toc li a:hover { color: var(--accent); text-decoration: underline; text-decoration-color: var(--accent-line); }
.toc .n { color: var(--accent); font-weight: 700; }
.toc li.aux { border-bottom: 0; padding-bottom: 0; }
.toc li.aux + li.aux { padding-top: var(--space-2xs); }
.toc li.aux a { flex: none; color: var(--ink-2); text-decoration: underline; text-decoration-color: var(--rule-strong); text-underline-offset: 0.18em; }

/* ---- Lists ------------------------------------------------------------------------------------------------------- */
ul, ol { margin: 0 0 var(--space-md); padding-left: 1.5em; }
li { margin: 0 0 var(--space-2xs); padding-left: 0.15em; text-wrap: pretty; }
li::marker { color: var(--muted); font-family: var(--font-ui); font-variant-numeric: lining-nums tabular-nums; }
ul > li { list-style-type: "–  "; }
li.d1 { margin-left: 1.35em; }
li.d2 { margin-left: 2.7em; }
li.d3 { margin-left: 4.05em; }
/* Nesting is flattened into the parent's items: a nested item in an <ol> is a bullet and takes no number. */
:is(ul, ol) > li:is(.d1, .d2, .d3) { list-style-type: "·  "; counter-increment: list-item 0; }

/* ---- Quotes, code ------------------------------------------------------------------------------------------------ */
blockquote { margin: var(--space-lg) 0; padding: 0 0 0 var(--space-lg); border-left: 1px solid var(--rule-strong); color: var(--ink-2); }
blockquote > :last-child { margin-bottom: 0; }
code { padding: 0.05em 0.25em; border-radius: 2px; background: var(--paper-2); font-family: var(--font-mono); font-size: var(--text-sm); }
pre {
  margin: var(--space-lg) 0;
  padding: var(--space-sm) 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
pre code { padding: 0; background: none; font-size: inherit; }

/* ---- Tables: booktabs -------------------------------------------------------------------------------------------- */
figure.table {
  margin: var(--space-lg) 0;
  overflow-x: auto;
  background:
    linear-gradient(to right, var(--paper) 40%, transparent) left / 1.5rem 100% no-repeat local,
    linear-gradient(to left, var(--paper) 40%, transparent) right / 1.5rem 100% no-repeat local,
    radial-gradient(farthest-side at 0 50%, var(--shade), transparent) left / 0.6rem 100% no-repeat scroll,
    radial-gradient(farthest-side at 100% 50%, var(--shade), transparent) right / 0.6rem 100% no-repeat scroll;
}
figure.table:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
table {
  width: 100%;
  border-collapse: collapse;
  border-top: 1px solid var(--ink);
  border-bottom: 1px solid var(--ink);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  line-height: 1.4;
  font-variant-numeric: lining-nums tabular-nums;
}
thead { display: table-header-group; }
th, td { padding: var(--space-xs) var(--space-sm) var(--space-xs) 0; text-align: left; vertical-align: top; overflow-wrap: break-word; hyphens: manual; }
th:last-child, td:last-child { padding-right: 0; }
/* On screen a last column that holds a citation keeps room for its target (below), so the frame never scrolls for it. */
@media screen { figure.table:has(:is(th, td):last-child sup.cite) :is(th, td):last-child { padding-right: var(--space-sm); } }
th { border-bottom: 1px solid var(--ink); font-weight: 700; vertical-align: bottom; }
td { border-top: 1px solid var(--rule); }
tbody tr:first-child td { border-top: 0; }
tbody td:first-child { color: var(--ink); font-weight: 700; }
.al-left { text-align: left; }
.al-center { text-align: center; }
.al-right { text-align: right; }
th.al-center, td.al-center { padding-left: var(--space-xs); padding-right: var(--space-xs); }

/* ---- Links and citations ----------------------------------------------------------------------------------------- */
a { color: var(--accent); text-decoration: underline; text-decoration-color: var(--accent-line); text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
a[href^="http"], a[href^="mailto"] { color: var(--link); text-decoration-color: var(--link-line); }
a:hover { text-decoration-color: currentColor; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
[id] { scroll-margin-top: var(--space-lg); }

sup.cite {
  position: relative;
  top: -0.45em;
  vertical-align: baseline;
  margin-left: 0.06em;
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 700;
  line-height: 0;
  font-variant-numeric: lining-nums tabular-nums;
}
sup.cite a { position: relative; white-space: nowrap; color: var(--accent); text-decoration: none; }
/* A 24px square centred on each numeral takes its press (WCAG 2.5.8), without moving the line. */
sup.cite a::after { content: ""; position: absolute; top: 50%; left: 50%; width: 1.5rem; height: 1.5rem; margin: -0.75rem 0 0 -0.75rem; }
sup.cite a:hover { text-decoration: underline; }
sup.cite a.weak { font-weight: 400; text-decoration: underline dotted; text-decoration-thickness: 1.5px; text-underline-offset: 0.2em; }
/* In a group a comma and the space after it take 24px less one digit or more, so numerals stand 24px apart and no square
   covers its neighbour's. The space is a margin, not a box: a box would let a line break before the comma. */
sup.cite .sep { color: var(--muted); font-weight: 400; margin-right: calc(1.5rem - 1ch); }
sup.cite a:target { background: var(--mark); box-shadow: 0 0 0 0.2em var(--mark); border-radius: 2px; }
.omitted { color: var(--muted); font-style: italic; }

/* ---- Sources: a typeset bibliography with its evidence ----------------------------------------------------------- */
.src-summary { color: var(--ink-2); }
.sources ol { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--rule); }
.sources ol > li {
  display: grid;
  grid-template-columns: 2.25em minmax(0, 1fr);
  margin: 0;
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--rule);
  line-height: 1.4;
}
.sources ol > li:target { background: var(--mark); box-shadow: 0.5em 0 0 var(--mark), -0.5em 0 0 var(--mark); }
.sources .back { grid-row: 1 / span 4; color: var(--accent); font: 700 var(--text-sm)/1.65 var(--font-ui); font-variant-numeric: lining-nums tabular-nums; text-decoration: none; }
.sources .back:hover { text-decoration: underline; }
.src-title, .src-meta, .sources .url, .src-notes { grid-column: 2; }
.src-meta { margin-top: var(--space-3xs); color: var(--ink-2); font: 400 var(--text-sm)/1.5 var(--font-ui); font-variant-numeric: lining-nums; }
.src-meta a { color: var(--ink-2); text-decoration-color: var(--rule-strong); }
.src-meta .status { color: var(--ink); font-weight: 700; }
.src-meta .status.weak { color: var(--caution); }
.sources .url {
  display: block;
  margin-top: var(--space-3xs);
  color: var(--muted);
  font: 400 var(--text-sm)/1.45 var(--font-ui);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.sources .url .host { color: var(--ink); }
.sources .url:hover { color: var(--link); text-decoration: underline; }
.src-notes { margin: var(--space-2xs) 0 0; padding: 0; list-style: none; color: var(--ink-2); font: italic 400 var(--text-sm)/1.45 var(--font-text); }
.src-notes li { margin: 0; padding: 0; list-style: none; }
/* html-report-v1 markup (title, <br>, address; no number element): the list numbers itself. */
.sources ol:not(:has(.back)) { padding-left: 2.25em; list-style: decimal; }
.sources ol:not(:has(.back)) > li { display: list-item; }
.sources ol:not(:has(.back)) > li::marker { color: var(--accent); font: 700 var(--text-sm) var(--font-ui); }

/* ---- How this report was made ------------------------------------------------------------------------------------ */
.checks { margin: 0; padding: 0; list-style: none; }
.checks > li { margin: 0 0 var(--space-xs); padding-left: 1.75em; list-style: none; }
.checks > li::before { display: inline-block; width: 1.75em; margin-left: -1.75em; font-weight: 700; }
.checks > li.ok::before { content: "✓"; color: var(--ok); }
.checks > li.warn::before { content: "!"; color: var(--caution); }
.checks > li.note::before { content: "–"; color: var(--muted); font-weight: 400; }

/* ---- Colophon ---------------------------------------------------------------------------------------------------- */
.provenance {
  margin: var(--space-2xl) 0 0;
  padding-top: var(--space-xs);
  border-top: 3px double var(--ink);
  color: var(--muted);
  font: 400 var(--text-sm)/1.5 var(--font-ui);
  font-variant-numeric: lining-nums tabular-nums;
}
.provenance p { margin: 0; }
.provenance span { white-space: nowrap; }
.provenance .hash { font-family: var(--font-mono); }

/* ---- Phones ------------------------------------------------------------------------------------------------------ */
@media screen and (max-width: 47.99rem) {
  /* The answer inside the first screen: the title block is tighter on a phone. */
  body { padding-top: var(--space-lg); hyphens: auto; }
  .title-block h1 { margin-top: var(--space-lg); }
  .byline { margin-top: var(--space-md); column-gap: var(--space-lg); }
  .lead { margin-top: var(--space-lg); }
  section[data-report-role="summary"] > h2 { margin-top: var(--space-lg); }
  /* A wide comparison keeps readable columns and scrolls inside its frame; its row label stays in view. */
  figure.table:has(th:nth-child(5)) table { min-width: 36rem; }
  figure.table:has(th:nth-child(6)) table { min-width: 42rem; }
  figure.table:has(th:nth-child(8)) table { min-width: 52rem; }
  figure.table:has(th:nth-child(5)) :is(th, td):first-child { position: sticky; left: 0; z-index: 1; min-width: 7.5em; background: var(--paper); box-shadow: 1px 0 0 var(--rule); }
}

/* ---- Tablets and laptops: one centred column; a wide table may take the margins ---------------------------------- */
@media screen and (min-width: 48rem) {
  :root {
    --text-base: 1.1875rem;
    --text-xl: calc(var(--text-base) * 2.44140625);
    --gutter: 2.5rem;
  }
  body { padding-top: var(--space-2xl); padding-bottom: var(--space-3xl); }
  p { margin-bottom: var(--space-lg); }
  .toc ol { columns: 2; column-gap: var(--space-xl); }
  .toc li.aux { column-span: none; }
  figure.table:has(th:nth-child(5)) { margin-inline: calc(-1 * clamp(0rem, (100vw - 100%) / 2 - var(--gutter) - 1rem, 8rem)); }
}

/* ---- Wide screens: a sticky contents rail on the left, the bleed for wide tables on the right --------------------- */
@media screen and (min-width: 76rem) {
  body:has(> main > nav.toc) {
    max-width: calc(2 * var(--rail) + 2 * var(--rail-gap) + var(--measure) + 2 * var(--gutter));
  }
  body:has(> main > nav.toc) > .title-block { padding-left: calc(var(--rail) + var(--rail-gap)); }
  body:has(> main > nav.toc) > .title-block .eyebrow { margin-left: calc(-1 * (var(--rail) + var(--rail-gap))); }
  main:has(> nav.toc) {
    display: grid;
    grid-template-columns: [rail] var(--rail) var(--rail-gap) [text] minmax(0, var(--measure)) var(--rail-gap) var(--rail);
    align-items: start;
  }
  main:has(> nav.toc) > * { grid-column: text; }
  main:has(> nav.toc) > nav.toc {
    grid-column: rail;
    grid-row: 1 / span 1000;
    position: sticky;
    top: var(--space-lg);
    max-height: calc(100vh - 2 * var(--space-lg));
    overflow-y: auto;
    margin: var(--space-xl) 0 0;
  }
  main:has(> nav.toc) > nav.toc ol { columns: 1; }
  main:has(> nav.toc) figure.table:has(th:nth-child(5)) { margin-left: 0; margin-right: calc(-1 * (var(--rail-gap) + var(--rail))); }
}

/* ---- Dark (screen only): Studio's room ----------------------------------------------------------------------------- */
@media screen and (prefers-color-scheme: dark) {
  :root {
    --paper: #0f0e14;
    --paper-2: #1b1923;
    --ink: #ecebf1;
    --ink-2: #c3bfcf;
    --muted: #9b96aa;
    --rule: #2a2733;
    --rule-strong: #4a4559;
    --accent: #b9a8ff;
    --accent-line: #5a4d8f;
    --link: #8fb2ff;
    --link-line: #3d4f7a;
    --mark: #2d2545;
    --caution: #efbf86;
    --caution-rule: #c98f35;
    --ok: #7fd09a;
    --gold: #efbf86;
    --shade: rgba(0, 0, 0, 0.6);
  }
  .title-block .eyebrow, .provenance, table, th, .toc ol, section[data-report-role="summary"] > h2 { border-color: var(--ink-2); }
}

/* ---- Print: A4, light always, a centred 122 mm text block, wide tables use the full width ------------------------ */
@page {
  size: A4;
  margin: 18mm 20mm 20mm;
  @top-left { content: "Sophia · Research report"; color: #6b6359; font: 400 8pt "Liberation Sans", Arial, sans-serif; }
  @bottom-right { content: counter(page) " / " counter(pages); color: #6b6359; font: 400 8pt "Liberation Sans", Arial, sans-serif; }
}
@page :first { @top-left { content: none; } }
@page wide { size: A4 landscape; }
@media print {
  :root { --text-base: 10.5pt; --measure: 112mm; --gutter: 0mm; --bleed: 29mm; }
  html, body { background: none; }
  body { max-width: var(--measure); padding: 0; line-height: 1.45; orphans: 3; widows: 3; }
  p { margin-bottom: 0.6em; }
  .title-block .eyebrow, .provenance { margin-inline: calc(-1 * var(--bleed)); border-width: 3pt; }
  .title-block h1 { margin-top: 9mm; }
  .lead { margin-top: 7mm; }
  section > h2 { margin-top: 7mm; break-after: avoid; }
  h3, h4, h5, h6 { break-after: avoid; }
  pre, blockquote, tr, .sources ol > li, .checks > li, .byline { break-inside: avoid; }
  .byline { column-gap: 6mm; }
  .toc { margin-top: 8mm; }
  .toc ol { columns: 2; column-gap: 8mm; }
  .toc li.aux { display: none; }
  figure.table { overflow: visible; background: none; }
  figure.table:has(th:nth-child(5)) { margin-inline: calc(-1 * var(--bleed)); }
  /* Seven columns or more: smaller type. Eight or more: the table gets a landscape page of its own. Either way a cell
     may break inside a word rather than let the table pass the page and be cut. */
  figure.table:has(th:nth-child(7)) table { font-size: 7.5pt; }
  figure.table:has(th:nth-child(7)) :is(th, td) { padding-right: 2mm; }
  figure.table:has(th:nth-child(7)) td { min-width: 4.5em; overflow-wrap: anywhere; }
  figure.table:has(th:nth-child(7)) code { font-size: inherit; }
  figure.table:has(th:nth-child(8)) { page: wide; width: 257mm; margin-inline: calc((var(--measure) - 257mm) / 2); }
  a { color: var(--ink); text-decoration-color: var(--rule-strong); }
  sup.cite a, .sources .back, .toc .n { color: var(--accent); }
  :is(section, .lead) a[href^="http"]:not(.url)::after { content: " (" attr(href) ")"; color: var(--muted); font: var(--text-sm) var(--font-ui); overflow-wrap: anywhere; }
  sup.cite a::after { content: none; }
  sup.cite .sep { margin-right: 0.04em; }
}
`
