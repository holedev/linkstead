import { describe, expect, it } from "vitest";
import { isUniversityEmail, normalizeEmail } from "./email";
import { checkNewPassword, isStretched, sealPassword, stretchPassword, verifyPassword } from "./password";
import { hashSecret, newSecret } from "./secret";

const HEX_64 = /^[0-9a-f]{64}$/;
const URL_SAFE = /^oul_[A-Za-z0-9_-]{43}$/;

describe("password", () => {
  it("is stretched the same way every time for one account, and differently for another", async () => {
    const stretched = await stretchPassword("mot-mat-khau-du-dai", " Ai-Do@OU.edu.vn");
    expect(stretched).toBe(await stretchPassword("mot-mat-khau-du-dai", "ai-do@ou.edu.vn"));
    expect(stretched).not.toBe(await stretchPassword("mot-mat-khau-du-dai", "nguoi-khac@ou.edu.vn"));
    expect(stretched).not.toBe(await stretchPassword("mot-mat-khau-du-daI", "ai-do@ou.edu.vn"));
    expect(isStretched(stretched)).toBe(true);
  });

  it("verifies the password it sealed and no other", async () => {
    const right = await stretchPassword("mot-mat-khau-du-dai", "ai-do@ou.edu.vn");
    const wrong = await stretchPassword("mot-mat-khau-du-daI", "ai-do@ou.edu.vn");
    const stored = await sealPassword(right);
    expect(await verifyPassword(right, stored)).toBe(true);
    expect(await verifyPassword(wrong, stored)).toBe(false);
  });

  it("salts, so the same password is never stored the same way twice, and is not stored as sent", async () => {
    const stretched = await stretchPassword("mot-mat-khau-du-dai", "ai-do@ou.edu.vn");
    const stored = await sealPassword(stretched);
    expect(stored).not.toBe(await sealPassword(stretched));
    expect(stored).not.toContain(stretched);
  });

  it("refuses a raw password and a stored value it does not recognise, instead of throwing", async () => {
    const stretched = await stretchPassword("mot-mat-khau-du-dai", "ai-do@ou.edu.vn");
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
    const a = newSecret("oul_");
    expect(a).toMatch(URL_SAFE);
    expect(newSecret("oul_")).not.toBe(a);
  });

  it("hashes to the same value every time, so a stored hash can be looked up", async () => {
    expect(await hashSecret("abc")).toBe(await hashSecret("abc"));
    expect(await hashSecret("abc")).toMatch(HEX_64);
  });
});

describe("email", () => {
  it("accepts the university's addresses whatever their case", () => {
    expect(isUniversityEmail("Someone@OU.edu.vn ")).toBe(true);
    expect(normalizeEmail(" Someone@OU.edu.vn")).toBe("someone@ou.edu.vn");
  });

  it("refuses other domains, subdomains and look-alikes", () => {
    expect(isUniversityEmail("someone@gmail.com")).toBe(false);
    expect(isUniversityEmail("someone@student.ou.edu.vn")).toBe(false);
    expect(isUniversityEmail("someone@evil-ou.edu.vn")).toBe(false);
    expect(isUniversityEmail("@ou.edu.vn")).toBe(false);
    expect(isUniversityEmail("a b@ou.edu.vn")).toBe(false);
  });
});
