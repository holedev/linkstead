import { describe, expect, it } from "vitest";
import { checkChosenCode, GENERATED_ALPHABET, generateCode, isWellFormedCode, normalizeCode } from "./link-code";

const LOOK_ALIKES = /[01lo]/;

describe("checkChosenCode", () => {
  it("accepts lowercase letters, digits and inner hyphens", () => {
    expect(checkChosenCode("cfp-2027")).toBeNull();
    expect(checkChosenCode("huong-dan-nop-bai")).toBeNull();
  });

  // A code is retyped from paper, so the spelling a person uses must not matter.
  it("treats upper case as the same code rather than refusing it", () => {
    expect(checkChosenCode("CFP-2027")).toBeNull();
    expect(normalizeCode("  CFP-2027 ")).toBe("cfp-2027");
  });

  it("refuses Vietnamese diacritics, spaces and other punctuation", () => {
    expect(checkChosenCode("hội-thảo")).toBe("bad-characters");
    expect(checkChosenCode("cfp 2027")).toBe("bad-characters");
    expect(checkChosenCode("cfp_2027")).toBe("bad-characters");
    expect(checkChosenCode("-cfp")).toBe("bad-characters");
    expect(checkChosenCode("cfp-")).toBe("bad-characters");
  });

  it("holds the length between 3 and 50", () => {
    expect(checkChosenCode("ab")).toBe("too-short");
    expect(checkChosenCode("abc")).toBeNull();
    expect(checkChosenCode("a".repeat(50))).toBeNull();
    expect(checkChosenCode("a".repeat(51))).toBe("too-long");
  });

  it("refuses the system's own paths and the administrators' reserved codes", () => {
    expect(checkChosenCode("api")).toBe("reserved");
    expect(checkChosenCode("APP")).toBe("reserved");
    expect(checkChosenCode("tuyensinh", new Set(["tuyensinh"]))).toBe("reserved");
    expect(checkChosenCode("tuyensinh")).toBeNull();
  });
});

describe("generateCode", () => {
  it("is six characters, well formed, and free of look-alikes", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateCode();
      expect(code).toHaveLength(6);
      expect(isWellFormedCode(code)).toBe(true);
      expect(code).not.toMatch(LOOK_ALIKES);
    }
  });

  // 256 is a multiple of 32, so `byte % length` favours no character. A 31-character alphabet
  // would quietly skew every generated code.
  it("uses an alphabet a random byte maps onto without bias", () => {
    expect(256 % GENERATED_ALPHABET.length).toBe(0);
    expect(new Set(GENERATED_ALPHABET).size).toBe(GENERATED_ALPHABET.length);
  });
});
