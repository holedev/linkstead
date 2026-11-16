import { describe, expect, it } from "vitest";
import { isUniversityEmail, normalizeEmail } from "./email";
import { checkNewPassword, hashPassword, verifyPassword } from "./password";
import { hashSecret, newSecret } from "./secret";

const HEX_64 = /^[0-9a-f]{64}$/;
const URL_SAFE = /^oul_[A-Za-z0-9_-]{43}$/;

describe("password", () => {
  it("verifies the password it hashed and no other", async () => {
    const stored = await hashPassword("mot-mat-khau-du-dai");
    expect(await verifyPassword("mot-mat-khau-du-dai", stored)).toBe(true);
    expect(await verifyPassword("mot-mat-khau-du-daI", stored)).toBe(false);
  });

  it("salts, so the same password never hashes the same way twice", async () => {
    expect(await hashPassword("mot-mat-khau-du-dai")).not.toBe(await hashPassword("mot-mat-khau-du-dai"));
  });

  it("refuses a stored value it does not recognise instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$10$abc$def")).toBe(false);
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
