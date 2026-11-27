import type { Hono } from "hono";
import { visitDay } from "../../domain/visit";
import type { AppDeps, AppEnv } from "../context";
import { memberUnit } from "./export";
import { sourcesOf } from "./links";

/** The stretches the overview offers, in days. Anything else is "since the start". */
const RANGES: ReadonlySet<number> = new Set([7, 30, 90, 365]);
const TOP_LINKS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A Đơn vị's Lượt mở at a glance: per day, its most opened Links, and where the openings came
 * from. For its Thành viên in the UI - the API reads Lượt mở one Link at a time.
 */
const registerStatsRoutes = (app: Hono<AppEnv>, { store, now = () => new Date() }: AppDeps) => {
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
      countries: sourcesOf(sources, "country"),
      days,
      referrers: sourcesOf(sources, "referrer"),
      since: since ?? null,
      today: visitDay(now(), timeZone),
      topLinks: await store.listUnitTopLinks(unit.id, since, TOP_LINKS),
      total: days.reduce((sum, day) => sum + day.count, 0)
    });
  });
};

export { registerStatsRoutes };
