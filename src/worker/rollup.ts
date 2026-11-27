import { dayIn } from "../domain/time-zone";
import { type EventCount, quarterOf } from "../domain/visit-events";
import type { VisitEvents } from "./context";
import type { Store, VisitCounts, VisitSourceKind } from "./store";

/**
 * Adds the Visits written to Analytics Engine into the counts D1 keeps for ever (ADR-0008): every
 * quarter-hour that has ended since the last rollup, gathered per Link and per day of the
 * Organization. Each stretch moves the mark in the same batch as its counts, so a run that fails
 * part-way adds nothing twice; the next run carries on from the mark.
 *
 * Portable like the rest of the app: it knows only the `Store` and `VisitEvents` seams.
 */

/** Events can arrive a little late; a quarter-hour is only added once this long has passed it. */
const SETTLE_MS = 5 * 60 * 1000;

/** The most one query reads, and the most stretches one run takes - Workers allow few subrequests. */
const STRETCH_MS = 24 * 60 * 60 * 1000;
const MAX_STRETCHES = 10;

const SOURCE_KINDS: readonly VisitSourceKind[] = ["country", "referrer", "device", "browser"];

/** Event counts gathered into the per-day totals and sources the Store adds. */
const gather = (rows: EventCount[], timeZone: string): VisitCounts => {
  const totals = new Map<string, VisitCounts["totals"][number]>();
  const sources = new Map<string, VisitCounts["sources"][number]>();
  for (const row of rows) {
    // A quarter-hour lies within one day in every zone: offsets are whole quarters of an hour.
    const day = dayIn(row.quarter, timeZone);
    const totalKey = `${row.linkId}|${day}`;
    const total = totals.get(totalKey) ?? { count: 0, day, linkId: row.linkId };
    total.count += row.count;
    totals.set(totalKey, total);
    for (const kind of SOURCE_KINDS) {
      const value = row[kind];
      const key = `${totalKey}|${kind}|${value}`;
      const source = sources.get(key) ?? { count: 0, day, kind, linkId: row.linkId, value };
      source.count += row.count;
      sources.set(key, source);
    }
  }
  return { sources: [...sources.values()], totals: [...totals.values()] };
};

/** Rolls up what has settled. Returns how far it got, which is where the next run starts. */
const rollUp = async (store: Store, events: VisitEvents, now: Date): Promise<Date> => {
  const until = quarterOf(new Date(now.getTime() - SETTLE_MS));
  // The first rollup starts a day back: events cannot be older than the setting that writes them.
  let from = (await store.visitRollupMark()) ?? new Date(until.getTime() - STRETCH_MS);
  const { timeZone } = await store.getOrganization();
  for (let stretch = 0; stretch < MAX_STRETCHES && from < until; stretch += 1) {
    const to = new Date(Math.min(until.getTime(), from.getTime() + STRETCH_MS));
    const rows = await events.counts({ from, to });
    await store.addVisitCounts(gather(rows, timeZone), to);
    from = to;
  }
  return from;
};

export { gather, rollUp };
