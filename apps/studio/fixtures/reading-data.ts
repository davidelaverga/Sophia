// Labelled fixture data for the reading checks (e2e/report-reading.spec.ts, html-report-v2 SPEC §4b): a long report to
// read in the viewer, with every case its reading grammar covers (a summary, nested and numbered lists, a quote, code,
// a six-column and a four-column table, grouped citations, a group of six after a long address, a quotation in Chinese,
// which has no spaces, citations a word apart and beside links, M75-RF-0001, a letter apart, after a wide link and after emoji, M75-RF-0004/0005) and every kind of source (read in full, read in part, a search listing, the project's own file),
// and a short Italian version. Illustrative vendors and figures; nothing here is live. The room's fixture page serves
// it (`report=` READING).
import type { ArtifactVersion, ReportSourceList, SourceContent } from '@sophia/contracts'
import { PROJECT } from './data.ts'

export const READING = '00000000-0000-4000-8000-0000000000f0'
const AT = '2026-10-02T16:41:07.000Z'

/** The sources every version may cite, in the order the English version first cites them. */
const S1 = '00000000-0000-4000-8000-0000000000f3'
const S2 = '00000000-0000-4000-8000-0000000000f4'
const S3 = '00000000-0000-4000-8000-0000000000f5'
const S4 = '00000000-0000-4000-8000-0000000000f6'
const S5 = '00000000-0000-4000-8000-0000000000f7'
const S6 = '00000000-0000-4000-8000-0000000000f8'

/**
 * The English version (v2, current): a comparison of managed database hosts. A bullet is nested in its numbered tests,
 * a group of six citations follows an address of over a hundred characters, and a Chinese quotation cites a source.
 */
const ENGLISH = `# Managed PostgreSQL hosts for an EU-resident product

Which managed PostgreSQL host can keep a small team's customer data inside the EU, recover it to any minute of the last week, and stay under 400 USD a month at our current size. This report compares five hosts on residency, recovery, operations and cost, and recommends one with a fallback. The vendors and figures are illustrative: this is a design sample, not advice.

## Executive summary

**Harbor Cloud** is the best fit today: EU-only regions in Frankfurt and Paris, point-in-time recovery to the second for 14 days, and a quoted 310 USD a month for our footprint [${S1}]. **Northwind Data Platform** is the fallback: cheaper at 240 USD, but its recovery window is 7 days and its EU region is a single zone (${S2}; ${S3}).

- Residency is a contract question as much as a region question: only two hosts commit to EU-only processing for support access in writing [1](<${S4}>).
- Recovery windows differ more than prices do, from 3 days to 35.
- None of the five publishes an independent restore-time benchmark; restore times below are each vendor's own.

## Background and question

The team runs one production database of about 180 GB, growing roughly 6 GB a month, with peaks of 900 connections behind a pooler. Customers in Germany and Italy ask where their data lives and who can read it. The question was framed as three tests, in order of weight:

1. Data stays in the EU, including backups and support access.
   - Support access counts: who can read the data matters as much as where it sits.
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

Harbor Cloud and Calder DB state EU-only processing for primary data, backups and support access in their data-processing agreements [${S1}] [${S5}]. Northwind keeps backups in-region but reserves follow-the-sun support from outside the EU, with customer consent per incident [${S3}]. Ostrava Systems is EU-only but small; Lumen Managed Postgres replicates backups to a second region the customer cannot pin.

A Chinese summary of the same agreements says it without a single space:

> 数据驻留不仅是区域问题，也是合同问题。只有两家供应商以书面形式承诺支持访问仅限欧盟境内处理[${S5}]。

### Recovery

Every host offers point-in-time recovery, but the window and the granularity differ:

- **Harbor Cloud**: 14 days by default, extendable to 35, to the second.
  - Restores land in a new instance; the old one stays until deleted.
- **Northwind Data Platform**: 7 days, to the minute.
- **Calder DB**: 3 days on the plan we priced; 14 days costs 60% more.
  - *Not enough on its own:* it fails the second test at our price.
- **Ostrava Systems**: 10 days, restore by support ticket only.

#### Restore times the vendors quote

Restore times are vendor-reported for a 200 GB database and were not tested by us. Harbor quotes "under 20 minutes" and Northwind "about 45 minutes" [${S2}]; the others publish no figure. A restore drill on a copy should be the first task after the decision.

### Side by side

| Host | EU-only (data, backups, support) | PITR window | Restore granularity | Monthly cost (USD) | Notes |
|:-----|:-----:|:-----|:-----|-----:|:-----|
| Harbor Cloud | yes | 14 days (35 max) | second | 310 | DPA names EU-only support [${S1}] |
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
- A small host can be acquired: Ostrava's terms allow the agreement to transfer to a buyer [${S6}].

A long reference copied from a pricing page, cited with every source at once, shows how unbroken text behaves: https://pricing.harbor.example/calculator?region=eu-central-1&instance=pg-4x16&storage=250&replicas=1&backup_retention_days=14&currency=USD (${S1}; ${S2}; ${S3}; ${S4}; ${S5}; ${S6})

---

## Recommendations

3. Choose Harbor Cloud on the 4 vCPU plan in Frankfurt, with Paris as the replica region.
4. Before migrating, run one restore drill on a copy and time it; if it takes over 45 minutes, revisit Northwind.
5. Ask Harbor to confirm in the order form that support access stays in the EU, as its DPA says [${S1}].

## Conclusion

Harbor Cloud passes all three tests with room in the budget; Northwind passes two and would need written support-access terms to pass the first. The decision is reversible within a quarter: both hosts export standard dumps and logical replication streams. See the [migration checklist](https://wiki.example.org/db/migration-checklist) for the steps after the decision, and ![a residency map](https://evil.example/map.png) for where the regions sit.

Two sources agree on the window, Harbor[${S1}] and Calder[${S5}], and its [pricing page](https://pricing.harbor.example/)[${S1}] says the same; one claim[${S3}] [has a link](https://wiki.example.org/db) right after it, and Calder[${S5}] [its notes](https://calder.example/notes)[${S2}] agree.

Pair i[${S1}]i[${S2}].

Dense cases (M75-RF-0004, RF-0005): a label of wide letters, [WWWWWWWWWWW WWWWWWWWWWWW](https://example.org/wide)[${S3}], still wraps, and so do twenty-four emoji 🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂[${S4}] before a citation.
`

/**
 * The Italian version (v1): a few sentences citing a page read in part, a search listing and a page read in full, and a
 * five-column table, as wide as the reading column.
 */
const ITALIAN = `# Host PostgreSQL gestiti per un prodotto nell'UE

Questo rapporto confronta gli host per la residenza dei dati e per il ripristino. Il fornitore che conserva i backup nel territorio dell'Unione è anche quello che costa meno per il nostro carico [${S3}]. Gli altri sono più cari, e alcune delle offerte non dicono dove lavora il supporto [${S4}]. Questo vale anche per gli accordi sul trattamento dei dati, che sono pubblici per tutti gli host [${S1}].

| Host | Regione | Ripristino | Costo mensile | Supporto |
|:--|:--|:--|--:|:--|
| Harbor Cloud | Francoforte | 14 giorni | 310 USD | nell'UE |
| Northwind | Francoforte | 7 giorni | 240 USD | anche fuori dall'UE |
`

interface Text {
  sourceId: string
  sha256: string
  text: string
}

/** Each version's Markdown, with its SHA-256 (the viewer shows nothing that does not match it). */
const TEXTS: readonly Text[] = [
  {
    sourceId: '00000000-0000-4000-8000-0000000000f9',
    sha256: '036d01bf64485f6429f96ef3f06fb9b0feab0811905a5e648a1a4112939dcf28',
    text: ITALIAN,
  },
  {
    sourceId: '00000000-0000-4000-8000-0000000000fa',
    sha256: 'cd4570ef84a041ccd495e2f51b75cb184f229605e52006ee1c41b1f42ec880b1',
    text: ENGLISH,
  },
]

/** The id of version `n` (1: Italian, 2: English). */
export const readingVersionId = (n: 1 | 2) => `00000000-0000-4000-8000-0000000000f${n === 1 ? 'b' : 'c'}`

/** The English version's title: its pane is named by it. */
export const READING_TITLE = 'Managed PostgreSQL hosts for an EU-resident product'

function version(n: 1 | 2): ArtifactVersion {
  const text = TEXTS[n - 1]
  if (!text) throw new Error(`no reading version ${String(n)}`)
  return {
    id: readingVersionId(n),
    artifactId: READING,
    projectId: PROJECT,
    parentId: n === 2 ? readingVersionId(1) : null,
    sourceId: text.sourceId,
    sourceHash: text.sha256,
    state: 'stable',
    previewId: null,
    format: 'markdown',
    exportEditability: 'source_editable',
    title: n === 1 ? 'Host PostgreSQL gestiti per un prodotto nell’UE' : READING_TITLE,
    versionNumber: n,
    createdAt: AT,
    renditions: [],
    // What the version stored at publish: shown above its text, under the amber rule.
    limitations: n === 2 ? ['Restore times are vendor claims; none was measured.'] : [],
  }
}

/** A web page Sophia read, in full or in part. */
const page = (
  sourceId: string,
  title: string,
  url: string,
  coverage: 'complete' | 'partial',
  limitations: string[] = [],
) => ({
  sourceId,
  kind: 'web_read' as const,
  provider: 'jina' as const,
  title,
  url,
  coverage,
  originHttpStatus: 200,
  limitations,
  mime: 'text/markdown',
  retrievedAt: AT,
})

/** What both versions cite, as `GET …/versions/{id}/sources` answers it: two of them are weak (3 in part, 4 a listing). */
const SOURCES: ReportSourceList = {
  sources: [
    page(
      S1,
      'Harbor Cloud: Data Processing Agreement, EU edition (rev. 2026-06)',
      'https://legal.harbor.example/dpa/eu?version=2026-06&lang=en',
      'complete',
    ),
    page(
      S2,
      'Northwind Data Platform: backup and point-in-time recovery',
      'https://docs.northwind.example/postgres/backups/point-in-time-recovery',
      'complete',
    ),
    page(
      S3,
      'Northwind support access and sub-processors',
      'https://trust.northwind.example/subprocessors',
      'partial',
      ['The extractor returned the first part of the page; the full sub-processor list sits behind a sign-in.'],
    ),
    {
      sourceId: S4,
      kind: 'search_results',
      provider: 'tavily',
      title: 'Search: Calder DB EU-only support access',
      url: null,
      coverage: 'complete',
      originHttpStatus: null,
      limitations: [],
      mime: 'application/json',
      retrievedAt: AT,
    },
    page(S5, 'Calder DB DPA', 'https://calder.example/legal/dpa', 'complete'),
    {
      sourceId: S6,
      kind: 'input',
      provider: null,
      title: 'Ostrava Systems terms of service, section 14 (assignment)',
      url: null,
      coverage: null,
      originHttpStatus: null,
      limitations: [],
      mime: 'application/pdf',
      retrievedAt: null,
    },
  ],
}

/** A version's Markdown, inline, as `GET /sources/{id}/content` answers it. */
function content(text: Text): SourceContent {
  return {
    sourceId: text.sourceId,
    sha256: text.sha256,
    mime: 'text/markdown',
    byteLength: new TextEncoder().encode(text.text).byteLength,
    filename: 'reading-fixture.md',
    disposition: 'inline',
    text: text.text,
    downloadUrl: null,
    expiresAt: null,
  }
}

/** The API's answer to a read of the reading report (its versions, newest first, their sources, a text), else null. */
export function readingRead(path: string): unknown {
  if (path === `/api/v1/artifacts/${READING}/versions`) return [version(2), version(1)]
  if (path.startsWith(`/api/v1/artifacts/${READING}/versions/`) && path.endsWith('/sources')) return SOURCES
  const source = /^\/api\/v1\/sources\/([0-9a-f-]{36})\/content$/.exec(path)?.[1]
  const text = TEXTS.find((t) => t.sourceId === source)
  return text ? content(text) : null
}
