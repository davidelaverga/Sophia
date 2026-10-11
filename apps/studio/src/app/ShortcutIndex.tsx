// The index of keys (docs/plans/commands.md): ⌘/ from anywhere, ? where no field takes stray typing. The kit's sheet,
// listing the keyed commands the page offers now by group, from the same registry as the keys themselves.
import { indexGroups } from './commands.ts'
import { Sheet } from './Sheet.tsx'
import { keyLabel, onMac } from './shortcuts.ts'
import { useOffered } from './useCommands.ts'

export function ShortcutIndex({ onClose }: { onClose: () => void }) {
  const groups = indexGroups(useOffered(), onMac)
  return (
    <Sheet id="keys-title" title="Keyboard shortcuts" onClose={onClose} className="keys-sheet">
      <p className="sheet-lead">
        The keys this page takes now. A letter acts while nothing is being written; a key with {onMac ? '⌘' : 'Ctrl'}{' '}
        acts from anywhere, a field too. <kbd>{keyLabel('mod+/', onMac)}</kbd> opens this; so does <kbd>?</kbd> where no
        field takes what is typed.
      </p>
      {groups.map((g) => (
        <section key={g.group} className="keys-group" aria-labelledby={`keys-${g.group}`}>
          <h3 id={`keys-${g.group}`} className="field-label">
            {g.label}
          </h3>
          <ul className="keys-list">
            {g.rows.map((r) => (
              <li key={r.id}>
                <span>{r.words}</span>
                <kbd>{r.keys}</kbd>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Sheet>
  )
}
