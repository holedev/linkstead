import { describe, expect, it } from "vitest";
import { browserFamily, deviceClass, isMachineAgent, referrerSite, visitCountry, visitDay } from "./visit";

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

describe("the device and browser a Visit came from", () => {
  const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  const ANDROID_TABLET =
    "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const IPAD =
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const WINDOWS_EDGE =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
  const MAC_FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:121.0) Gecko/20100101 Firefox/121.0";
  const ZALO =
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 Zalo android/12100726 ZaloTheme/light ZaloLanguage/vi";
  const MESSENGER =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/440.0]";
  const SAMSUNG =
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";

  it("keeps only the kind of device, a tablet before a phone", () => {
    expect(deviceClass(IPHONE_SAFARI)).toBe("mobile");
    expect(deviceClass(ANDROID_CHROME)).toBe("mobile");
    expect(deviceClass(ANDROID_TABLET)).toBe("tablet");
    expect(deviceClass(IPAD)).toBe("tablet");
    expect(deviceClass(WINDOWS_EDGE)).toBe("desktop");
    expect(deviceClass(MAC_FIREFOX)).toBe("desktop");
    expect(deviceClass("curl/8.0")).toBe("other");
    expect(deviceClass(undefined)).toBe("other");
  });

  it("keeps only the browser's family, naming the app a Link was opened inside", () => {
    expect(browserFamily(IPHONE_SAFARI)).toBe("safari");
    expect(browserFamily(ANDROID_CHROME)).toBe("chrome");
    expect(browserFamily(WINDOWS_EDGE)).toBe("edge");
    expect(browserFamily(MAC_FIREFOX)).toBe("firefox");
    expect(browserFamily(SAMSUNG)).toBe("samsung");
    expect(browserFamily(ZALO)).toBe("zalo");
    expect(browserFamily(MESSENGER)).toBe("facebook");
    expect(browserFamily("curl/8.0")).toBe("other");
  });
});
