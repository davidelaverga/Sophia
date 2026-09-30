// The account's passkeys: add one for this device, see where they were used, remove one. A passkey signs in
// with Face ID, Touch ID, Windows Hello or a security key, without an email link.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmButton, Icon, Tip } from '@sophia/ui'
import { addPasskey, listPasskeys, removePasskey, type SavedPasskey } from './auth.ts'
import { openedLabel } from './days-ago.ts'
import { useDialog } from './useDialog.ts'

type Load = { status: 'loading' } | { status: 'ready'; passkeys: SavedPasskey[] } | { status: 'error'; message: string }

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

function usePasskeys() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const refresh = useCallback(async () => {
    try {
      setLoad({ status: 'ready', passkeys: await listPasskeys() })
    } catch (err: unknown) {
      setLoad({ status: 'error', message: message(err, 'Couldn’t load your passkeys.') })
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  return { load, refresh }
}

function PasskeyRow({ passkey, onRemove }: { passkey: SavedPasskey; onRemove: () => void }) {
  const now = Date.now()
  const used = passkey.lastUsedAt
    ? `used ${openedLabel(Date.parse(passkey.lastUsedAt), now).toLowerCase()}`
    : 'not used yet'
  return (
    <li className="passkey-row">
      <span className="passkey-text">
        <strong>{passkey.name}</strong>
        <span className="muted">
          Added {openedLabel(Date.parse(passkey.createdAt), now).toLowerCase()} · {used}
        </span>
      </span>
      <ConfirmButton label="Remove" warning="It won’t sign you in anymore." confirm="Remove" onConfirm={onRemove} />
    </li>
  )
}

export function PasskeySheet({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useDialog(panel, onClose)
  const { load, refresh } = usePasskeys()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err: unknown) {
      setError(message(err, fallback))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby="passkey-title" tabIndex={-1}>
        <header className="sheet-head">
          <h2 id="passkey-title">Passkeys</h2>
          <button type="button" className="round has-tip" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
            <Tip label="Close" keys="Esc" side="bottom" align="end" />
          </button>
        </header>
        <p className="muted">Sign in with Face ID, Touch ID, Windows Hello or a security key. No email link.</p>
        {load.status === 'loading' && <p className="muted">Loading…</p>}
        {load.status === 'error' && <p className="form-error">{load.message}</p>}
        {load.status === 'ready' && load.passkeys.length > 0 && (
          <ul className="passkey-list">
            {load.passkeys.map((p) => (
              <PasskeyRow
                key={p.id}
                passkey={p}
                onRemove={() => void run(() => removePasskey(p.id), 'Couldn’t remove that passkey.')}
              />
            ))}
          </ul>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="pill primary"
          disabled={busy || load.status === 'loading'}
          onClick={() => void run(addPasskey, 'Couldn’t save a passkey.')}
        >
          {busy ? 'Waiting for your device…' : 'Add a passkey'}
        </button>
      </div>
    </div>
  )
}
