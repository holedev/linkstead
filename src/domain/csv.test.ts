import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("starts with a BOM and ends every row with CRLF", () => {
    expect(toCsv(["a", "b"], [["x", 1]])).toBe("﻿a,b\r\nx,1\r\n");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(toCsv(["a"], [['Poster "A3", sảnh A\nlầu 2']])).toBe('﻿a\r\n"Poster ""A3"", sảnh A\nlầu 2"\r\n');
  });

  it("keeps a spreadsheet from running a cell as a formula", () => {
    expect(toCsv(["a"], [["=HYPERLINK(1)"], ["-1+1"], ["@x"], ["+84"]])).toBe(
      "﻿a\r\n'=HYPERLINK(1)\r\n'-1+1\r\n'@x\r\n'+84\r\n"
    );
  });
});
