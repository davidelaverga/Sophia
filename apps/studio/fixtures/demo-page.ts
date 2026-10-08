// The demo's designed readout (`?demo=1`): the HTML page Sophia's designer would publish beside the Markdown, as a
// version's `html` rendition. Static: inline CSS and SVG charts, no script (the viewer's frame allows none). Every
// number is invented, and the same as the Markdown's.

export const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"

export const STYLE = `
:root{--ink:#1d1b22;--soft:#5d5966;--line:#e4dfd6;--paper:#fbf8f3;--card:#fff;--accent:#6d5bd0;--accent-2:#b4a6f0;--warm:#c8794a;--good:#2f8f6b;--bad:#b4525c}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 "Segoe UI",system-ui,-apple-system,sans-serif}
main{max-width:780px;margin:0 auto;padding:36px 28px 56px}
.eyebrow{font:600 11px/1 ui-monospace,"Cascadia Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}
h1{font:600 31px/1.18 Georgia,"Times New Roman",serif;margin:10px 0 12px;letter-spacing:-.01em}
h2{font:600 21px/1.25 Georgia,serif;margin:40px 0 6px}
.lede{font:18px/1.5 Georgia,serif;color:#34303b;margin:0 0 6px}
.meta{color:var(--soft);font-size:13px;margin:0 0 26px}
.answer{border-left:3px solid var(--accent);background:#f3f0fb;padding:14px 18px;border-radius:0 10px 10px 0;margin:0 0 26px}
.answer b{color:var(--accent)}
.kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 8px}
@media (min-width:760px){.kpis{grid-template-columns:repeat(4,minmax(0,1fr))}}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.kpi .n{font:600 30px/1.1 Georgia,serif}
.kpi .l{color:var(--soft);font-size:13px;margin-top:4px}
.kpi .d{font-size:12.5px;margin-top:8px;font-weight:600}
.up{color:var(--good)}.down{color:var(--good)}
.figure{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 18px 10px;margin:16px 0 6px}
.figure h3{font-size:14px;margin:0 0 2px}
.figure p.cap{color:var(--soft);font-size:12.5px;margin:0 0 10px}
svg{display:block;width:100%;height:auto}
svg text{font-family:"Segoe UI",system-ui,sans-serif}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:14px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.card .big{font:600 26px/1 Georgia,serif;color:var(--accent)}
.card h4{margin:10px 0 4px;font-size:14.5px}
.card p{margin:0;color:var(--soft);font-size:13.5px}
.timeline{list-style:none;padding:0;margin:14px 0;border-left:2px solid var(--line)}
.timeline li{position:relative;padding:0 0 14px 20px}
.timeline li::before{content:"";position:absolute;left:-7px;top:5px;width:12px;height:12px;border-radius:50%;background:var(--paper);border:2px solid var(--warm)}
.timeline b{display:block;font-size:13px;color:var(--warm)}
table{width:100%;border-collapse:collapse;font-size:14px;margin:12px 0}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line)}
th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--soft)}
td.n{font-variant-numeric:tabular-nums;text-align:right}
ol.recs{padding:0;margin:14px 0;list-style:none;counter-reset:r}
ol.recs li{counter-increment:r;position:relative;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px 14px 56px;margin-bottom:10px}
ol.recs li::before{content:counter(r);position:absolute;left:16px;top:13px;width:26px;height:26px;border-radius:8px;background:var(--accent);color:#fff;font-weight:600;display:grid;place-items:center;font-size:13px}
ol.recs .why{display:block;color:var(--soft);font-size:13px;margin-top:3px}
.tag{display:inline-block;font-size:11px;font-weight:600;border-radius:6px;padding:2px 7px;margin-left:6px;background:#eef7f2;color:var(--good)}
.sources{font-size:13px;color:var(--soft);padding-left:18px}
.cite{font-size:11px;vertical-align:super;margin-left:2px;color:var(--accent);text-decoration:none}
.foot{margin-top:34px;padding-top:14px;border-top:1px solid var(--line);font-size:12.5px;color:var(--soft)}
.new{display:inline-block;font:600 10.5px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--warm);border-radius:5px;padding:4px 6px;margin-left:8px;vertical-align:middle}
`

/** Active teams by week: 14, 14, 12, 12, the drop marked at week three. */
const ACTIVE = `<div class="figure"><h3>Active teams, week by week</h3><p class="cap">14 teams started on Sep 1. Both drops came in week 3, after an admin change.</p>
<svg viewBox="0 0 640 230" role="img" aria-label="Active teams by week: 14, 14, 12, 12">
<line x1="40" y1="190" x2="620" y2="190" stroke="#e4dfd6"/><line x1="40" y1="110" x2="620" y2="110" stroke="#f0ece4" stroke-dasharray="3 4"/><line x1="40" y1="30" x2="620" y2="30" stroke="#f0ece4" stroke-dasharray="3 4"/>
<text x="32" y="194" font-size="11" fill="#8a8592" text-anchor="end">0</text><text x="32" y="114" font-size="11" fill="#8a8592" text-anchor="end">7</text><text x="32" y="34" font-size="11" fill="#8a8592" text-anchor="end">14</text>
<rect x="75" y="30" width="80" height="160" rx="6" fill="#6d5bd0"/><rect x="215" y="30" width="80" height="160" rx="6" fill="#6d5bd0"/><rect x="355" y="53" width="80" height="137" rx="6" fill="#b4a6f0"/><rect x="495" y="53" width="80" height="137" rx="6" fill="#b4a6f0"/>
<text x="115" y="22" font-size="14" font-weight="600" text-anchor="middle" fill="#1d1b22">14</text><text x="255" y="22" font-size="14" font-weight="600" text-anchor="middle" fill="#1d1b22">14</text><text x="395" y="45" font-size="14" font-weight="600" text-anchor="middle" fill="#1d1b22">12</text><text x="535" y="45" font-size="14" font-weight="600" text-anchor="middle" fill="#1d1b22">12</text>
<text x="115" y="210" font-size="12" text-anchor="middle" fill="#5d5966">Week 1</text><text x="255" y="210" font-size="12" text-anchor="middle" fill="#5d5966">Week 2</text><text x="395" y="210" font-size="12" text-anchor="middle" fill="#5d5966">Week 3</text><text x="535" y="210" font-size="12" text-anchor="middle" fill="#5d5966">Week 4</text>
<text x="425" y="45" font-size="12" font-weight="600" fill="#c8794a">−2</text>
</svg></div>`

/** Days to a first shared report, pilot against the previous onboarding. */
const DAYS = `<div class="figure"><h3>Days to a first shared report</h3><p class="cap">Median per team. Lower is better.</p>
<svg viewBox="0 0 640 120" role="img" aria-label="Pilot 2.4 days; previous onboarding 6.1 days">
<text x="0" y="38" font-size="13" fill="#1d1b22" font-weight="600">Pilot</text><rect x="150" y="22" width="${String(Math.round(2.4 * 70))}" height="24" rx="5" fill="#6d5bd0"/><text x="${String(158 + Math.round(2.4 * 70))}" y="39" font-size="13" font-weight="600" fill="#6d5bd0">2.4 days</text>
<text x="0" y="88" font-size="13" fill="#5d5966">Previous onboarding</text><rect x="150" y="72" width="${String(Math.round(6.1 * 70))}" height="24" rx="5" fill="#d8d2c6"/><text x="${String(158 + Math.round(6.1 * 70))}" y="89" font-size="13" fill="#5d5966">6.1</text>
</svg></div>`

/** Week-four sessions by when a team first shared a report. */
const SESSIONS = `<div class="figure"><h3>Sessions in week 4, by when a team first shared a report</h3><p class="cap">Teams that shared in their first week used the Studio about three times as much a month in.</p>
<svg viewBox="0 0 640 150" role="img" aria-label="Shared in week 1: 21 sessions; week 2: 9; later: 7">
<text x="0" y="34" font-size="13" fill="#1d1b22">Shared in week 1 · 7 teams</text><rect x="210" y="20" width="${String(21 * 18)}" height="22" rx="5" fill="#6d5bd0"/><text x="${String(218 + 21 * 18)}" y="36" font-size="13" font-weight="600" fill="#6d5bd0">21</text>
<text x="0" y="78" font-size="13" fill="#1d1b22">Shared in week 2 · 3 teams</text><rect x="210" y="64" width="${String(9 * 18)}" height="22" rx="5" fill="#b4a6f0"/><text x="${String(218 + 9 * 18)}" y="80" font-size="13" fill="#5d5966">9</text>
<text x="0" y="122" font-size="13" fill="#1d1b22">Later · 2 teams</text><rect x="210" y="108" width="${String(7 * 18)}" height="22" rx="5" fill="#d8d2c6"/><text x="${String(218 + 7 * 18)}" y="124" font-size="13" fill="#5d5966">7</text>
</svg></div>`

/** The two regions, side by side (version 2). */
const REGIONS = `<div class="figure"><h3>The two regions</h3><p class="cap">Active after four weeks, and days to a first shared report.</p>
<svg viewBox="0 0 640 170" role="img" aria-label="First region: 7 of 9 active, 2.5 days. Second region: 5 of 5 active, 2.2 days">
<text x="0" y="22" font-size="12" fill="#5d5966">ACTIVE AFTER FOUR WEEKS</text>
<text x="0" y="52" font-size="13" fill="#1d1b22">First region · 9 teams</text><rect x="200" y="38" width="380" height="20" rx="5" fill="#eeeae2"/><rect x="200" y="38" width="${String(Math.round((7 / 9) * 380))}" height="20" rx="5" fill="#6d5bd0"/><text x="590" y="53" font-size="13" font-weight="600" fill="#1d1b22">78%</text>
<text x="0" y="84" font-size="13" fill="#1d1b22">Second region · 5 teams</text><rect x="200" y="70" width="380" height="20" rx="5" fill="#6d5bd0"/><text x="590" y="85" font-size="13" font-weight="600" fill="#1d1b22">100%</text>
<text x="0" y="122" font-size="12" fill="#5d5966">DAYS TO A FIRST SHARED REPORT</text>
<text x="0" y="150" font-size="13" fill="#1d1b22">First 2.5 · Second 2.2</text><rect x="200" y="137" width="${String(Math.round(2.5 * 60))}" height="16" rx="4" fill="#b4a6f0"/><rect x="${String(206 + Math.round(2.5 * 60))}" y="137" width="${String(Math.round(2.2 * 60))}" height="16" rx="4" fill="#6d5bd0"/>
</svg></div>`

/** The four figures the readout opens on. */
const KPIS = `<section class="kpis">
<div class="kpi"><div class="n">86%</div><div class="l">active after four weeks</div><div class="d up">▲ 15 pts vs. 71%</div></div>
<div class="kpi"><div class="n">2.4 d</div><div class="l">to a first shared report</div><div class="d down">▼ from 6.1 days</div></div>
<div class="kpi"><div class="n">1.3</div><div class="l">setup tickets per team</div><div class="d down">▼ from 3.8</div></div>
<div class="kpi"><div class="n">11/14</div><div class="l">teams answered the week-3 survey</div><div class="d" style="color:#5d5966">79% response</div></div>
</section>`

/** What Sophia recommends, the second region's additions with version 2. */
function recommendations(second: boolean): string {
  return `<h2>Recommendations</h2>
<ol class="recs">
<li><b>Ship the shorter checklist to every new team${second ? ', translated for the second region' : ''}.</b><span class="why">All nine teams that finished it in the first session stayed.</span></li>
<li><b>Ask for a named owner at signup${second ? ', and hand the role over when an admin changes' : ''}.</b><span class="why">Both teams that left lost theirs in week three.</span></li>
<li><b>Answer setup tickets inside one working day during a team’s first month.</b><span class="why">The two teams that left waited more than two.</span></li>
${second ? '<li><b>Keep the checklist in a document a new admin can be handed.</b><span class="why">Two second-region tickets asked for exactly that.</span><span class="tag">New</span></li>' : ''}
</ol>`
}

function body(version: 1 | 2): string {
  const second = version === 2
  return `<main>
<div class="eyebrow">Onboarding pilot · Readout · v${String(version)}</div>
<h1>Pilot readout: what kept 12 of 14 teams</h1>
<p class="lede">Twelve of the fourteen teams were still active after four weeks. The two that left did so in week three, both right after their admin changed.</p>
<p class="meta">Researched by Sophia from four of the project’s records · Sep 1–28 · ${second ? 'revised with the second region' : 'first version'}</p>
<div class="answer"><b>In one line:</b> the shorter checklist is the change most tied to teams that stayed. Keep it, and make the setup owner part of signup.</div>
${KPIS}
<h2>What we measured</h2>
<p>Fourteen customer teams took the new onboarding between September 1 and 28, nine in the first region and five in the second. We read the week-3 survey, every support ticket the pilot raised, the notes from each first session and the activation dashboard.</p>
${ACTIVE}
${DAYS}
<h2>What kept teams</h2>
<div class="cards">
<div class="card"><div class="big">9 of 9</div><h4>The shorter checklist</h4><p>Every team that finished its five steps in the first session was still active in week four.<a class="cite" href="#source-4">4</a></p></div>
<div class="card"><div class="big">12 of 12</div><h4>A named owner</h4><p>Every team that stayed had one person who answered setup questions inside a day.<a class="cite" href="#source-3">3</a></p></div>
<div class="card"><div class="big">3×</div><h4>A first report early</h4><p>Teams that shared a report in their first week had three times the sessions of the rest in week four.<a class="cite" href="#source-4">4</a></p></div>
</div>
${SESSIONS}
<h2>Why two teams left</h2>
<ul class="timeline">
<li><b>Week 3, day 1</b>Both teams changed their admin.</li>
<li><b>Week 3, days 1–2</b>The new admins never saw the setup checklist; their first tickets asked how to invite people.</li>
<li><b>Week 3, days 2–4</b>Those tickets waited more than two working days for an answer.</li>
<li><b>Week 4</b>Neither team opened the Studio again.</li>
</ul>
${
  second
    ? `<h2>The second region <span class="new">New in v2</span></h2>
<p>The five teams in the second region set up in their own language with a translated checklist. All five stayed, and their days to a first shared report matched the first region’s. Two of their tickets asked for the checklist in a document they could hand on.</p>
${REGIONS}`
    : ''
}
<h2>Previous onboarding and the pilot</h2>
<table><thead><tr><th>Measure</th><th style="text-align:right">Pilot</th><th style="text-align:right">Previous</th></tr></thead><tbody>
<tr><td>Active after four weeks</td><td class="n">12 of 14 (86%)</td><td class="n">71%</td></tr>
<tr><td>Days to a first shared report</td><td class="n">2.4</td><td class="n">6.1</td></tr>
<tr><td>Setup tickets per team</td><td class="n">1.3</td><td class="n">3.8</td></tr>
<tr><td>First answer to a setup ticket</td><td class="n">5 h</td><td class="n">19 h</td></tr>
</tbody></table>
${recommendations(second)}
<h2>Sources</h2>
<ol class="sources">
<li id="source-1">Week-3 pilot survey · 11 of 14 teams answered</li>
<li id="source-2">Support tickets raised in the pilot · Sep 1–28</li>
<li id="source-3">Onboarding call notes · 14 first sessions</li>
<li id="source-4">Activation dashboard · September snapshot</li>
</ol>
<p class="foot">Made by Sophia for the Onboarding pilot · its numbers come from the four records above, each read in full · version ${String(version)}${second ? ' adds the second region and revises the recommendations' : ''}.</p>
</main>`
}

/** Version `n`'s designed page, whole. */
export function demoPage(version: 1 | 2): string {
  return `${[
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Pilot readout: what kept 12 of 14 teams</title>',
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    body(version),
    '</body>',
    '</html>',
  ].join('\n')}\n`
}

/** Each page's SHA-256 (the viewer shows nothing that does not match it). */
export const DEMO_PAGE_SHA = {
  v1: '130653012f45246487672aa971e38f965c6e1830ef5600f26953d1067d0a717d',
  v2: '8f0f5f731838f1e898c95a645c44e12a96c0159ac2f088e33df8c2d89f109a60',
}
