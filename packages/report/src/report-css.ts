// The pdf-report-v1 stylesheet (SMC-M03 S5b, plan §2.7), inlined into every report the template prints. Adapted from
// the donor's pdf-report skill asset (davidelaverga/Sophia-Agent@d467ab97, skills/public/pdf-report/assets/report.css,
// MIT): the page margins and the page-number footer stay the kernel's, so there is no @page margin here. Kept: the
// type scale, headings, contents, tables, code and quotes. Dropped: the full-page cover, stat bands and columns, which
// a report written as Markdown never uses. Added: citations, list depth, sources and the compact layout, the format
// repair that gives wide tables and code more room.
export const REPORT_CSS = `
:root {
  --ink: #14181f;
  --ink-soft: #424a57;
  --rule: #d7dce4;
  --accent: #2f6df6;
  --surface: #f5f7fb;
  --font-sans: "Noto Sans", "DejaVu Sans", "Helvetica Neue", Arial, "Liberation Sans", sans-serif;
  --font-serif: "Noto Serif", "DejaVu Serif", Georgia, "Times New Roman", serif;
  --font-mono: "Noto Sans Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: var(--font-serif); color: var(--ink); font-size: 10.5pt; line-height: 1.5; margin: 0; overflow-wrap: break-word; }

.title-block { margin: 0 0 8mm; padding: 0 0 4mm; border-bottom: 2px solid var(--accent); }
.title-block .eyebrow { font-family: var(--font-sans); font-size: 9pt; letter-spacing: 0.12em; padding-left: 0.12em; text-transform: uppercase; color: var(--ink-soft); margin: 0 0 2mm; }
.title-block h1 { font-family: var(--font-sans); font-size: 22pt; line-height: 1.15; margin: 0; }
.lead { margin: 0 0 6mm; }

h1, h2, h3, h4, h5, h6 { font-family: var(--font-sans); color: var(--ink); line-height: 1.25; }
h2 { font-size: 15pt; margin: 9mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 2px solid var(--accent); page-break-after: avoid; }
h3 { font-size: 12pt; margin: 6mm 0 2mm; color: var(--ink-soft); page-break-after: avoid; }
h4, h5, h6 { font-size: 10.5pt; margin: 4mm 0 1.5mm; page-break-after: avoid; }
p { margin: 0 0 3mm; }
a { color: var(--accent); text-decoration: none; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 5mm 0; }

.toc { margin: 0 0 8mm; page-break-after: always; }
.toc h2 { border: 0; margin-top: 0; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { padding: 1.2mm 0; border-bottom: 1px dotted var(--rule); font-family: var(--font-sans); font-size: 10pt; }

figure.table { margin: 4mm 0; }
table { width: 100%; border-collapse: collapse; font-family: var(--font-sans); font-size: 9pt; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
thead th { background: var(--surface); text-align: left; padding: 2mm 3mm; border-bottom: 2px solid var(--accent); }
td { padding: 2mm 3mm; border-bottom: 1px solid var(--rule); vertical-align: top; }
th, td { overflow-wrap: anywhere; }
tbody tr:nth-child(even) td { background: #fafbfe; }
.al-left { text-align: left; }
.al-center { text-align: center; }
.al-right { text-align: right; }

ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin: 0 0 1.5mm; }
li.d1 { margin-left: 6mm; }
li.d2 { margin-left: 12mm; }
li.d3 { margin-left: 18mm; }
blockquote { margin: 4mm 0; padding-left: 4mm; border-left: 3px solid var(--rule); color: var(--ink-soft); font-style: italic; }
code { font-family: var(--font-mono); font-size: 9pt; background: var(--surface); padding: 0.3mm 1mm; border-radius: 1mm; }
pre { font-family: var(--font-mono); font-size: 8.5pt; line-height: 1.4; background: var(--surface); border: 1px solid var(--rule); border-radius: 1.5mm; padding: 3mm; margin: 4mm 0; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; max-width: 100%; }
pre code { background: none; padding: 0; font-size: inherit; border-radius: 0; }

sup.cite { font-family: var(--font-sans); font-size: 7pt; line-height: 0; }
.sources ol { padding-left: 8mm; }
.sources li { font-size: 9.5pt; }
.sources .url { font-family: var(--font-mono); font-size: 8pt; color: var(--ink-soft); overflow-wrap: anywhere; }

body.compact { font-size: 9.5pt; }
body.compact table { font-size: 7.5pt; table-layout: fixed; }
body.compact thead th, body.compact td { padding: 1.2mm 1.5mm; }
body.compact pre { font-size: 7pt; }
body.compact code { font-size: 8pt; }
`
