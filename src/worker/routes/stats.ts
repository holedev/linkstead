import type { Hono } from "hono";
import { hourIn } from "../../domain/time-zone";
import { visitDay } from "../../domain/visit";
import type { EventCount } from "../../domain/visit-events";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { memberUnit } from "./export";
import { reachLink, sourcesOf } from "./links";

/** The stretches the overview offers, in days. Anything else is "since the start". */
const RANGES: ReadonlySet<number> = new Set([7, 30, 90, 365]);
const TOP_LINKS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The stretches the view by hour offers: Analytics Engine keeps three months. */
const HOUR_RANGES: ReadonlySet<number> = new Set([7, 30, 90]);
const DEFAULT_HOUR_RANGE = 30;

/** Visits by the hour of the day they happened at, 0 to 23, on the Organization's clocks. */
const byHour = (rows: EventCount[], timeZone: string): number[] => {
  const hours = Array.from({ length: 24 }, () => 0);
  for (const row of rows) {
    const hour = hourIn(row.quarter, timeZone);
    hours[hour] = (hours[hour] ?? 0) + row.count;
  }
  return hours;
};

/**
 * A Unit's Visits at a glance: per day, its most opened Links, and where the openings came
 * from. For its Member in the UI - the API reads Visits one Link at a time.
 */
const registerStatsRoutes = (app: Hono<AppEnv>, { store, now = () => new Date(), visitEvents }: AppDeps) => {
  /**
   * Visits by hour of day over the last `days`, for one Link or one Unit - only where Visits go
   * through Analytics Engine, which alone keeps the time of a Visit, and for three months only.
   */
  const hours = async (c: AppContext, scope: { linkId: number } | { unitId: number }) => {
    if (!visitEvents) {
      return c.json({ error: "hourly-unavailable" }, 404);
    }
    const asked = Number(c.req.query("days"));
    const days = HOUR_RANGES.has(asked) ? asked : DEFAULT_HOUR_RANGE;
    // A minute past now, so a Visit made this very moment is in.
    const to = new Date(now().getTime() + 60_000);
    const rows = await visitEvents.counts({ ...scope, from: new Date(to.getTime() - days * DAY_MS), to });
    const { timeZone } = await store.getOrganization();
    return c.json({ days, hours: byHour(rows, timeZone) });
  };

  app.get("/api/links/:code/visits/hours", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    return reach instanceof Response ? reach : hours(c, { linkId: reach.link.id });
  });

  app.get("/api/units/:unitId/visits/hours", async (c) => {
    const unit = await memberUnit(c, store);
    return unit instanceof Response ? unit : hours(c, { unitId: unit.id });
  });

  app.get("/api/units/:unitId/visits", async (c) => {
    const unit = await memberUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const { timeZone } = await store.getOrganization();
    const range = Number(c.req.query("days"));
    // The first day counted: today is one of the `range` days.
    const since = RANGES.has(range) ? visitDay(new Date(now().getTime() - (range - 1) * DAY_MS), timeZone) : undefined;
    const days = await store.listUnitVisitDays(unit.id, since);
    const sources = await store.listVisitSources({ since, unitId: unit.id });
    return c.json({
      browsers: sourcesOf(sources, "browser"),
      countries: sourcesOf(sources, "country"),
      days,
      devices: sourcesOf(sources, "device"),
      referrers: sourcesOf(sources, "referrer"),
      since: since ?? null,
      today: visitDay(now(), timeZone),
      topLinks: await store.listUnitTopLinks(unit.id, since, TOP_LINKS),
      total: days.reduce((sum, day) => sum + day.count, 0)
    });
  });
};

export { registerStatsRoutes };
