// A model as people say it, with its family's colour: "claude-opus-5-5" is Opus 5.5, Anthropic's deep orange; Sonnet
// and Haiku lighter; GPT blue; Gemini Pro violet and Flash bright blue; Grok silver. A model the view doesn't know
// keeps its own id and a neutral colour. Only what a session reported is shown: no model is guessed.

export type Family = 'opus' | 'sonnet' | 'haiku' | 'gpt' | 'gemini-pro' | 'gemini-flash' | 'grok' | 'other'

export interface ModelLook {
  label: string
  family: Family
}

/** "5-5" or "5.5" or "2.5" as a version: "5.5". */
const version = (v: string) => v.replaceAll('-', '.')
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const FAMILY: Record<string, Family | undefined> = {
  opus: 'opus',
  sonnet: 'sonnet',
  haiku: 'haiku',
  'gemini-pro': 'gemini-pro',
  'gemini-flash': 'gemini-flash',
}

interface Rule {
  pattern: RegExp
  look: (m: RegExpMatchArray) => ModelLook
}

const RULES: Rule[] = [
  {
    pattern: /^claude-(opus|sonnet|haiku)-(\d+(?:[-.]\d+)?)/,
    look: ([, family = '', v = '']) => ({ label: `${title(family)} ${version(v)}`, family: FAMILY[family] ?? 'other' }),
  },
  {
    pattern: /^gemini-(\d+(?:\.\d+)?)-(pro|flash)/,
    look: ([, v = '', kind = '']) => ({
      label: `Gemini ${v} ${title(kind)}`,
      family: FAMILY[`gemini-${kind}`] ?? 'other',
    }),
  },
  {
    pattern: /^gpt-(\d+(?:\.\d+)?)(-codex)?/,
    look: ([, v = '', codex]) => ({ label: `GPT-${v}${codex ? ' Codex' : ''}`, family: 'gpt' }),
  },
  { pattern: /^grok-(\d+(?:\.\d+)?)/, look: ([, v = '']) => ({ label: `Grok ${v}`, family: 'grok' }) },
]

export function modelLook(model: string): ModelLook {
  for (const { pattern, look } of RULES) {
    const m = model.match(pattern)
    if (m) return look(m)
  }
  return { label: model, family: 'other' }
}
