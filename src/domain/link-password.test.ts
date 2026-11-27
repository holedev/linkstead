import { describe, expect, it } from "vitest";
import { checkLinkPassword, hashLinkPassword, matchesLinkPassword } from "./link-password";

describe("a Link's password", () => {
  it("is 4 to 100 characters", () => {
    expect(checkLinkPassword("abc")).toBe("too-short");
    expect(checkLinkPassword("lop1")).toBeNull();
    expect(checkLinkPassword("x".repeat(101))).toBe("too-long");
  });

  it("is kept salted, recognised again, and nothing else is", async () => {
    const stored = await hashLinkPassword("hội-đồng-2027");
    expect(stored).not.toContain("hội-đồng-2027");
    expect(stored).not.toBe(await hashLinkPassword("hội-đồng-2027"));
    expect(await matchesLinkPassword("hội-đồng-2027", stored)).toBe(true);
    expect(await matchesLinkPassword("hoi-dong-2027", stored)).toBe(false);
    expect(await matchesLinkPassword("", stored)).toBe(false);
  });

  it("refuses anything it did not write", async () => {
    expect(await matchesLinkPassword("x", "")).toBe(false);
    expect(await matchesLinkPassword("x", "sha1$1$abc$def")).toBe(false);
  });
});
