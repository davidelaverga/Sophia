// Labelled fixture reports for html-report-v2's layout checks (e2e/report-page.spec.ts): each one a page input as
// Studio passes it (@sophia/report/page), with the provenance Studio already holds for a version and its sources.
// "kitchen" is a research report with every element the template prints (a section break inside a section and one
// closing it) and every kind of source; "stress" is what a page must survive (a 220-character title, a 12-column table
// of 40 rows, 50 adjacent citations, citations in headings, at a table's edges, beside its frozen column and facing
// each other across a column, a 300-character code line, long addresses, CJK and Arabic text). Vendors, figures and
// addresses are illustrative; nothing here is live, and the hashes are placeholders the page only prints.
import type { PageSource, ReportPageInput } from '@sophia/report/page'

/** A fixture source id. */
const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const cite = (n: number) => `[${id(n)}]`

/** Read of a source as Studio stores it: its kind, coverage, retrieval time and limitations. */
type Read = Pick<PageSource, 'kind' | 'coverage' | 'retrievedAt' | 'limitations'>
const read = (coverage: 'complete' | 'partial', retrievedAt: string, limitations: string[] = []): Read => ({
  kind: 'web_read',
  coverage,
  retrievedAt,
  limitations,
})

const KITCHEN = `# Managed PostgreSQL hosts for an EU-resident product

Which managed PostgreSQL host can keep a small team's customer data inside the EU, recover it to any minute of the last week, and stay under 400 USD a month at our current size. This report compares five hosts on residency, recovery, operations and cost, and recommends one with a fallback. The vendors and figures are illustrative: this is a design sample, not advice.

## Executive summary

**Harbor Cloud** is the best fit today: EU-only regions in Frankfurt and Paris, point-in-time recovery to the second for 14 days, and a quoted 310 USD a month for our footprint [${id(1)}]. **Northwind Data Platform** is the fallback: cheaper at 240 USD, but its recovery window is 7 days and its EU region is a single zone (${id(2)}; ${id(3)}).

- Residency is a contract question as much as a region question: only two hosts commit to EU-only processing for support access in writing [1](<${id(4)}>).
- Recovery windows differ more than prices do, from 3 days to 35.
- None of the five publishes an independent restore-time benchmark; restore times below are each vendor's own.

## Background and question

The team runs one production database of about 180 GB, growing roughly 6 GB a month, with peaks of 900 connections behind a pooler. Customers in Germany and Italy ask where their data lives and who can read it. The question was framed as three tests, in order of weight:

1. Data stays in the EU, including backups and support access.
2. Point-in-time recovery covers at least the last 7 days.
3. Total cost stays under 400 USD a month at today's size.

> A host that keeps the database in Frankfurt but ships its backups to a US bucket fails the first test, whatever its marketing says.

### How the evidence was gathered

Each host's public documentation, pricing page and data-processing agreement were read in full; where a page was a snippet only, it was not used for a claim. Prices were computed with each vendor's own calculator on 2 October 2026, for this configuration:

\`\`\`
instance: 4 vCPU, 16 GB RAM
storage:  250 GB SSD, autoscaling on
backups:  daily snapshot + WAL archive, 14-day retention
replicas: 1 read replica, same region
\`\`\`

## Findings

### Residency and access

Harbor Cloud and Calder DB state EU-only processing for primary data, backups and support access in their data-processing agreements [${id(1)}] [${id(5)}]. Northwind keeps backups in-region but reserves follow-the-sun support from outside the EU, with customer consent per incident [${id(3)}]. Ostrava Systems is EU-only but small; Lumen Managed Postgres replicates backups to a second region the customer cannot pin.

### Recovery

Every host offers point-in-time recovery, but the window and the granularity differ:

- **Harbor Cloud**: 14 days by default, extendable to 35, to the second.
  - Restores land in a new instance; the old one stays until deleted.
- **Northwind Data Platform**: 7 days, to the minute.
- **Calder DB**: 3 days on the plan we priced; 14 days costs 60% more.
  - *Not enough on its own:* it fails the second test at our price.
- **Ostrava Systems**: 10 days, restore by support ticket only.

#### Restore times the vendors quote

Restore times are vendor-reported for a 200 GB database and were not tested by us. Harbor quotes "under 20 minutes" and Northwind "about 45 minutes" [${id(2)}]; the others publish no figure. A restore drill on a copy should be the first task after the decision.

---

### Side by side

| Host | EU-only (data, backups, support) | PITR window | Restore granularity | Monthly cost (USD) | Notes |
|:-----|:-----:|:-----|:-----|-----:|:-----|
| Harbor Cloud | yes | 14 days (35 max) | second | 310 | DPA names EU-only support [${id(1)}] |
| Northwind Data Platform | partly | 7 days | minute | 240 | Single-zone EU region; support may be outside the EU |
| Calder DB | yes | 3 days | minute | 280 | 14 days costs 448 USD |
| Ostrava Systems | yes | 10 days | minute | 365 | Restores by ticket only |
| Lumen Managed Postgres | no | 7 days | second | 205 | Cross-region backup copy, not pinnable |

Prices include one read replica and 250 GB of storage; egress is excluded because the product serves almost all traffic in-region.

### Operations

| Capability | Harbor | Northwind | Calder |
|:--|:--:|:--:|:--:|
| Connection pooling | built in | built in | add-on |
| Major-version upgrades | in place | blue/green | dump and restore |
| Audit log export | \`pgaudit\` to S3-compatible storage | none | \`pgaudit\`, EU bucket only |

## Risks and limitations

This review read documentation and contracts, not the systems themselves. Three limits matter for the decision:

- Restore times are vendor claims; none was measured.
- Prices change often; the figures are from one day's calculators, before any negotiated discount.
- A small host can be acquired: Ostrava's terms allow the agreement to transfer to a buyer [${id(6)}].

A long reference copied from a pricing page shows how unbroken text behaves: https://pricing.harbor.example/calculator?region=eu-central-1&instance=pg-4x16&storage=250&replicas=1&backup_retention_days=14&currency=USD

---

## Recommendations

3. Choose Harbor Cloud on the 4 vCPU plan in Frankfurt, with Paris as the replica region.
4. Before migrating, run one restore drill on a copy and time it; if it takes over 45 minutes, revisit Northwind.
5. Ask Harbor to confirm in the order form that support access stays in the EU, as its DPA says [${id(1)}].

## Conclusion

Harbor Cloud passes all three tests with room in the budget; Northwind passes two and would need written support-access terms to pass the first. The decision is reversible within a quarter: both hosts export standard dumps and logical replication streams. See the [migration checklist](https://wiki.example.org/db/migration-checklist) for the steps after the decision, and ![a residency map](https://evil.example/map.png) for where the regions sit.
`

const KITCHEN_SOURCES: PageSource[] = [
  {
    id: id(1),
    title: 'Harbor Cloud: Data Processing Agreement, EU edition (rev. 2026-06)',
    url: 'https://legal.harbor.example/dpa/eu?version=2026-06&lang=en',
    ...read('complete', '2026-10-02T09:14:31.000Z'),
  },
  {
    id: id(2),
    title: 'Northwind Data Platform: backup and point-in-time recovery',
    url: 'https://docs.northwind.example/postgres/backups/point-in-time-recovery',
    ...read('complete', '2026-10-02T09:16:02.000Z'),
  },
  {
    id: id(3),
    title: 'Northwind support access and sub-processors',
    url: 'https://trust.northwind.example/subprocessors',
    ...read('partial', '2026-10-02T09:17:45.000Z', [
      'The extractor returned the first part of the page; the full sub-processor list sits behind a sign-in.',
    ]),
  },
  {
    // A cited search listing, as Sophia stores one: no address, titled by its query.
    id: id(4),
    title: 'Search: Calder DB EU-only support access',
    url: null,
    kind: 'search_results',
    coverage: 'complete',
    retrievedAt: '2026-10-02T09:12:10.000Z',
    limitations: [],
  },
  {
    id: id(5),
    title: 'Calder DB DPA',
    url: 'https://calder.example/legal/dpa',
    ...read('complete', '2026-10-02T09:19:58.000Z'),
  },
  {
    id: id(6),
    title: 'Ostrava Systems terms of service, section 14 (assignment) — uploaded PDF',
    url: null,
    kind: 'input',
    coverage: null,
    retrievedAt: null,
    limitations: [],
  },
]

/** A source of the stress report: a long title and an address, or one of the awkward ones a report meets. */
function stressSource(n: number): Pick<PageSource, 'id' | 'title' | 'url'> {
  const awkward: Record<number, [string | null, string | null]> = {
    2: ["Hilbert's problems (Wikipedia)", "https://en.wikipedia.org/wiki/Hilbert's_problems#Table_of_problems"],
    3: ['中文资料：数据驻留政策白皮书', 'https://例子.测试/路径/文件?查询=值'],
    4: [null, 'https://www.example.org/'],
    5: [
      'A source without an address, uploaded as a PDF — with a very long title that goes on and on to see how the ' +
        'bibliography wraps it',
      null,
    ],
    6: [
      'Very long URL',
      `https://pricing.harbor.example/calculator/${'segment-'.repeat(30)}end?region=eu-central-1&instance=pg-4x16` +
        `&storage=250&replicas=1&backup_retention_days=14&currency=USD&token=${'x'.repeat(120)}`,
    ],
    7: ['تقرير عربي عن سياسات البيانات', 'https://ar.example.org/تقرير'],
    8: [
      'O\'Reilly: "Designing Data-Intensive Applications" <2nd ed>',
      "https://www.oreilly.example/library/view/designing-data-intensive-applications/ch01.html#it's",
    ],
  }
  const [title, url] = awkward[n] ?? [
    `Source number ${n}: a fairly long publication title about managed databases & "residency" rules, part ${n}`,
    `https://docs.vendor${n % 7}.example/section/${n}/page?id=${n}&lang=en`,
  ]
  // Titled as Studio titles a source without one: by its host.
  return { id: id(n), title: title ?? (url ? new URL(url).host : 'A source from the project'), url }
}

/** What was read of stress source `n`, round the five ways a source can stand. */
function stressRead(n: number): Read & { url?: null } {
  const at = '2026-10-01T23:59:59.000Z'
  switch (n % 5) {
    case 1:
      return read('complete', at)
    case 2:
      return read('partial', at, n === 2 ? ['Behind a paywall after the first section.'] : [])
    case 3:
      return { kind: 'search_results', coverage: 'complete', retrievedAt: at, limitations: [], url: null }
    case 4:
      return { kind: 'input', coverage: null, retrievedAt: null, limitations: [] }
    default:
      return read('complete', at)
  }
}

const LONG_WORD = 'Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft'

/** Row `k` of a 12-column comparison: code, a long word, an address and a citation in some cells, alone in one. */
const stressRow = (k: number) =>
  `| Vendor ${k} with a long name | ${k === 4 ? cite(9) : k % 2 ? 'yes' : 'no'} | ` +
  `${k * 3} days | ${k % 3 ? 'second' : 'minute'} | ` +
  `${(k * 37) % 900} | \`pg_${k}_identifier_value\` | ${k === 3 ? LONG_WORD : 'eu-central-1'} | ` +
  `${k % 4 ? 'partly' : 'yes'} | ${k * 11} | ${k === 5 ? 'https://example.org/a/long/path/in/a/cell' : 'n/a'} | ` +
  `note ${k} ${k === 2 ? cite(9) : ''} | ${k * 1000} |`

const STRESS_TABLE = [
  '| Host | EU-only | PITR window | Granularity | Cost (USD) | Engine id | Region | Support in EU | Connections | Link ' +
    '| Notes | Rows |',
  '|:--|:--|:--|:--|--:|:--|:--|:--|--:|:--|:--|--:|',
  ...Array.from({ length: 40 }, (_, i) => stressRow(i + 1)),
].join('\n')

const STRESS = `# ${LONG_WORD} and https://example.org/a/very/long/path/that/never/breaks/because/it/has/no/spaces comparison of twelve vendors across every region, a title that keeps going well past one hundred and fifty characters

Lead with mixed scripts: 中文排版测试：研究报告的正文需要正确换行，不能溢出手机屏幕的宽度，也不能把引用编号放在行首。 العربية: هذا نص عربي لاختبار الاتجاه من اليمين إلى اليسار داخل تقرير ${cite(7)}. 日本語：これは日本語のテキストです。${cite(3)} And ten adjacent citations ${[1, 2, 4, 5, 6, 8, 9, 10, 11, 12].map(cite).join(' ')}.

## Executive summary ${cite(1)}

The answer is short ${cite(1)}. A long inline token \`averyveryverylonginlinecodeidentifierwithoutanybreakopportunity_at_all_whatsoever\` and a bare URL https://example.org/this/is/a/very/long/unbroken/url/that/should/wrap/somewhere/on/a/phone?with=query&and=more sit in the summary.

| Option | Verdict |
|:--|:--|
| A | ${LONG_WORD} |
| Northwind ${cite(6)} | ${cite(8)} |

## CI pipelines and the 2026 outlook

Every source cited once: ${Array.from({ length: 50 }, (_, i) => cite(i + 11)).join(' ')}.

1. First step.
   - nested bullet that must not take a number
2. Second step.

## Evidence by claim

#### What each host's own terms say ${cite(2)}

| Source | What it says | Also in |
|:--|:--|:--|
| ${cite(6)} | Support may come from outside the EU: its terms ${cite(8)} and its sub-processor list ${cite(10)} say when | ${[1, 2, 4, 5].map(cite).join(' ')} |
| ${[8, 10].map(cite).join(' ')} | Backups stay in the region | ${cite(12)} |

## A wide and long table

${STRESS_TABLE}

## Code

\`\`\`
const veryLongLine = "${'x'.repeat(300)}"; // and a comment after a 300-character string
function f() { return 1 }
\`\`\`

## 中文章节：非拉丁文字的标题会怎样换行

数据驻留不仅是区域问题，也是合同问题。只有两家供应商以书面形式承诺支持访问仅限欧盟境内处理${cite(3)}。恢复窗口的差异比价格的差异更大，从三天到三十五天不等。

## القسم العربي

الإقامة هي مسألة تعاقدية بقدر ما هي مسألة منطقة ${cite(7)}. نوافذ الاسترداد تختلف أكثر من الأسعار.

## Risks and limitations

- Restore times are vendor claims; none was measured.
- Prices change often.

## Conclusion

Short conclusion with a [link](https://wiki.example.org/db/migration-checklist) and an apostrophe link [Hilbert](https://en.wikipedia.org/wiki/Hilbert's_problems).
`

const STRESS_SOURCES: PageSource[] = Array.from({ length: 60 }, (_, i) => ({
  ...stressSource(i + 1),
  ...stressRead(i + 1),
}))

/** The labelled fixture reports, as Studio passes a version to the page. */
export const REPORT_PAGES = {
  kitchen: {
    markdown: KITCHEN,
    title: 'Report',
    sources: KITCHEN_SOURCES,
    citable: KITCHEN_SOURCES.map((s) => s.id),
    sha256: 'c'.repeat(64),
    versionNumber: 2,
    publishedAt: '2026-10-02T16:41:07.000Z',
    limitations: ['Restore times are vendor claims; none was measured.'],
  },
  stress: {
    markdown: STRESS,
    title: 'Fallback title',
    sources: STRESS_SOURCES,
    citable: STRESS_SOURCES.map((s) => s.id),
    sha256: 'e'.repeat(64),
    versionNumber: 4,
    publishedAt: '2026-10-02T00:30:00.000+02:00',
    limitations: [],
  },
} satisfies Record<string, ReportPageInput>
