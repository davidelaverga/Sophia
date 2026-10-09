// Ajv's ucs2length helper (ajv/dist/runtime/ucs2length, Ajv 8.20.0), inlined into standalone validator code so the
// generated module needs no runtime require: string lengths count code points exactly as the API's Ajv does.

const UCS2LENGTH = `(function ucs2length(str) {
  const len = str.length;
  let length = 0;
  let pos = 0;
  let value;
  while (pos < len) {
    length++;
    value = str.charCodeAt(pos++);
    if (value >= 0xd800 && value <= 0xdbff && pos < len) {
      value = str.charCodeAt(pos);
      if ((value & 0xfc00) === 0xdc00) pos++;
    }
  }
  return length;
})`

/** Standalone Ajv code with every require of the helper replaced by the helper itself. */
export const inlineUcs2length = (code: string): string =>
  code.replaceAll('require("ajv/dist/runtime/ucs2length").default', UCS2LENGTH)
