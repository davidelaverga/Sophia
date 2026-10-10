// When a part loaded on its own couldn't be drawn (docs/plans/signed-in-later.md): the signed-in Studio or a room's
// door, its chunk not fetched (a deploy replaced it, the connection dropped as it came) or anything under it failing to
// draw. Said, with the page again one press away, never a blank screen.
import { Component, type ReactNode } from 'react'
import { Centered } from './SignIn.tsx'

export class LoadFailed extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return (
      <Centered title="Sophia couldn’t finish opening">
        <p>Something didn’t load or draw as it should. Loading the page again often fixes it.</p>
        <button type="button" className="pill primary" onClick={() => window.location.reload()}>
          Load again
        </button>
      </Centered>
    )
  }
}
