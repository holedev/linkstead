/**
 * Visits as events in Workers Analytics Engine (ADR-0008): what one event carries, how it is laid
 * out as a data point, and the one query that reads them back. Pure - the Worker does the I/O.
 *
 * An event carries nothing about the visitor beyond what a Visit is counted by: no IP address, no
 * user agent, no full referring address. Its time is the one thing D1 does not keep, and it lives
 * only as long as Analytics Engine keeps it, three months.
 */

type VisitEvent = {
  linkId: number;
  unitId: number;
  country: string;
  referrer: string;
  device: string;
  browser: string;
};

/** How many Visits a Link had in one quarter-hour, by everything a Visit is counted by. */
type EventCount = Omit<VisitEvent, "unitId"> & { quarter: Date; count: number };

/** A data point as `writeDataPoint` takes it. The index is the Link, the key the sampling keeps apart. */
const toDataPoint = (event: VisitEvent) => ({
  blobs: [String(event.unitId), event.country, event.referrer, event.device, event.browser],
  doubles: [event.linkId, event.unitId],
  indexes: [String(event.linkId)]
});

const DATASET = /^[A-Za-z_][A-Za-z0-9_]*$/;
const QUARTER_MS = 15 * 60 * 1000;

/** A moment rounded down to its quarter-hour, the smallest stretch an event is read back in. */
const quarterOf = (at: Date): Date => new Date(Math.floor(at.getTime() / QUARTER_MS) * QUARTER_MS);

const seconds = (at: Date): number => Math.floor(at.getTime() / 1000);

/**
 * Visits between two moments, by quarter-hour, Link and the four ways a Visit is counted - for one
 * Link, one Unit, or every Link. Only numbers and the checked dataset name go into the text: no
 * string from a request ever does. Counts are weighted by the sampling, so they are estimates.
 */
const countsQuery = (dataset: string, range: { from: Date; to: Date; linkId?: number; unitId?: number }): string => {
  if (!DATASET.test(dataset)) {
    throw new Error(`Not a dataset name: ${dataset}`);
  }
  const where = [`timestamp >= toDateTime(${seconds(range.from)})`, `timestamp < toDateTime(${seconds(range.to)})`];
  if (range.linkId !== undefined) {
    where.push(`double1 = ${Math.trunc(range.linkId)}`);
  }
  if (range.unitId !== undefined) {
    where.push(`double2 = ${Math.trunc(range.unitId)}`);
  }
  return [
    "SELECT toUnixTimestamp(toStartOfFifteenMinutes(timestamp)) AS quarter, double1 AS link,",
    "blob2 AS country, blob3 AS referrer, blob4 AS device, blob5 AS browser, SUM(_sample_interval) AS visits",
    `FROM ${dataset}`,
    `WHERE ${where.join(" AND ")}`,
    "GROUP BY quarter, link, country, referrer, device, browser",
    "FORMAT JSON"
  ].join(" ");
};

/** The answer to `countsQuery`, read defensively: the SQL API sends large numbers as strings. */
const readCounts = (answer: unknown): EventCount[] => {
  const rows = typeof answer === "object" && answer !== null ? (answer as { data?: unknown }).data : undefined;
  if (!Array.isArray(rows)) {
    return [];
  }
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return rows.flatMap((row: Record<string, unknown>) => {
    const linkId = Number(row.link);
    const count = Math.round(Number(row.visits));
    const quarter = Number(row.quarter);
    if (!(Number.isInteger(linkId) && linkId > 0 && count > 0 && Number.isFinite(quarter))) {
      return [];
    }
    return [
      {
        browser: text(row.browser),
        count,
        country: text(row.country),
        device: text(row.device),
        linkId,
        quarter: new Date(quarter * 1000),
        referrer: text(row.referrer)
      }
    ];
  });
};

export type { EventCount, VisitEvent };
export { countsQuery, QUARTER_MS, quarterOf, readCounts, toDataPoint };
