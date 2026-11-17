import { describe, expect, it } from "vitest";
import { parseCsv, toCsv, unguard } from "./csv";

describe("reading CSV", () => {
  it("reads back what the system writes, quotes, commas, line breaks and BOM included", () => {
    const header = ["Mã link", "Tên link", "Ghi chú"];
    const body = [
      ["so-3", 'Poster "A3", sảnh A', "dòng 1\ndòng 2"],
      ["", "Chỉ có tên", ""]
    ];
    expect(parseCsv(toCsv(header, body))).toEqual([header, ...body]);
  });

  it("takes the semicolons Excel saves under Vietnamese settings", () => {
    expect(parseCsv("Tên link;Đích\r\nBài 1;https://ou.edu.vn/a,b\r\n")).toEqual([
      ["Tên link", "Đích"],
      ["Bài 1", "https://ou.edu.vn/a,b"]
    ]);
  });

  it("drops blank lines, and keeps a last line with no line end", () => {
    expect(parseCsv("a,b\n\n,\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("undoes the guard against formulas, and only that", () => {
    expect(unguard("'=1+1")).toBe("=1+1");
    expect(unguard("'-ghi chú")).toBe("-ghi chú");
    expect(unguard("'trích dẫn")).toBe("'trích dẫn");
  });
});
