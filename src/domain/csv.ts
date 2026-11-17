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

/**
 * Reads CSV as a spreadsheet saves it: quoted cells with "" for a quote, CRLF or LF, a BOM or not.
 * The separator is a comma or - as Excel saves under Vietnamese settings - a semicolon, whichever
 * the first line has more of outside quotes. Blank lines are dropped.
 */
const separatorOf = (text: string): "," | ";" => {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === "\n" || char === "\r")) {
      break;
    } else if (!quoted && char === ",") {
      commas += 1;
    } else if (!quoted && char === ";") {
      semicolons += 1;
    }
  }
  return semicolons > commas ? ";" : ",";
};

const parseCsv = (raw: string): string[][] => {
  const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const separator = separatorOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const endRow = () => {
    row.push(value);
    if (row.some((one) => one.trim() !== "")) {
      rows.push(row);
    }
    row = [];
    value = "";
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      endRow();
    } else if (char !== "\r") {
      value += char;
    }
  }
  if (value !== "" || row.length > 0) {
    endRow();
  }
  return rows;
};

/** A cell as it was before `toCsv` guarded it against being run as a formula. */
const unguard = (value: string): string =>
  value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;

export { parseCsv, toCsv, unguard };
