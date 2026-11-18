# Say why dictation stopped, and that knocks stay on the page

> 2026-11-16 · Luis approved the lines of `evaluacion-2026-11-16/textos-lote-18.md` (seams 4 and 6, «lo que el sistema
> ya sabe y calla»): the person's browser has told the Studio why, and the Studio says nothing.

## 4 · Personal dictation fails in silence

- **What happens on main:** «Talk instead» in the personal composer (`features/personal/dictation.ts`) listens once
  through the browser's on-device recognition. On an `error` event, `listenOnce` aborts and `end` lands with nothing
  heard (`dictation.ts:77`); the hook's `start` swallows a throw too (`:139`). The listening line goes, the field
  comes back empty, and nothing says why.
- **What the browser already said:** the `error` event carries `error`, one of the Web Speech API's codes. Three of
  them have a reason the person can act on:

  | `error` | The line |
  | --- | --- |
  | `not-allowed` | «Sophia can’t hear you: the microphone is blocked for this site.» |
  | `audio-capture` | «Sophia can’t hear you: the microphone isn’t available.» |
  | `no-speech` | «Didn’t catch anything. Try again.» |

  Any other code keeps today's behaviour: nothing is said. That includes `aborted` (our own `abort()` causes it),
  `service-not-allowed` (the browser refusing its speech service, not this site's microphone: review, 2026-11-16) and
  `network`: recognition runs on the device, so the first draft's «Dictation needs a connection.» was dropped (Luis,
  2026-11-16), and with it the need to clear that line on reconnecting.
- **Where it shows:** the composer's line above the bar (`Over`, a polite `role="status"`), where «From your voice ·
  edit it or send» already says where words came from. It is set once per attempt, from the first error of that
  attempt (the `aborted` our own `abort()` brings after it can't replace it), and goes when the next attempt starts
  or the person writes in the field. Offline, the offline line still wins, as it does over every other note. Words
  heard before the error land, and the line keeps «From your voice · edit it or send»: the error's line shows only
  when nothing was heard.
- **The mapping is one pure function**, `dictationTrouble` (`dictation-view.ts`), unit-tested; the hook keeps the
  first line of an attempt and hands it with `said`.
- **Not here:** Home's «Speak instead» uses the same hook and gets `said` too, but Home's line has no quiet status of
  its own to carry it; it stays silent there for now (handoff, remaining).

## 6 · Notifications blocked after asking

- **What happens on main:** «Notify me when someone knocks» (`features/access/LobbyPanel.tsx`, `NotifyOffer`) asks
  the browser and goes, whatever the answer. Blocked, knocks only chime on the page, and nothing said so.
- **The change:** when the browser's answer is `denied`, the door says «Notifications are blocked in this browser, so
  knocks show only here.» in its quiet note (`.lobby-note`). The note is a polite live region (`aria-live`,
  `aria-atomic`) mounted empty with the offer, taking no room, so the words are heard when they come; not a
  `role="status"`, since the door's title is its one status and the door's checks find it as such. Pressing the offer
  hands the focus to the door's title (`tabIndex={-1}`) as the offer goes, rather than dropping it to the page. The offer only shows
  while the permission is `default` when the door opens, so «already denied when pressed» is a permission blocked
  after that (site settings); `requestPermission()` answers `denied` at once then, and the same line shows. Granted
  or dismissed (`default`), nothing is said, as today.
- The browser's answer is read through `Promise.resolve(...)`, so a browser whose `requestPermission` still returns
  nothing (the old callback form) says nothing rather than throwing, and a request that fails says nothing too.

## Tests, written first

- Unit: `dictation-view.test.ts`, each code to its line, and the rest to none.
- E2E, `personal.spec.ts`: the fixture's recognizer emits `?speechError=<code>` as it starts (after `?heard=` words,
  then `aborted` and `end`, as a browser does); each of the three codes shows its line under «Talk instead»,
  `service-not-allowed`, `network` and `bad-grammar` show none, words heard keep «From your voice», and the next
  attempt or a word written clears the line.
- E2E, `knock-alert.spec.ts`: a stubbed `Notification.requestPermission` answering `denied` shows the line; blocked
  between the door opening and the press, the same; granted and dismissed show none once the browser was asked; the
  live region is there, empty, before the press, and the focus lands on the door's title.
