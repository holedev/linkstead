import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email";
import { checkNewPassword, isStretched, sealPassword, stretchPassword, verifyPassword } from "./password";
import { hashSecret, newSecret } from "./secret";

const HEX_64 = /^[0-9a-f]{64}$/;
const URL_SAFE = /^lsk_[A-Za-z0-9_-]{43}$/;

describe("password", () => {
  it("is stretched the same way every time for one account, and differently for another", async () => {
    const stretched = await stretchPassword("mot-mat-khau-du-dai", " Ai-Do@Example.ORG");
    expect(stretched).toBe(await stretchPassword("mot-mat-khau-du-dai", "ai-do@example.org"));
    expect(stretched).not.toBe(await stretchPassword("mot-mat-khau-du-dai", "nguoi-khac@example.org"));
    expect(stretched).not.toBe(await stretchPassword("mot-mat-khau-du-daI", "ai-do@example.org"));
    expect(isStretched(stretched)).toBe(true);
  });

  it("verifies the password it sealed and no other", async () => {
    const right = await stretchPassword("mot-mat-khau-du-dai", "ai-do@example.org");
    const wrong = await stretchPassword("mot-mat-khau-du-daI", "ai-do@example.org");
    const stored = await sealPassword(right);
    expect(await verifyPassword(right, stored)).toBe(true);
    expect(await verifyPassword(wrong, stored)).toBe(false);
  });

  it("salts, so the same password is never stored the same way twice, and is not stored as sent", async () => {
    const stretched = await stretchPassword("mot-mat-khau-du-dai", "ai-do@example.org");
    const stored = await sealPassword(stretched);
    expect(stored).not.toBe(await sealPassword(stretched));
    expect(stored).not.toContain(stretched);
  });

  it("refuses a raw password and a stored value it does not recognise, instead of throwing", async () => {
    const stretched = await stretchPassword("mot-mat-khau-du-dai", "ai-do@example.org");
    expect(isStretched("mot-mat-khau-du-dai")).toBe(false);
    expect(await verifyPassword("mot-mat-khau-du-dai", await sealPassword(stretched))).toBe(false);
    expect(await verifyPassword(stretched, "")).toBe(false);
    expect(await verifyPassword(stretched, "pbkdf2-sha256$100000$abc$def")).toBe(false);
  });

  it("asks for at least twelve characters", () => {
    expect(checkNewPassword("mười-một-ký")).toBe("too-short");
    expect(checkNewPassword("mười-hai-kýt")).toBeNull();
  });
});

describe("secret", () => {
  it("is long, url-safe, prefixed, and different every time", () => {
    const a = newSecret("lsk_");
    expect(a).toMatch(URL_SAFE);
    expect(newSecret("lsk_")).not.toBe(a);
  });

  it("hashes to the same value every time, so a stored hash can be looked up", async () => {
    expect(await hashSecret("abc")).toBe(await hashSecret("abc"));
    expect(await hashSecret("abc")).toMatch(HEX_64);
  });
});

describe("email", () => {
  it("is kept in one spelling, whatever its case", () => {
    expect(normalizeEmail(" Someone@Example.ORG")).toBe("someone@example.org");
  });
});
