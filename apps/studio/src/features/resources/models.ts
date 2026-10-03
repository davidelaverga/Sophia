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
/** "flash-lite" as "Flash Lite". */
const words = (s: string) => s.split('-').map(title).join(' ')

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
    pattern: /^gemini-(\d+(?:\.\d+)?)-((pro|flash)(?:-[a-z0-9]+)*)$/,
    look: ([, v = '', rest = '', kind = '']) => ({
      label: `Gemini ${v} ${words(rest)}`,
      family: FAMILY[`gemini-${kind}`] ?? 'other',
    }),
  },
  {
    // "gpt-4o", "gpt-5-mini", "gpt-6.1-sol": the version as written, every word after it kept.
    pattern: /^gpt-([0-9][0-9a-z.]*)((?:-[a-z0-9]+)*)$/,
    look: ([, v = '', rest = '']) => ({ label: `GPT-${v}${rest ? ` ${words(rest.slice(1))}` : ''}`, family: 'gpt' }),
  },
  {
    pattern: /^grok-([0-9][0-9a-z.]*)((?:-[a-z0-9]+)*)$/,
    look: ([, v = '', rest = '']) => ({ label: `Grok ${v}${rest ? ` ${words(rest.slice(1))}` : ''}`, family: 'grok' }),
  },
]

export function modelLook(model: string): ModelLook {
  for (const { pattern, look } of RULES) {
    const m = model.match(pattern)
    if (m) return look(m)
  }
  return { label: model, family: 'other' }
}
