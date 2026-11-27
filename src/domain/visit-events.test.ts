import { describe, expect, it } from "vitest";
import { countsQuery, quarterOf, readCounts, toDataPoint } from "./visit-events";

const FROM = new Date("2027-03-01T00:00:00Z");
const TO = new Date("2027-03-01T00:15:00Z");

describe("a Visit as an event", () => {
  it("carries the Link as its index and nothing about the visitor", () => {
    const point = toDataPoint({ browser: "zalo", country: "VN", device: "mobile", linkId: 7, referrer: "", unitId: 2 });
    expect(point).toEqual({ blobs: ["2", "VN", "", "mobile", "zalo"], doubles: [7, 2], indexes: ["7"] });
  });

  it("is read back by quarter-hour, between two moments, for a Link or a Unit", () => {
    expect(countsQuery("visits", { from: FROM, linkId: 7, to: TO })).toBe(
      "SELECT toUnixTimestamp(toStartOfFifteenMinutes(timestamp)) AS quarter, double1 AS link, " +
        "blob2 AS country, blob3 AS referrer, blob4 AS device, blob5 AS browser, SUM(_sample_interval) AS visits " +
        "FROM visits WHERE timestamp >= toDateTime(1803859200) AND timestamp < toDateTime(1803860100) AND double1 = 7 " +
        "GROUP BY quarter, link, country, referrer, device, browser FORMAT JSON"
    );
    expect(countsQuery("visits", { from: FROM, to: TO, unitId: 2 })).toContain("AND double2 = 2 GROUP BY");
  });

  it("takes no dataset name that could carry SQL", () => {
    expect(() => countsQuery("visits; DROP", { from: FROM, to: TO })).toThrow();
  });

  it("reads the answer whatever type its numbers come as, and drops what is not a count", () => {
    const answer = {
      data: [
        {
          browser: "safari",
          country: "VN",
          device: "mobile",
          link: "7",
          quarter: "1803859200",
          referrer: "",
          visits: "3"
        },
        {
          browser: "chrome",
          country: "",
          device: "desktop",
          link: 8,
          quarter: 1_803_859_200,
          referrer: "x.com",
          visits: 1.6
        },
        { link: "not a link", quarter: 1_803_859_200, visits: 4 },
        { link: 9, quarter: 1_803_859_200, visits: 0 }
      ]
    };
    expect(readCounts(answer)).toEqual([
      { browser: "safari", count: 3, country: "VN", device: "mobile", linkId: 7, quarter: FROM, referrer: "" },
      { browser: "chrome", count: 2, country: "", device: "desktop", linkId: 8, quarter: FROM, referrer: "x.com" }
    ]);
    expect(readCounts({ errors: ["bad"] })).toEqual([]);
  });

  it("rounds a moment down to its quarter-hour", () => {
    expect(quarterOf(new Date("2027-03-01T00:14:59Z"))).toEqual(FROM);
  });
});
