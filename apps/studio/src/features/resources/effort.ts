// A session's reasoning effort, as its tool reported it, placed on one scale from minimal to its tool's top level
// (Claude Code's "max", GPT's "ultra"). An effort the view doesn't know keeps its own word and no place on the scale.
// Nothing is inferred: a session that reported no effort shows none. Claude Code's ultracode is a mode, not an effort
// level (Session.mode): it is what brings Claude's bar alive, whatever the effort.
import type { Tool } from './resource.ts'

const RANK: Record<string, number | undefined> = {
  minimal: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
  ultra: 5,
}
const TOP = 5

const LABEL: Record<string, string | undefined> = { xhigh: 'Extra high' }

export interface EffortLook {
  label: string
  /** Its place on the scale, 0–5; null when the word isn't one the view knows. */
  rank: number | null
  /** The tool's top level: Claude Code's max, GPT's ultra. */
  top: boolean
  /** The word as the tool reported it, lowercased: max and ultra share a place on the scale, not a look. */
  word: string
}

export function effortLook(effort: string): EffortLook {
  const word = effort.toLowerCase()
  const rank = RANK[word]
  const label = LABEL[word] ?? word.charAt(0).toUpperCase() + word.slice(1)
  return rank === undefined ? { label: effort, rank: null, top: false, word } : { label, rank, top: rank === TOP, word }
}

export const EFFORT_TOP = TOP

/** The bar's look, as each tool draws its own: Claude's dotted scale, GPT's gradient; a plain bar for the others. */
export type EffortStyle = 'claude' | 'gpt' | 'plain'

const STYLE: Record<Tool, EffortStyle> = {
  'claude-code': 'claude',
  codex: 'gpt',
  'github-copilot': 'plain',
  cursor: 'plain',
  'gemini-cli': 'plain',
  grok: 'plain',
}

export const effortStyle = (tool: Tool) => STYLE[tool]

/**
 * Whether the bar comes alive, as its tool's own does: Claude's when the session runs in ultracode, GPT's at ultra.
 * Never for a tool whose look the view doesn't know.
 */
export function alive(style: EffortStyle, look: EffortLook, mode: string | null | undefined): boolean {
  if (style === 'claude') return mode === 'ultracode'
  return style === 'gpt' && look.word === 'ultra'
}
