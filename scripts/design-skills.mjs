#!/usr/bin/env node
/**
 * Write (--record) or check (default) packages/dsh-bundle/skills/manifest.json from the files beside it.
 *   node scripts/design-skills.mjs [--record]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { MANIFEST, buildSkillsManifest, manifestText } from './lib/design-skills.mjs'

const text = manifestText(buildSkillsManifest())
if (process.argv.includes('--record')) {
  writeFileSync(MANIFEST, text)
  console.log(`recorded ${MANIFEST}`)
} else if (readFileSync(MANIFEST, 'utf8') !== text) {
  console.error(`${MANIFEST} is stale: run node scripts/design-skills.mjs --record and review the diff`)
  process.exit(1)
} else {
  console.log('design skills manifest is current')
}
