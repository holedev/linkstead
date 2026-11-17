import { unguard } from "../../domain/csv";
import { checkChosenCode, normalizeCode } from "../../domain/link-code";
import { checkTarget } from "../../domain/target";
import { fold } from "./link-filter";

/**
 * Many Links from one spreadsheet: which column is which, and what is wrong with a row before
 * anything is sent. The server still decides - a code may be taken, a Đích listed unsafe - but a
 * typo is better caught here, in the list, than as a failure after the others were made.
 */

type Field = "name" | "target" | "code" | "note" | "group";

/** Column names a person or the system's own export uses, compared without case or marks. */
const HEADERS: Record<string, Field> = {
  code: "code",
  "dia chi dich": "target",
  dich: "target",
  "ghi chu": "note",
  group: "group",
  ma: "code",
  "ma link": "code",
  name: "name",
  nhom: "group",
  note: "note",
  target: "target",
  ten: "name",
  "ten link": "name",
  url: "target"
};

const MAX_ROWS = 500;

type PlannedRow = {
  /** The row's line in the file, counting the header as 1, as a spreadsheet shows it. */
  line: number;
  name: string;
  target: string;
  code: string;
  note: string;
  group: string;
  /** Why it cannot be made, as `{ code, problem }` for `messages.ts`, or null. */
  problem: { code: string; problem?: string } | null;
};

type Plan = { error: "no-rows" | "missing-columns" | "too-many-rows" } | { rows: PlannedRow[] };

const problemOf = (
  row: Omit<PlannedRow, "problem" | "line">,
  ownHost: string,
  seen: Set<string>
): PlannedRow["problem"] => {
  if (!row.name || row.name.length > 200) {
    return { code: "bad-name" };
  }
  const target = checkTarget(row.target, [ownHost]);
  if (target) {
    return { code: "bad-target", problem: target };
  }
  if (row.note.length > 1000) {
    return { code: "bad-note" };
  }
  if (row.code) {
    const code = checkChosenCode(row.code);
    if (code) {
      return { code: "bad-code", problem: code };
    }
    if (seen.has(row.code)) {
      return { code: "duplicate-code" };
    }
  }
  return null;
};

/** Reads the parsed rows of a file - its header first - into the Links it asks for. */
const planRows = (rows: readonly string[][], ownHost: string): Plan => {
  const [header, ...body] = rows;
  if (!header || body.length === 0) {
    return { error: "no-rows" };
  }
  if (body.length > MAX_ROWS) {
    return { error: "too-many-rows" };
  }
  const columns = header.map((title) => HEADERS[fold(title.trim())]);
  if (!(columns.includes("name") && columns.includes("target"))) {
    return { error: "missing-columns" };
  }
  const read = (row: readonly string[], field: Field) => {
    const index = columns.indexOf(field);
    return index < 0 ? "" : unguard((row[index] ?? "").trim());
  };
  const seen = new Set<string>();
  return {
    rows: body.map((row, index) => {
      const planned = {
        code: normalizeCode(read(row, "code")),
        group: read(row, "group"),
        name: read(row, "name"),
        note: read(row, "note"),
        target: read(row, "target")
      };
      const problem = problemOf(planned, ownHost, seen);
      if (planned.code) {
        seen.add(planned.code);
      }
      return { ...planned, line: index + 2, problem };
    })
  };
};

/** A file to start from: the columns read, and one example row. */
const TEMPLATE_HEADER = ["Tên link", "Đích", "Mã link", "Nhóm", "Ghi chú"];
const TEMPLATE_ROW = [
  "Bài báo số 3 - Tạp chí 2027",
  "https://journalofscience.ou.edu.vn/index.php/vi/article/view/3",
  "",
  "Tạp chí 2027",
  "Bỏ trống Mã link để hệ thống tự sinh"
];

export { MAX_ROWS, type Plan, type PlannedRow, planRows, TEMPLATE_HEADER, TEMPLATE_ROW };
