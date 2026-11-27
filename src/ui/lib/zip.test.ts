import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, zip } from "./zip";

describe("zip", () => {
  it("checksums as every zip tool does", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcb_f4_39_26);
  });

  it("makes a file an ordinary unzip lists and checks, Vietnamese names included", () => {
    const bytes = zip([
      { bytes: new TextEncoder().encode("<svg/>"), name: "hoi-thao-2027.svg" },
      { bytes: new Uint8Array([137, 80, 78, 71]), name: "Bài báo số 3.png" }
    ]);
    const file = join(mkdtempSync(join(tmpdir(), "zip-")), "qr.zip");
    writeFileSync(file, bytes);
    const listing = execFileSync("python3", [
      "-c",
      "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print(z.namelist())",
      file
    ]).toString();
    expect(listing).toContain("None");
    expect(listing).toContain("hoi-thao-2027.svg");
    expect(listing).toContain("Bài báo số 3.png");
  });
});
