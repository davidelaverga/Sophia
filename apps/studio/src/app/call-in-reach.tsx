// A live call's switches, kept in reach of whatever covers the room's own (WBC-01, Codex F-003). A sheet is modal: it
// covers the page and the mini dock with it, keeps the keyboard inside, and hides the rest from a screen reader. So
// while a call is live, every sheet shows the call's switches in a row under its head (CallSwitches: the microphone,
// text mode while it holds, the camera and the screen while they are on, Leave), inside the dialog, where the pointer,
// the keyboard and a screen reader all reach them: what a person sends stays in sight, with its off switch. The
// project's shell provides the switches (ProjectShell); outside a call, or outside a project, the row isn't there.
import { createContext, useContext } from 'react'

/** The call's switches, as the project's shell builds them; null while no call is live. */
export const CallInReach = createContext<React.ReactNode>(null)

/** The call's switches in a sheet's head, while a call is live. */
export function SheetCall() {
  const call = useContext(CallInReach)
  if (!call) return null
  return (
    <div className="sheet-call" role="group" aria-label="Your call">
      <span className="field-label">In the call</span>
      {call}
    </div>
  )
}
