#!/usr/bin/env node
// WBC-02 (WBC-02-CX-0032 §3, CX-0036): redacts diagnostics and evidence before they are kept.
//   ... | REDACT_VARS=NAME1,NAME2 node scripts/paperclip-image-redact.mjs          stdin to stdout: redacted whole, then
//                                                                                 at most its last 256 KiB
//   REDACT_VARS=NAME1,NAME2 REDACT_FILES=<file>,... node scripts/paperclip-image-redact.mjs --scrub-dir <dir>
// The value of every environment variable REDACT_VARS names (the job's generated credentials) is replaced, and every
// line of every file REDACT_FILES names (the credentials the probe made or was given: its passwords, session cookies
// and board key, review of 215b276; a named file that does not exist is an error), as are the values of fields named
// as credentials (password, secret, token, API key, authorization, cookie, private key, credential) in JSON or
// `name=value` form, connection URLs, bearer tokens and PEM blocks, whatever produced them. --scrub-dir rewrites, before the evidence is
// uploaded, every file under <dir> that still holds one, lists those files in <dir>/scrubbed.txt, then reads every file
// again and fails if any still holds one. It fails, too, on any entry it cannot read or rewrite, or that is neither a
// regular file nor a directory: the workflow uploads the evidence only when this exits 0 (review of 34bdf76). GitHub's
// log masking is a second line, not this one: the files this leaves are uploaded as they are.
import { lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIMIT = 256 * 1024

/** A field whose name says it holds a credential. */
const CREDENTIAL = String.raw`(?:pass(?:word|wd|phrase)?|secret|token|api[-_]?key|authorization|cookie|private[-_]?key|credential)`

/** The text with every given value and every credential-shaped string replaced. */
export function redact(text, values = []) {
  let out = text
  for (const value of values.filter((v) => v.length >= 8).toSorted((a, b) => b.length - a.length))
    out = out.split(value).join('[redacted]')
  return out
    .replaceAll(new RegExp(String.raw`("[^"\\]*${CREDENTIAL}[^"\\]*"\s*:\s*)"(?:[^"\\]|\\.)*"`, 'gi'), '$1"[redacted]"')
    .replaceAll(new RegExp(String.raw`\b([\w-]*${CREDENTIAL}[\w-]*\s*=\s*)[^\s,;&"']+`, 'gi'), '$1[redacted]')
    .replaceAll(/\b(postgres(?:ql)?|redis|mysql):\/\/[^\s'"]+/gi, '$1://[redacted]')
    .replaceAll(/\b(Bearer)\s+[\w.~+/=-]+/gi, '$1 [redacted]')
    .replaceAll(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[redacted PEM]')
}

/** The values of the variables REDACT_VARS names, and the lines of the files REDACT_FILES names. */
export function secretValues(env = process.env) {
  const named = (list) =>
    (list ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  const fromVars = named(env.REDACT_VARS).map((name) => env[name] ?? '')
  const fromFiles = named(env.REDACT_FILES).flatMap((path) => readFileSync(path, 'utf8').split('\n'))
  return [...fromVars, ...fromFiles].map((value) => value.trim()).filter((value) => value.length >= 8)
}

/** Every regular file under dir; anything else (a link, a device, a socket) is refused, never followed. */
function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    const entry = lstatSync(path)
    if (entry.isDirectory()) return filesUnder(path)
    if (entry.isFile()) return [path]
    throw new Error(`[redact] ${path}: neither a regular file nor a directory; the evidence is not uploaded`)
  })
}

/**
 * Rewrites every file under dir that holds a value to redact, then reads them all again: returns the files rewritten,
 * and throws if any file still holds one (a write that did not take) or any entry could not be read or written.
 */
export function scrubDir(dir, values) {
  const scrubbed = []
  for (const path of filesUnder(dir)) {
    const text = readFileSync(path, 'utf8')
    const clean = redact(text, values)
    if (clean !== text) {
      writeFileSync(path, clean)
      scrubbed.push(relative(dir, path))
    }
  }
  const left = filesUnder(dir).filter((path) => {
    const text = readFileSync(path, 'utf8')
    return redact(text, values) !== text
  })
  if (left.length > 0) throw new Error(`[redact] still holding values after scrubbing: ${left.map((p) => relative(dir, p)).join(', ')}`)
  return scrubbed
}

const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  const values = secretValues()
  const at = process.argv.indexOf('--scrub-dir')
  if (at !== -1) {
    const dir = process.argv[at + 1]
    const scrubbed = scrubDir(dir, values)
    writeFileSync(join(dir, 'scrubbed.txt'), scrubbed.length > 0 ? `${scrubbed.join('\n')}\n` : 'none\n')
    console.log(`[redact] ${scrubbed.length} evidence file(s) needed scrubbing${scrubbed.length > 0 ? `: ${scrubbed.join(', ')}` : ''}`)
  } else {
    // Redacted whole, then cut: a cut first could leave most of a value that straddled it (review of 9bc711a).
    const text = redact(readFileSync(0, 'utf8'), values)
    process.stdout.write(text.length > LIMIT ? `[... ${text.length - LIMIT} earlier characters omitted ...]\n${text.slice(-LIMIT)}` : text)
  }
}
