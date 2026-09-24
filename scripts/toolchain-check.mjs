#!/usr/bin/env node
// Fail unless Node and pnpm are exactly the versions the repository pins.
import { assertToolchain } from './lib/toolchain.mjs'

try {
  const { node, pnpm } = assertToolchain()
  console.log(`toolchain ok: node ${node}, pnpm ${pnpm}`)
} catch (error) {
  console.error(`toolchain mismatch:\n${error.message}`)
  process.exit(1)
}
