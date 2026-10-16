import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boardCsv, boardFileName, boardMarkdown, type ExportRow } from './board-export.ts'

// The board, exported (docs/plans/board-export.md).
const rows: ExportRow[] = [
  { lane: 'Active', task: 'Translate the checklist, second region', who: 'Marco’s Claude Code', status: 'Waiting' },
  { lane: 'Up next', task: 'Say "done" when it lands', who: 'Unassigned', status: 'Ready' },
  { lane: 'Complete', task: '=HYPERLINK("x")', who: 'Luis', status: 'Complete' },
]
const now = new Date('2026-10-16T09:00:00')

describe('the board, exported', () => {
  it('writes CSV with quoting and no formula a sheet would run', () => {
    assert.equal(
      boardCsv(rows),
      [
        'Lane,Task,Who,Status',
        'Active,"Translate the checklist, second region",Marco’s Claude Code,Waiting',
        'Up next,"Say ""done"" when it lands",Unassigned,Ready',
        `Complete,"'=HYPERLINK(""x"")",Luis,Complete`,
        '',
      ].join('\r\n'),
    )
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

  it('names the file by the plan and the day', () => {
    assert.equal(boardFileName(2, now, 'csv'), 'tasks-plan-r2-2026-10-16.csv')
    assert.equal(boardFileName(2, now, 'md'), 'tasks-plan-r2-2026-10-16.md')
  })
})
