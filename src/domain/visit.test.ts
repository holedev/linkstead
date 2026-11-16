import { describe, expect, it } from "vitest";
import { isMachineAgent, visitDay } from "./visit";

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
  it("files an early-morning opening under the Vietnamese day, not the UTC one", () => {
    // 06:00 on 2 March in Vietnam is 23:00 on 1 March UTC.
    expect(visitDay(new Date("2027-03-01T23:00:00Z"))).toBe("2027-03-02");
    expect(visitDay(new Date("2027-03-01T16:59:59Z"))).toBe("2027-03-01");
  });
});
