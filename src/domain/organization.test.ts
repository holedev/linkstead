import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "./email";
import { checkSettings, contrastWithWhite, DEFAULT_SETTINGS } from "./organization";

describe("checkSettings", () => {
  it("lays what is given over the current settings", () => {
    const result = checkSettings({ language: "vi", name: "  Example University " }, DEFAULT_SETTINGS);
    expect(result).toEqual({ settings: { ...DEFAULT_SETTINGS, language: "vi", name: "Example University" } });
  });

  it("keeps email domains in one spelling, once each", () => {
    const result = checkSettings(
      { emailDomains: ["@Example.ORG", "example.org", " staff.example.org. "] },
      DEFAULT_SETTINGS
    );
    expect(result).toEqual({ settings: { ...DEFAULT_SETTINGS, emailDomains: ["example.org", "staff.example.org"] } });
  });

  it("refuses what is not a domain", () => {
    expect(checkSettings({ emailDomains: ["not a domain"] }, DEFAULT_SETTINGS)).toEqual({
      problem: "bad-email-domains"
    });
    expect(checkSettings({ emailDomains: "example.org" }, DEFAULT_SETTINGS)).toEqual({ problem: "bad-email-domains" });
  });

  it("refuses an empty name, an unknown language and an unknown time zone", () => {
    expect(checkSettings({ name: " " }, DEFAULT_SETTINGS)).toEqual({ problem: "bad-name" });
    expect(checkSettings({ language: "fr" }, DEFAULT_SETTINGS)).toEqual({ problem: "bad-language" });
    expect(checkSettings({ timeZone: "Mars/Olympus" }, DEFAULT_SETTINGS)).toEqual({ problem: "bad-time-zone" });
  });

  it("takes a colour only when white text on it stays readable", () => {
    expect(checkSettings({ brandColor: "#1D4ED8" }, DEFAULT_SETTINGS)).toEqual({
      settings: { ...DEFAULT_SETTINGS, brandColor: "#1d4ed8" }
    });
    expect(checkSettings({ brandColor: "#ffd700" }, DEFAULT_SETTINGS)).toEqual({ problem: "bad-brand-color" });
    expect(checkSettings({ brandColor: "blue" }, DEFAULT_SETTINGS)).toEqual({ problem: "bad-brand-color" });
  });

  it("keeps a time zone spelled as it was given, not as the runtime would rename it", () => {
    expect(checkSettings({ timeZone: "Asia/Ho_Chi_Minh" }, DEFAULT_SETTINGS)).toEqual({
      settings: { ...DEFAULT_SETTINGS, timeZone: "Asia/Ho_Chi_Minh" }
    });
  });

  it("starts from a colour that passes its own rule", () => {
    expect(contrastWithWhite(DEFAULT_SETTINGS.brandColor)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("isAllowedEmail", () => {
  it("takes exactly one of the Organization's domains", () => {
    const domains = ["example.org", "example.edu"];
    expect(isAllowedEmail("an@example.org", domains)).toBe(true);
    expect(isAllowedEmail(" An@Example.EDU ", domains)).toBe(true);
    expect(isAllowedEmail("an@mail.example.org", domains)).toBe(false);
    expect(isAllowedEmail("an@evil-example.org", domains)).toBe(false);
    expect(isAllowedEmail("an@example.com", domains)).toBe(false);
  });

  it("takes any well-formed address when the Organization names no domain", () => {
    expect(isAllowedEmail("an@gmail.com", [])).toBe(true);
    expect(isAllowedEmail("not an email", [])).toBe(false);
  });
});
