#!/usr/bin/env node
// WBC-02 (WBC-02-CX-0032 §3): redacts diagnostics before they are kept: reads stdin, writes stdout, at most 256 KiB.
//   ... | REDACT_VARS=NAME1,NAME2 node scripts/paperclip-image-redact.mjs
// The value of every environment variable REDACT_VARS names (the job's generated credentials) is replaced, as are
// connection URLs, bearer tokens and PEM blocks, whatever produced them. GitHub's log masking is a second line, not
// this one: the files this writes are uploaded as they are.
import { readFileSync } from 'node:fs'

const LIMIT = 256 * 1024
let text = readFileSync(0, 'utf8')
if (text.length > LIMIT) text = `[... ${text.length - LIMIT} earlier characters omitted ...]\n${text.slice(-LIMIT)}`
const secrets = (process.env.REDACT_VARS ?? '')
  .split(',')
  .map((name) => process.env[name.trim()] ?? '')
  .filter((value) => value.length >= 8)
  .toSorted((a, b) => b.length - a.length)
for (const value of secrets) text = text.split(value).join('[redacted]')
text = text
  .replaceAll(/\b(postgres(?:ql)?|redis|mysql):\/\/[^\s'"]+/gi, '$1://[redacted]')
  .replaceAll(/\b(Bearer)\s+[\w.~+/=-]+/gi, '$1 [redacted]')
  .replaceAll(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[redacted PEM]')
process.stdout.write(text)
