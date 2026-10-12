// Status tag: the state chip with its dot. The text always states the status; the tone only reinforces it (never
// colour alone).
import type { ReactNode } from 'react'
import { Chip } from './Chip.tsx'
import type { Tone } from './chip-class.ts'

export type { Tone }

export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Chip tone={tone} dot>
      {children}
    </Chip>
  )
}
