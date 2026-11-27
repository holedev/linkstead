import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startHarness } from "./test-harness";

const MINUTE = 60 * 1000;
const TARGET = "https://example.org/cfp";

type Harness = Awaited<ReturnType<typeof startHarness>>;

const visitsTable = (h: Harness) =>
  h.db
    .prepare("SELECT link_id, day, count FROM daily_visits ORDER BY day")
    .all()
    .then((answer) => answer.results);

const sourcesTable = (h: Harness, kind: string) =>
  h.db
    .prepare("SELECT value, count FROM daily_visit_sources WHERE kind = ?1 ORDER BY value")
    .bind(kind)
    .all()
    .then((answer) => answer.results);

const withLink = async (h: Harness) => {
  const admin = await h.signedInAdmin();
  await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
  return admin;
};

describe("Visits through Analytics Engine", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ visitEvents: true });
  });
  afterAll(() => h.dispose());
  beforeEach(() => h.reset());

  it("are written as events, and not to D1 while a person is waiting", async () => {
    await withLink(h);
    expect((await h.client().get("/cfp-2027")).status).toBe(302);

    expect(h.visitEventLog).toMatchObject([{ browser: "safari", country: "", device: "mobile", linkId: 1, unitId: 1 }]);
    expect(await visitsTable(h)).toEqual([]);
  });

  it("are rolled into D1 by the Organization's day once their quarter-hour has settled", async () => {
    await withLink(h);
    // 03:00 UTC is 10:00 in Ho Chi Minh City.
    await h.client().get("/cfp-2027", { headers: { "cf-ipcountry": "VN" } });
    await h.rollUp();
    expect(await visitsTable(h)).toEqual([]);

    h.advance(20 * MINUTE);
    await h.rollUp();
    expect(await visitsTable(h)).toEqual([{ count: 1, day: "2027-03-01", link_id: 1 }]);
    expect(await sourcesTable(h, "country")).toEqual([{ count: 1, value: "VN" }]);
    expect(await sourcesTable(h, "device")).toEqual([{ count: 1, value: "mobile" }]);
    expect(await sourcesTable(h, "browser")).toEqual([{ count: 1, value: "safari" }]);
  });

  it("are added once, however often the rollup runs", async () => {
    await withLink(h);
    await h.client().get("/cfp-2027");
    h.advance(20 * MINUTE);
    await h.rollUp();
    await h.rollUp();
    // Seventeen hours on it is the next day in Ho Chi Minh City.
    h.advance(17 * 60 * MINUTE);
    await h.client().get("/cfp-2027");
    h.advance(20 * MINUTE);
    await h.rollUp();
    await h.rollUp();

    expect(await visitsTable(h)).toEqual([
      { count: 1, day: "2027-03-01", link_id: 1 },
      { count: 1, day: "2027-03-02", link_id: 1 }
    ]);
  });

  it("drop an event for a Link this installation does not have, and keep the rest", async () => {
    await withLink(h);
    await h.client().get("/cfp-2027");
    h.visitEventLog.push({ ...h.visitEventLog[0], at: h.visitEventLog[0]?.at ?? new Date(), linkId: 999 } as never);
    h.advance(20 * MINUTE);
    await h.rollUp();
    expect(await visitsTable(h)).toEqual([{ count: 1, day: "2027-03-01", link_id: 1 }]);
  });

  it("are read by the hour of the day on the Organization's clocks, for a Link and a Unit", async () => {
    const admin = await withLink(h);
    await h.client().get("/cfp-2027");
    await h.client().get("/cfp-2027");

    const link = (await (await admin.get("/api/links/cfp-2027/visits/hours?days=7")).json()) as {
      days: number;
      hours: number[];
    };
    expect(link.days).toBe(7);
    expect(link.hours[10]).toBe(2);
    expect(link.hours.reduce((sum, count) => sum + count, 0)).toBe(2);
    const unit = (await (await admin.get("/api/units/1/visits/hours")).json()) as { days: number; hours: number[] };
    expect(unit).toMatchObject({ days: 30 });
    expect(unit.hours[10]).toBe(2);
    expect((await admin.get("/api/units/2/visits/hours")).status).toBe(200);
  });

  it("show their device and browser in a Link's Visits once rolled up, and offer the view by hour", async () => {
    const admin = await withLink(h);
    await h.client().get("/cfp-2027");
    h.advance(20 * MINUTE);
    await h.rollUp();

    const visits = (await (await admin.get("/api/links/cfp-2027/visits")).json()) as Record<string, unknown>;
    expect(visits).toMatchObject({
      browsers: [{ count: 1, value: "safari" }],
      devices: [{ count: 1, value: "mobile" }],
      total: 1
    });
    expect(await (await h.client().get("/api/organization")).json()).toMatchObject({ hourlyVisits: true });
  });

  it("are rolled up before the whole installation is exported", async () => {
    const admin = await withLink(h);
    await h.client().get("/cfp-2027");
    h.advance(20 * MINUTE);
    const snapshot = (await (await admin.get("/api/admin/export")).json()) as {
      tables: { daily_visits: unknown[] };
    };
    expect(snapshot.tables.daily_visits).toHaveLength(1);
  });
});

describe("Visits without Analytics Engine", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.dispose());
  beforeEach(() => h.reset());

  it("are counted in D1 at once, by device and browser too", async () => {
    await withLink(h);
    await h.client().get("/cfp-2027");
    expect(await visitsTable(h)).toEqual([{ count: 1, day: "2027-03-01", link_id: 1 }]);
    expect(await sourcesTable(h, "device")).toEqual([{ count: 1, value: "mobile" }]);
    expect(await sourcesTable(h, "browser")).toEqual([{ count: 1, value: "safari" }]);
  });

  it("have no view by hour, and say so", async () => {
    const admin = await withLink(h);
    const answer = await admin.get("/api/links/cfp-2027/visits/hours");
    expect(answer.status).toBe(404);
    expect(await answer.json()).toEqual({ error: "hourly-unavailable" });
    expect(await (await h.client().get("/api/organization")).json()).toMatchObject({ hourlyVisits: false });
  });
});
