import { describe, expect, it } from "vitest";
import { checkTarget } from "./target";

const OWN = ["go.example.edu.vn"];

describe("checkTarget", () => {
  it("accepts any https address elsewhere", () => {
    expect(checkTarget("https://journalofscience.example.org/index.php/econ-en", OWN)).toBeNull();
    expect(checkTarget("  https://forms.gle/abc  ", OWN)).toBeNull();
  });

  it("refuses anything that is not https", () => {
    expect(checkTarget("http://example.org", OWN)).toBe("not-https");
    expect(checkTarget("javascript:alert(1)", OWN)).toBe("not-https");
    expect(checkTarget("mailto:someone@example.org", OWN)).toBe("not-https");
  });

  it("refuses what is not an address at all", () => {
    expect(checkTarget("example.org/trang", OWN)).toBe("not-a-url");
    expect(checkTarget("", OWN)).toBe("not-a-url");
  });

  it("refuses an address on this system's own host, whatever its case", () => {
    expect(checkTarget("https://go.example.edu.vn/cfp-2027", OWN)).toBe("points-at-self");
    expect(checkTarget("https://GO.Example.edu.vn/x", OWN)).toBe("points-at-self");
  });

  it("refuses an address too long to be one", () => {
    expect(checkTarget(`https://example.org/${"a".repeat(2048)}`, OWN)).toBe("too-long");
  });
});
