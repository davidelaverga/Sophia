// Words said to Sophia from Home (Welcome.tsx), handed to Personal's composer to go as its own (PersonalComposer,
// useHanded). Pure, so the composer and its checks read the same answer.

/** Words said to Sophia from Home, on their way to the composer; `id` tells one handing from the next. */
export interface Handed {
  words: string
  id: number
}

/**
 * What the composer does with words handed to it: nothing new, or one on its way (it waits, the next goes after);
 * send them as the field's would, once the space can take them; else keep them in the field, said, to send.
 */
export function handing(
  handed: Handed | null,
  taken: number,
  ready: boolean,
  busy: boolean,
): 'none' | 'wait' | 'send' | 'keep' {
  if (!handed || handed.id === taken) return 'none'
  if (busy) return 'wait'
  return ready ? 'send' : 'keep'
}
