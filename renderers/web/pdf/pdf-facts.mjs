// What the printed bytes say about themselves, read without a PDF library: the `%PDF-` header, the `%%EOF` trailer,
// the page objects and the page tree's count, and the raster images embedded. Chromium (Skia) writes object
// dictionaries uncompressed, so these are found by their keys; when the page objects and the page tree disagree the
// page count is unknown (null), never a guess. Blank and short pages need text extraction (S5b) and stay unknown.

/**
 * @typedef {{ header: string | null, eof: boolean, pageCount: number | null, pdfImages: number }} PdfFacts
 */

/**
 * @param {Uint8Array} bytes
 * @returns {PdfFacts}
 */
export function pdfFacts(bytes) {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')
  const header = /^%PDF-\d\.\d/.exec(text)?.[0] ?? null
  const eof = /%%EOF\s*$/.test(text.slice(-1024))
  const pages = (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length
  const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1]))
  const declared = counts.length > 0 ? Math.max(...counts) : null
  const pageCount = pages > 0 && (declared === null || declared === pages) ? pages : null
  const pdfImages = (text.match(/\/Subtype\s*\/Image\b/g) ?? []).length
  return { header, eof, pageCount, pdfImages }
}
