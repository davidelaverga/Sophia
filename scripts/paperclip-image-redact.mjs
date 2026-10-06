#!/usr/bin/env node
// WBC-02 (WBC-02-CX-0032 §3, CX-0036): redacts diagnostics and evidence before they are kept.
//   ... | REDACT_VARS=NAME1,NAME2 node scripts/paperclip-image-redact.mjs          stdin to stdout, at most 256 KiB
//   REDACT_VARS=NAME1,NAME2 node scripts/paperclip-image-redact.mjs --scrub-dir <dir>
// The value of every environment variable REDACT_VARS names (the job's generated credentials) is replaced, as are
// connection URLs, bearer tokens and PEM blocks, whatever produced them. --scrub-dir rewrites, before the evidence is
// uploaded, every file under <dir> that still holds one, and lists those files in <dir>/scrubbed.txt. GitHub's log
// masking is a second line, not this one: the files this leaves are uploaded as they are.
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIMIT = 256 * 1024

/** The text with every given value and every credential-shaped string replaced. */
export function redact(text, values = []) {
  let out = text
  for (const value of values.filter((v) => v.length >= 8).toSorted((a, b) => b.length - a.length))
    out = out.split(value).join('[redacted]')
  return out
    .replaceAll(/\b(postgres(?:ql)?|redis|mysql):\/\/[^\s'"]+/gi, '$1://[redacted]')
    .replaceAll(/\b(Bearer)\s+[\w.~+/=-]+/gi, '$1 [redacted]')
    .replaceAll(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[redacted PEM]')
}

/** The values of the variables REDACT_VARS names. */
export function secretValues(env = process.env) {
  return (env.REDACT_VARS ?? '')
    .split(',')
    .map((name) => env[name.trim()] ?? '')
    .filter((value) => value.length >= 8)
}

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  const values = secretValues()
  const at = process.argv.indexOf('--scrub-dir')
  if (at !== -1) {
    const dir = process.argv[at + 1]
    const scrubbed = []
    for (const path of filesUnder(dir)) {
      const text = readFileSync(path, 'utf8')
      const clean = redact(text, values)
      if (clean !== text) {
        writeFileSync(path, clean)
        scrubbed.push(relative(dir, path))
      }
    }
    writeFileSync(join(dir, 'scrubbed.txt'), scrubbed.length > 0 ? `${scrubbed.join('\n')}\n` : 'none\n')
    console.log(`[redact] ${scrubbed.length} evidence file(s) needed scrubbing${scrubbed.length > 0 ? `: ${scrubbed.join(', ')}` : ''}`)
  } else {
    let text = readFileSync(0, 'utf8')
    if (text.length > LIMIT) text = `[... ${text.length - LIMIT} earlier characters omitted ...]\n${text.slice(-LIMIT)}`
    process.stdout.write(redact(text, values))
  }
}
