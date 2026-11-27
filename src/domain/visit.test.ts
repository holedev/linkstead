import { describe, expect, it } from "vitest";
import { isMachineAgent, referrerSite, visitCountry, visitDay } from "./visit";

describe("isMachineAgent", () => {
  it("recognises the preview fetchers a shared Link meets first", () => {
    expect(isMachineAgent("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isMachineAgent("Mozilla/5.0 (compatible; Zalo/1.0)")).toBe(true);
    expect(isMachineAgent("TelegramBot (like TwitterBot)")).toBe(true);
    expect(isMachineAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
  });

  it("treats a missing user agent as a machine", () => {
    expect(isMachineAgent(null)).toBe(true);
    expect(isMachineAgent("")).toBe(true);
  });

  it("lets an ordinary phone browser through", () => {
    expect(
      isMachineAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe(false);
  });
});

describe("visitDay", () => {
  it("files an early-morning opening under the Organization's day, not the UTC one", () => {
    // 06:00 on 2 March in Ho Chi Minh City is 23:00 on 1 March UTC.
    expect(visitDay(new Date("2027-03-01T23:00:00Z"), "Asia/Ho_Chi_Minh")).toBe("2027-03-02");
    expect(visitDay(new Date("2027-03-01T16:59:59Z"), "Asia/Ho_Chi_Minh")).toBe("2027-03-01");
    expect(visitDay(new Date("2027-03-01T23:00:00Z"), "UTC")).toBe("2027-03-01");
  });
});

describe("where a Visit came from", () => {
  it("keeps the country the network reports, and nothing for a placeholder", () => {
    expect(visitCountry("VN")).toBe("VN");
    expect(visitCountry("jp")).toBe("JP");
    expect(visitCountry("XX")).toBe("");
    expect(visitCountry("T1")).toBe("");
    expect(visitCountry(undefined)).toBe("");
    expect(visitCountry("VNM")).toBe("");
  });

  it("keeps only the referring site's host, folded into the site people know", () => {
    expect(referrerSite("https://www.example.org/tin-tuc/bai-1?user=an", "go.test")).toBe("example.org");
    expect(referrerSite("https://l.facebook.com/l.php?u=abc", "go.test")).toBe("facebook.com");
    expect(referrerSite("https://lm.facebook.com/", "go.test")).toBe("facebook.com");
    expect(referrerSite("https://t.co/xyz", "go.test")).toBe("x.com");
    expect(referrerSite("android-app://com.google.android.gm/", "go.test")).toBe("com.google.android.gm");
  });

  it("says nothing for a scan, a typed address, its own pages or anything odd", () => {
    expect(referrerSite(null, "go.test")).toBe("");
    expect(referrerSite("", "go.test")).toBe("");
    expect(referrerSite("not a url", "go.test")).toBe("");
    expect(referrerSite("https://go.test/app/", "go.test")).toBe("");
    expect(referrerSite("ftp://files.example/", "go.test")).toBe("");
  });
});
