// A view that fails to draw doesn't take the Studio with it (docs/plans/view-boundary.md): its place says so, with Try
// again (the view draws anew) and Load the page again, while the header, the other views and the call stay. What failed
// reaches the crash reports, as LoadFailed's does. Another view starts it clean: a failure is let go when `view` moves.
// It is never keyed by the view, so what draws well stays mounted across views: Goals and Tasks share one list, whose
// chosen goal holds across a visit (goal-address.spec.ts). What it holds is marked (`data-view-boundary`, a box that
// draws nothing: display contents), so its reach can be read. Try again's button goes as the view draws again, so the
// focus goes on to the view's heading, or to a new Try again when it still fails (focus-and-webgl-follow-ups.md).
import { Component, createRef, type ReactNode } from 'react'
import { reportCrash } from '../../app/crash-report.ts'
import { VIEW_FAILED } from './view-failed-view.ts'

interface Props {
  /** The view on screen: moving to another lets a failure go. */
  view: string
  children: ReactNode
}

interface State {
  failed: boolean
  /** The view the state is for: another lets the failure go, before it draws. */
  view: string
}

/**
 * Where the focus lands once the view draws again: its heading (every view's title, view-titles.md), else its content,
 * as Skip to content takes it; the first of them drawn.
 */
function landIn(body: HTMLElement | null) {
  for (const to of [body?.querySelector<HTMLElement>('h2'), body?.closest<HTMLElement>('[data-content]')]) {
    if (!to || to.getClientRects().length === 0) continue
    if (!to.hasAttribute('tabindex')) to.tabIndex = -1
    to.focus({ preventScroll: true })
    return
  }
}

export class ViewFailed extends Component<Props, State> {
  override state: State = { failed: false, view: this.props.view }
  /** Try again was pressed: the update it brings gives the focus on, once, whether the view drew or failed again. */
  private retried = false
  private readonly body = createRef<HTMLDivElement>()
  private readonly again = createRef<HTMLButtonElement>()

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.view === state.view ? null : { failed: false, view: props.view }
  }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  override componentDidCatch(error: unknown) {
    reportCrash(error)
  }

  override componentDidUpdate() {
    if (!this.retried) return
    this.retried = false
    if (this.state.failed) this.again.current?.focus({ preventScroll: true })
    else landIn(this.body.current)
  }

  private readonly retry = () => {
    this.retried = true
    this.setState({ failed: false })
  }

  override render() {
    if (!this.state.failed)
      return (
        <div className="view-body" data-view-boundary ref={this.body}>
          {this.props.children}
        </div>
      )
    return (
      <div className="view-failed" role="alert">
        <p className="view-failed-title">{VIEW_FAILED.title}</p>
        <p className="view-failed-note">{VIEW_FAILED.note}</p>
        <div className="view-failed-acts">
          <button type="button" className="pill" ref={this.again} onClick={this.retry}>
            {VIEW_FAILED.again}
          </button>
          <button type="button" className="text-button" onClick={() => window.location.reload()}>
            {VIEW_FAILED.reload}
          </button>
        </div>
      </div>
    )
  }
}
