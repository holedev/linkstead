import { describe, expect, it } from "vitest";
import { dayIn, fromWallClock, isTimeZone, toWallClock } from "./time-zone";

describe("dayIn", () => {
  it("files an early-morning moment under the zone's day, not the UTC one", () => {
    // 06:00 on 2 March in Ho Chi Minh City is 23:00 on 1 March UTC.
    expect(dayIn(new Date("2027-03-01T23:00:00Z"), "Asia/Ho_Chi_Minh")).toBe("2027-03-02");
    expect(dayIn(new Date("2027-03-01T16:59:59Z"), "Asia/Ho_Chi_Minh")).toBe("2027-03-01");
    expect(dayIn(new Date("2027-03-01T23:00:00Z"), "UTC")).toBe("2027-03-01");
  });

  it("follows summer time", () => {
    // Berlin is UTC+1 in winter and UTC+2 in summer.
    expect(dayIn(new Date("2027-01-15T23:30:00Z"), "Europe/Berlin")).toBe("2027-01-16");
    expect(dayIn(new Date("2027-07-15T21:30:00Z"), "Europe/Berlin")).toBe("2027-07-15");
    expect(dayIn(new Date("2027-07-15T22:30:00Z"), "Europe/Berlin")).toBe("2027-07-16");
  });
});

describe("wall clocks", () => {
  it("reads a moment the way a clock in the zone shows it, and back", () => {
    const at = new Date("2027-05-20T02:15:00Z");
    expect(toWallClock(at, "Asia/Ho_Chi_Minh")).toBe("2027-05-20T09:15");
    expect(fromWallClock("2027-05-20T09:15", "Asia/Ho_Chi_Minh")?.toISOString()).toBe(at.toISOString());
  });

  it("reads a time just before the change to summer time by winter's offset", () => {
    // Berlin moves from 02:00 to 03:00 on 28 March 2027 (01:00 UTC).
    expect(fromWallClock("2027-03-28T01:30", "Europe/Berlin")?.toISOString()).toBe("2027-03-28T00:30:00.000Z");
    expect(fromWallClock("2027-03-28T03:30", "Europe/Berlin")?.toISOString()).toBe("2027-03-28T01:30:00.000Z");
  });

  it("reads a skipped time as if the clocks had not moved yet", () => {
    expect(fromWallClock("2027-03-28T02:30", "Europe/Berlin")?.toISOString()).toBe("2027-03-28T01:30:00.000Z");
  });

  it("reads a time that happens twice as the first of the two", () => {
    // Berlin goes back from 03:00 to 02:00 on 31 October 2027 (01:00 UTC).
    expect(fromWallClock("2027-10-31T02:30", "Europe/Berlin")?.toISOString()).toBe("2027-10-31T00:30:00.000Z");
  });

  it("refuses what is not a wall-clock value", () => {
    expect(fromWallClock("2027-05-20 09:15", "UTC")).toBeNull();
    expect(fromWallClock("", "UTC")).toBeNull();
  });
});

describe("isTimeZone", () => {
  it("knows IANA names and nothing else", () => {
    expect(isTimeZone("Asia/Ho_Chi_Minh")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone(7)).toBe(false);
  });
});
