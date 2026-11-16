/** CSV as a spreadsheet opens it: one header row, CRLF line ends, and a BOM so Excel reads Vietnamese. */

const NEEDS_QUOTES = /[",\r\n]/;
/** A cell starting like this is run as a formula by a spreadsheet; a leading quote makes it text. */
const FORMULA_START = /^[=+\-@\t\r]/;

const cell = (value: string | number): string => {
  if (typeof value === "number") {
    return String(value);
  }
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

const toCsv = (header: readonly string[], rows: readonly (readonly (string | number)[])[]): string =>
  `﻿${[header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;

export { toCsv };
