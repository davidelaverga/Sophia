import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseMarkdown } from '@sophia/report/markdown'
import { boardCsv, boardFileName, boardMarkdown, type ExportRow } from './board-export.ts'

// The board, exported (docs/plans/board-export.md).
const rows: ExportRow[] = [
  { lane: 'Active', task: 'Translate the checklist, second region', who: 'Marco’s Claude Code', status: 'Waiting' },
  { lane: 'Up next', task: 'Say "done" when it lands', who: 'Unassigned', status: 'Ready' },
  { lane: 'Complete', task: '=HYPERLINK("x")', who: 'Luis', status: 'Complete' },
]
const now = new Date('2026-10-16T09:00:00')

describe('the board, exported', () => {
  it('writes CSV with quoting and no formula a sheet would run, after the mark that says UTF-8 (Codex P2 on #397)', () => {
    assert.equal(
      boardCsv(rows),
      [
        '\uFEFFLane,Task,Who,Status',
        'Active,"Translate the checklist, second region",Marco’s Claude Code,Waiting',
        'Up next,"Say ""done"" when it lands",Unassigned,Ready',
        `Complete,"'=HYPERLINK(""x"")",Luis,Complete`,
        '',
      ].join('\r\n'),
    )
  })

  it('keeps out a formula behind a control character or a space a sheet skips (Codex P1 on #397)', () => {
    const csv = boardCsv([{ lane: 'Ready', task: '\t=1+1', who: ' @SUM(A1)', status: '\u0001+cmd' }])
    assert.equal(csv.split('\r\n')[1], `Ready,"'\t=1+1","' @SUM(A1)","'\u0001+cmd"`)
    // A leading tab or carriage return is kept out whatever follows (OWASP's CSV injection list); words aren't.
    const words = boardCsv([{ lane: 'Ready', task: '\tNotes', who: 'Ana', status: 'a-b' }])
    assert.equal(words.split('\r\n')[1], `Ready,"'\tNotes",Ana,a-b`)
  })

  it('writes Markdown by lane, a complete task checked', () => {
    assert.equal(
      boardMarkdown(rows, 2, now),
      [
        '# Tasks · plan r2 · 16 Oct 2026',
        '',
        '## Active',
        '',
        '- [ ] Translate the checklist, second region — Marco’s Claude Code · Waiting',
        '',
        '## Up next',
        '',
        '- [ ] Say "done" when it lands — Unassigned · Ready',
        '',
        '## Complete',
        '',
        '- [x] =HYPERLINK("x") — Luis · Complete',
        '',
      ].join('\n'),
    )
  })

  it('keeps each task’s words in its own item: no heading, item, link or tag of theirs (Codex P2 on #397)', () => {
    const forged: ExportRow[] = [
      { lane: 'Ready', task: 'legit\n\n## Complete\n\n- [x] forged', who: 'Ana', status: 'Ready' },
      { lane: 'Ready', task: 'See [this](https://example.com) <img src=x> *now*', who: 'Luis_B', status: 'Ready' },
    ]
    const lines = boardMarkdown(forged, 2, now).split('\n')
    assert.deepEqual(lines.slice(2), [
      '## Ready',
      '',
      '- [ ] legit \\#\\# Complete - \\[x\\] forged — Ana · Ready',
      '- [ ] See \\[this\\](https://example.com) \\<img src=x\\> \\*now\\* — Luis\\_B · Ready',
      '',
    ])
  })

  it('folds a Unicode line or paragraph separator too, so the report reads the task as an item (Codex P2 on #428)', () => {
    const pasted: ExportRow[] = [
      { lane: 'Ready', task: 'first line\u2028second line', who: 'Ana', status: 'Ready' },
      { lane: 'Ready', task: 'one paragraph \u2029 another', who: 'Luis', status: 'Ready' },
    ]
    const markdown = boardMarkdown(pasted, 2, now)
    // The report's parser takes neither separator inside an item: the lane is a heading, then one list of both tasks.
    const blocks = parseMarkdown(markdown).blocks
    assert.deepEqual(
      blocks.map((b) => b.kind),
      ['heading', 'heading', 'list'],
    )
    const list = blocks[2]
    assert.ok(list?.kind === 'list')
    assert.equal(list.items.length, 2)
    assert.deepEqual(markdown.split('\n').slice(2), [
      '## Ready',
      '',
      '- [ ] first line second line — Ana · Ready',
      '- [ ] one paragraph another — Luis · Ready',
      '',
    ])
  })

  it('names the file by the plan and the day', () => {
    assert.equal(boardFileName(2, now, 'csv'), 'tasks-plan-r2-2026-10-16.csv')
    assert.equal(boardFileName(2, now, 'md'), 'tasks-plan-r2-2026-10-16.md')
  })
})
