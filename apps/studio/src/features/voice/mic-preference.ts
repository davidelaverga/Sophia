// Whether this device joins the room with its microphone on: the last choice made here, on by default. A
// person who muted before leaving joins muted next time.
const KEY = 'sophia.mic.v1'

export function micOnJoin(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true // storage unavailable: the default
  }
}

export function rememberMic(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // storage unavailable: the next join uses the default
  }
}
