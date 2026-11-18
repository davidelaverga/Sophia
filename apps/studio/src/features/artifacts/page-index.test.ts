import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseMarkdown } from './markdown.ts'
import { sectionIndex } from '../voice/voice-trail.ts'
import { pageIndex } from './page-index.ts'

const CITED = '00000000-0000-4000-8000-0000000000f3'
const index = (md: string) => pageIndex(parseMarkdown(md).blocks).map((s) => s.text)
const sections = (n: number, marks = '##') =>
  Array.from({ length: n }, (_, i) => `${marks} Part ${String(i + 1)}\n\nText.\n`).join('\n')

describe("a report's On this page", () => {
  it('lists the sections under the title, not the title', () => {
    assert.deepEqual(index(`# Title\n\nIntro.\n\n${sections(4)}`), ['Part 1', 'Part 2', 'Part 3', 'Part 4'])
  })

  it('leaves out the headings under a section', () => {
    const md = `# Title\n\n${sections(4)}\n### Inside\n\nMore.\n`
    assert.deepEqual(index(md), ['Part 1', 'Part 2', 'Part 3', 'Part 4'])
  })

  it('takes the top level when the report has no single title', () => {
    assert.deepEqual(index(sections(5)), ['Part 1', 'Part 2', 'Part 3', 'Part 4', 'Part 5'])
    assert.deepEqual(index(sections(4, '#')), ['Part 1', 'Part 2', 'Part 3', 'Part 4'])
  })

  it('has none under four sections', () => {
    assert.deepEqual(index(`# Title\n\n${sections(3)}`), [])
    assert.deepEqual(index('Just text.\n'), [])
  })

  it('says a section in its words only, and points at its heading', () => {
    const md = `# Title\n\n## **Bold** and \`code\` and [a link](https://example.com)\n\nA.\n\n${sections(3)}`
    const [first] = pageIndex(parseMarkdown(md).blocks)
    assert.equal(first?.text, 'Bold and code and a link')
    const heading = parseMarkdown(md).blocks[first?.at ?? -1]
    assert.equal(heading?.kind === 'heading' ? heading.anchor : null, first?.anchor)
  })

  it('leaves out a heading with no words, only a citation: no nameless link', () => {
    const md = `# Title\n\n## [${CITED}]\n\nA.\n\n${sections(4)}`
    assert.deepEqual(index(md), ['Part 1', 'Part 2', 'Part 3', 'Part 4'])
  })

  it('names the sections as the stage’s Sections do, title left out', () => {
    const md = `# Title\n\n## **Costs** in \`EUR\` [${CITED}]\n\nA.\n\n${sections(4)}\n### Inside\n\nB.\n`
    const blocks = parseMarkdown(md).blocks
    const stage = sectionIndex(blocks).map((e) => e.text)
    assert.deepEqual(index(md), stage.slice(1))
    assert.equal(index(md)[0], 'Costs in EUR')
  })
})
