// A view that fails to draw doesn't take the Studio with it (docs/plans/view-boundary.md): its place says so, with Try
// again (the view draws anew) and Load the page again, while the header, the other views and the call stay. What failed
// reaches the crash reports, as LoadFailed's does. Keyed by the view where it is used, so another view starts it clean.
// What it holds is marked (`data-view-boundary`, a box that draws nothing: display contents), so its reach can be read.
import { Component, type ReactNode } from 'react'
import { reportCrash } from '../../app/crash-report.ts'

export class ViewFailed extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: unknown) {
    reportCrash(error)
  }

  override render() {
    if (!this.state.failed)
      return (
        <div className="view-body" data-view-boundary>
          {this.props.children}
        </div>
      )
    return (
      <div className="view-failed" role="alert">
        <p className="view-failed-title">This view couldn’t be drawn.</p>
        <p className="view-failed-note">
          Something in it didn’t draw as it should. The rest of the project is still here.
        </p>
        <div className="view-failed-acts">
          <button type="button" className="pill" onClick={() => this.setState({ failed: false })}>
            Try again
          </button>
          <button type="button" className="text-button" onClick={() => window.location.reload()}>
            Load the page again
          </button>
        </div>
      </div>
    )
  }
}
