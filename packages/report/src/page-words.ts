// The words html-report-v2 adds to a report's page (report-page.ts), in English, Italian and Spanish; a report in no
// clear language (`und`) gets English. The report's own headings and the contents and sources headings stay
// printReport's. Every count says its own plural, verb included ("1 of 6 cited sources is", "2 of 6 … are"), and
// numbers and dates are written here, never by Intl, so a page's bytes do not depend on the machine that prints it.

/** What was read of a cited source, from its stored provenance. */
export type Status = 'full' | 'part' | 'snippet' | 'unread' | 'project'

export interface PageWords {
  kicker: string
  /** A UTC calendar date; `month` counts from 0. */
  date: (day: number, month: number, year: number) => string
  published: string
  version: string
  sources: string
  length: string
  /** The byline's sources: how many are cited and, when every status is known, how many were read in full. */
  cited: (n: number, full: number | null) => string
  size: (words: number, minutes: number) => string
  status: Record<Status, string>
  /** One status in the evidence mix, agreeing with its count. */
  mix: Record<Status, (k: number) => string>
  mixHead: (n: number) => string
  weakKey: string
  retrieved: (date: string) => string
  citedIn: string
  intro: string
  back: (n: number) => string
  cite: (n: number, weak: string | null) => string
  key: string
  limitations: string
  limitsLead: string
  method: string
  gate: (n: number) => string
  snippets: (k: number, n: number) => string
  partial: (k: number, n: number) => string
  unread: (k: number, n: number) => string
  noCites: string
  review: readonly [string, string]
  noLimits: string
  noRecord: string
  image: string
  table: string
  colophon: string
  hash: string
}

const MONTHS = {
  en: 'January February March April May June July August September October November December'.split(' '),
  it: 'gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre'.split(' '),
  es: 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(' '),
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
/** Thousands grouped with `sep`, from `from` on (English groups 1,000; Italian and Spanish 10.000). */
const group = (n: number, sep: string, from: number) =>
  n >= from ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep) : String(n)

const EN: PageWords = {
  kicker: 'Sophia · Research report',
  date: (d, m, y) => `${d} ${MONTHS.en[m] ?? ''} ${y}`,
  published: 'Published',
  version: 'Version',
  sources: 'Sources',
  length: 'Length',
  cited: (n, full) => `${n} cited${full === null ? '' : `, ${full} read in full`}`,
  size: (w, m) => `${group(w, ',', 1000)} ${plural(w, 'word', 'words')} · ${m} min read`,
  status: {
    full: 'Read in full',
    part: 'Read in part',
    snippet: 'Snippet only',
    unread: 'Not read',
    project: 'From the project',
  },
  mix: {
    full: () => 'read in full',
    part: () => 'read in part',
    snippet: (k) => `snippet only (${plural(k, 'a search listing', 'search listings')})`,
    unread: () => 'not read',
    project: () => 'from the project',
  },
  mixHead: (n) => `${n} ${plural(n, 'source', 'sources')}`,
  weakKey: 'A dotted number in the text cites a source read only in part, only as a search snippet, or not at all.',
  retrieved: (d) => `retrieved ${d}`,
  citedIn: 'cited in',
  intro: 'Introduction',
  back: (n) => `Back to citation ${n}`,
  cite: (n, weak) => `Source ${n}${weak ? `, ${weak}` : ''}`,
  key: 'Sources cited',
  limitations: 'Limitations',
  limitsLead: 'As stated when this version was published.',
  method: 'How this report was made',
  gate: (n) =>
    `${n === 1 ? 'The cited source is one' : `All ${n} cited sources are ones`} this task retrieved or was given: ` +
    `Sophia checked ${plural(n, 'it', 'each one')} when this version was published.`,
  snippets: (k, n) =>
    `${k} of ${n} cited ${plural(n, 'source', 'sources')} ${plural(k, 'is a search listing', 'are search listings')} ` +
    `(snippets only), not ${plural(k, 'a page', 'pages')} that ${plural(k, 'was', 'were')} opened.`,
  partial: (k, n) =>
    `${k} of ${n} cited ${plural(n, 'source', 'sources')} ${plural(k, 'was', 'were')} read only in part.`,
  unread: (k, n) => `${k} of ${n} cited ${plural(n, 'source', 'sources')} could not be read.`,
  noCites: 'This report cites no sources.',
  review: [
    'Not independently reviewed.',
    'Sophia checks that each citation points to a source the task could read, not that each claim matches its source.',
  ],
  noLimits: 'This report states no limitations.',
  noRecord: 'This version does not record how many searches and page reads the research used.',
  image: 'Image not included',
  table: 'Table',
  colophon: 'Sophia research report',
  hash: 'Markdown sha256',
}

const IT: PageWords = {
  kicker: 'Sophia · Rapporto di ricerca',
  date: (d, m, y) => `${d} ${MONTHS.it[m] ?? ''} ${y}`,
  published: 'Pubblicato',
  version: 'Versione',
  sources: 'Fonti',
  length: 'Lunghezza',
  cited: (n, full) =>
    `${n} ${plural(n, 'citata', 'citate')}${full === null ? '' : `, ${full} ${plural(full, 'letta', 'lette')} per intero`}`,
  size: (w, m) => `${group(w, '.', 10000)} parole · ${m} min di lettura`,
  status: {
    full: 'Letta per intero',
    part: 'Letta in parte',
    snippet: 'Solo anteprima',
    unread: 'Non letta',
    project: 'Dal progetto',
  },
  mix: {
    full: (k) => `${plural(k, 'letta', 'lette')} per intero`,
    part: (k) => `${plural(k, 'letta', 'lette')} in parte`,
    snippet: (k) => `solo anteprima (${plural(k, 'un elenco', 'elenchi')} di ricerca)`,
    unread: (k) => `non ${plural(k, 'letta', 'lette')}`,
    project: () => 'dal progetto',
  },
  mixHead: (n) => `${n} ${plural(n, 'fonte', 'fonti')}`,
  weakKey:
    'Un numero punteggiato nel testo cita una fonte letta solo in parte, solo come anteprima di ricerca o non letta.',
  // The article elides before a day said with a vowel: l'8, l'11.
  retrieved: (d) => `consultata ${/^(8|11) /.test(d) ? "l'" : 'il '}${d}`,
  citedIn: 'citata in',
  intro: 'Introduzione',
  back: (n) => `Torna alla citazione ${n}`,
  cite: (n, weak) => `Fonte ${n}${weak ? `, ${weak}` : ''}`,
  key: 'Fonti citate',
  limitations: 'Limiti',
  limitsLead: 'Così come dichiarati al momento della pubblicazione di questa versione.',
  method: 'Come è stato fatto questo rapporto',
  gate: (n) =>
    `Questo compito ha recuperato o ricevuto ${n === 1 ? 'la fonte citata' : `tutte le ${n} fonti citate`}: ` +
    'Sophia lo ha verificato alla pubblicazione di questa versione.',
  snippets: (k, n) =>
    `${k} ${plural(k, 'fonte citata', 'fonti citate')} su ${n} ` +
    `${plural(k, 'è un elenco di ricerca', 'sono elenchi di ricerca')} (solo anteprime), ` +
    `non ${plural(k, 'una pagina aperta', 'pagine aperte')}.`,
  partial: (k, n) =>
    `${k} ${plural(k, 'fonte citata', 'fonti citate')} su ${n} ${plural(k, 'è stata letta', 'sono state lette')} solo in parte.`,
  unread: (k, n) =>
    `${k} ${plural(k, 'fonte citata', 'fonti citate')} su ${n} non ${plural(k, 'è stata letta', 'sono state lette')}.`,
  noCites: 'Questo rapporto non cita fonti.',
  review: [
    'Nessuna revisione indipendente.',
    'Sophia verifica che ogni citazione rimandi a una fonte che il compito poteva leggere, non che ogni affermazione ' +
      'corrisponda alla sua fonte.',
  ],
  noLimits: 'Questo rapporto non dichiara limiti.',
  noRecord: 'Questa versione non registra quante ricerche e letture di pagine ha usato la ricerca.',
  image: 'Immagine non inclusa',
  table: 'Tabella',
  colophon: 'Rapporto di ricerca Sophia',
  hash: 'Markdown sha256',
}

const ES: PageWords = {
  kicker: 'Sophia · Informe de investigación',
  date: (d, m, y) => `${d} de ${MONTHS.es[m] ?? ''} de ${y}`,
  published: 'Publicado',
  version: 'Versión',
  sources: 'Fuentes',
  length: 'Extensión',
  cited: (n, full) =>
    `${n} ${plural(n, 'citada', 'citadas')}${full === null ? '' : `, ${full} ${plural(full, 'leída completa', 'leídas completas')}`}`,
  size: (w, m) => `${group(w, '.', 10000)} palabras · ${m} min de lectura`,
  status: {
    full: 'Leída completa',
    part: 'Leída en parte',
    snippet: 'Solo fragmento',
    unread: 'No leída',
    project: 'Del proyecto',
  },
  mix: {
    full: (k) => plural(k, 'leída completa', 'leídas completas'),
    part: (k) => `${plural(k, 'leída', 'leídas')} en parte`,
    snippet: (k) => `solo fragmento (${plural(k, 'una lista', 'listas')} de búsqueda)`,
    unread: (k) => plural(k, 'no leída', 'no leídas'),
    project: () => 'del proyecto',
  },
  mixHead: (n) => `${n} ${plural(n, 'fuente', 'fuentes')}`,
  weakKey:
    'Un número punteado en el texto cita una fuente leída solo en parte, solo como fragmento de búsqueda o no leída.',
  retrieved: (d) => `consultada el ${d}`,
  citedIn: 'citada en',
  intro: 'Introducción',
  back: (n) => `Volver a la cita ${n}`,
  cite: (n, weak) => `Fuente ${n}${weak ? `, ${weak}` : ''}`,
  key: 'Fuentes citadas',
  limitations: 'Limitaciones',
  limitsLead: 'Tal como se declararon al publicar esta versión.',
  method: 'Cómo se hizo este informe',
  gate: (n) =>
    `Esta tarea obtuvo o recibió ${n === 1 ? 'la fuente citada' : `las ${n} fuentes citadas`}: ` +
    'Sophia lo comprobó al publicar esta versión.',
  snippets: (k, n) =>
    `${k} de ${n} ${plural(n, 'fuente citada', 'fuentes citadas')} ` +
    `${plural(k, 'es una lista de búsqueda', 'son listas de búsqueda')} (solo fragmentos), ` +
    `no ${plural(k, 'una página abierta', 'páginas abiertas')}.`,
  partial: (k, n) =>
    `${k} de ${n} ${plural(n, 'fuente citada', 'fuentes citadas')} se ${plural(k, 'leyó', 'leyeron')} solo en parte.`,
  unread: (k, n) =>
    `${k} de ${n} ${plural(n, 'fuente citada', 'fuentes citadas')} no se ${plural(k, 'pudo', 'pudieron')} leer.`,
  noCites: 'Este informe no cita fuentes.',
  review: [
    'Sin revisión independiente.',
    'Sophia comprueba que cada cita remita a una fuente que la tarea podía leer, no que cada afirmación coincida con ' +
      'su fuente.',
  ],
  noLimits: 'Este informe no declara limitaciones.',
  noRecord: 'Esta versión no registra cuántas búsquedas y lecturas de páginas usó la investigación.',
  image: 'Imagen no incluida',
  table: 'Tabla',
  colophon: 'Informe de investigación de Sophia',
  hash: 'Markdown sha256',
}

const WORDS: Record<string, PageWords> = { en: EN, it: IT, es: ES }

/** The page's words for a report's language (reportLanguage's en, it, es or und). */
export const pageWords = (language: string): PageWords => WORDS[language] ?? EN
