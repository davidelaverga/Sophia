# Personal: Codex's P2s on #89 and #90

> 2026-10-04 · Luis · after [personal-moments](personal-moments.md) · "Procede"

Three behaviour fixes Codex found and the merge rule left as follow-ups.

| Codex said | Measured in the fixture | Change |
|---|---|---|
| #89: wait for cross-tab admission before dismissing the week | With another tab holding the device's send, "Talk about it" sent nothing and the week went | Sending resolves once it is known whether the words went on their way (`oneAtATime` admits them or not). "Talk about it" puts the week away only then (offline, once its words wait in the field); a way to start waits on the same answer. |
| #89: stop dictation before starting a live talk | Dictating, then "Talk with her": the field kept listening under the talk | A talk running over the field counts as out of sight for it: its dictation stops (and a start still waiting is called off) before the talk's voice begins. |
| #90: compliant contrast in every Personal state | "No notes yet…" at 3.79:1; the talk's status line on `--text-3` | Both on `--text-sec`. The contrast check now opens the empty notes and a talk, measuring the talk where it is drawn (portalled outside the space). It found one more: a talk's earlier lines at half opacity (3.70:1); they now step back to 0.72. The review found the field's note line (offline, a wait, a draft kept) and the quiet words of the days' menu and the data sheet on `--text-3` too: all on `--text-sec`, and the check opens the offline line and the days' menu. |

## Checks (written first, each failing before its change)

- Another tab holds the send: "Talk about it" leaves the week and sends nothing; once that tab is gone, it sends and the week goes.
- Dictating, then a talk: the field's listening line is gone.
- No contrast under 4.5:1 with the notes empty, or in a talk.
