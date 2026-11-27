import { describe, expect, it } from "vitest";
import { planRows } from "./bulk";

const HOST = "go.test";

describe("planning Links from a spreadsheet", () => {
  it("finds the columns by their names, in any order, case or marks, and ignores the rest", () => {
    const plan = planRows(
      [
        ["Link", "ĐÍCH", "ten link", "Mã link", "Nhóm", "Ghi chú"],
        ["https://go.test/x", "https://example.org/a", "Bài 1", "Bai-1", "Tạp chí", "'-ghi chú"]
      ],
      HOST
    );
    expect(plan).toEqual({
      rows: [
        {
          code: "bai-1",
          group: "Tạp chí",
          line: 2,
          name: "Bài 1",
          note: "-ghi chú",
          problem: null,
          target: "https://example.org/a"
        }
      ]
    });
  });

  it("says what is wrong with each row before anything is sent", () => {
    const plan = planRows(
      [
        ["Tên link", "Đích", "Mã link"],
        ["", "https://example.org/a", ""],
        ["Bài 2", "http://example.org/b", ""],
        ["Bài 3", "https://go.test/c", ""],
        ["Bài 4", "https://example.org/d", "a"],
        ["Bài 5", "https://example.org/e", "trung"],
        ["Bài 6", "https://example.org/f", "TRUNG"],
        ["Bài 7", "https://example.org/g", ""]
      ],
      HOST
    );
    expect("rows" in plan && plan.rows.map((row) => row.problem)).toEqual([
      { code: "bad-name" },
      { code: "bad-target", problem: "not-https" },
      { code: "bad-target", problem: "points-at-self" },
      { code: "bad-code", problem: "too-short" },
      null,
      { code: "duplicate-code" },
      null
    ]);
  });

  it("refuses a file without the two columns it needs, or without rows", () => {
    expect(
      planRows(
        [
          ["Tên link", "Ghi chú"],
          ["Bài 1", ""]
        ],
        HOST
      )
    ).toEqual({ error: "missing-columns" });
    expect(planRows([["Tên link", "Đích"]], HOST)).toEqual({ error: "no-rows" });
    expect(planRows([], HOST)).toEqual({ error: "no-rows" });
  });
});
