// A native tool's own mark, so a resource reads as what it is at a glance: Claude Code's, Codex's, Grok's… The marks
// come from @lobehub/icons-static-svg (MIT); each brand's mark stays its owner's trademark, shown only to name the tool.
// A one-colour mark takes the text's colour (a mask), so it reads on the dark theme; a coloured one is shown as made.
import claudeCode from '@lobehub/icons-static-svg/icons/claudecode-color.svg'
import codex from '@lobehub/icons-static-svg/icons/codex-color.svg'
import cursor from '@lobehub/icons-static-svg/icons/cursor.svg'
import geminiCli from '@lobehub/icons-static-svg/icons/geminicli-color.svg'
import copilot from '@lobehub/icons-static-svg/icons/githubcopilot.svg'
import grok from '@lobehub/icons-static-svg/icons/grok.svg'
import type { Tool } from './resource.ts'

const LOGO: Record<Tool, { src: string; mono: boolean }> = {
  'claude-code': { src: claudeCode, mono: false },
  codex: { src: codex, mono: false },
  grok: { src: grok, mono: true },
  'gemini-cli': { src: geminiCli, mono: false },
  'github-copilot': { src: copilot, mono: true },
  cursor: { src: cursor, mono: true },
}

/** `size`: 'lg' heads a card; 'sm' sits in a line of text. The name beside it is the label: the mark is decoration. */
export function ToolLogo({ tool, size = 'lg' }: { tool: Tool; size?: 'lg' | 'sm' }) {
  const { src, mono } = LOGO[tool]
  return (
    <span className={`tool-logo ${size}`} data-tool={tool} aria-hidden>
      {mono ? (
        <span className="tool-logo-mark" style={{ maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")` }} />
      ) : (
        <img src={src} alt="" draggable={false} />
      )}
    </span>
  )
}
