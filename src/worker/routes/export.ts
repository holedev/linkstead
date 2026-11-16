import type { Hono } from "hono";
import { toCsv } from "../../domain/csv";
import { hashSecret } from "../../domain/secret";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { positiveInt, readJson } from "../http";
import type { Snapshot, Store } from "../store";

const BEARER = /^Bearer\s+(\S+)$/i;

/** A Thành viên's own Đơn vị, from the path. Downloads are for people: not one of the API's six things. */
const memberUnit = async (c: AppContext, store: Store): Promise<{ id: number; name: string } | Response> => {
  const actor = c.get("actor");
  if (actor?.kind !== "account") {
    return c.json({ error: "not-signed-in" }, 401);
  }
  const unitId = positiveInt(c.req.param("unitId"));
  const unit = unitId ? await store.findUnit(unitId) : null;
  if (!unit) {
    return c.json({ error: "unknown-unit" }, 404);
  }
  return (await store.findRole(actor.accountId, unit.id)) ? unit : c.json({ error: "forbidden" }, 403);
};

const download = (c: AppContext, body: string, type: string, filename: string) => {
  c.header("Content-Type", type);
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  c.header("Cache-Control", "no-store");
  return c.body(body);
};

const status = (link: { enabled: boolean; disabledBySystem: boolean }): string => {
  if (link.enabled) {
    return "Đang bật";
  }
  return link.disabledBySystem ? "Quản trị hệ thống đã tắt" : "Đã tắt";
};

const isSnapshot = (value: Record<string, unknown> | null): value is Snapshot =>
  value?.version === 1 && typeof value.tables === "object" && value.tables !== null && !Array.isArray(value.tables);

const registerExportRoutes = (app: Hono<AppEnv>, { store, now = () => new Date(), bootstrapToken }: AppDeps) => {
  /** A Đơn vị's Links, one row each, for a spreadsheet. */
  app.get("/api/units/:unitId/links.csv", async (c) => {
    const unit = await memberUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const { origin } = new URL(c.req.url);
    const links = await store.listLinksByUnit(unit.id);
    const csv = toCsv(
      ["Mã link", "Link", "Tên link", "Đích", "Ghi chú", "Trạng thái", "Ngày tạo", "Lượt mở (ước tính)"],
      links.map((link) => [
        link.code,
        `${origin}/${link.code}`,
        link.name,
        link.target,
        link.note,
        status(link),
        link.createdAt.toISOString(),
        link.visits
      ])
    );
    return download(c, csv, "text/csv; charset=utf-8", `ou-link-don-vi-${unit.id}-links.csv`);
  });

  /** A Đơn vị's Lượt mở, one row per Link per day that had any. */
  app.get("/api/units/:unitId/visits.csv", async (c) => {
    const unit = await memberUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const visits = await store.listVisitsByUnit(unit.id);
    const csv = toCsv(
      ["Mã link", "Ngày", "Lượt mở (ước tính)"],
      visits.map((visit) => [visit.code, visit.day, visit.count])
    );
    return download(c, csv, "text/csv; charset=utf-8", `ou-link-don-vi-${unit.id}-luot-mo.csv`);
  });

  /** Everything, for moving to another installation (ADR-0001). It holds password and key hashes. */
  app.get("/api/admin/export", async (c) => {
    const actor = c.get("actor");
    if (actor?.kind !== "account") {
      return c.json({ error: "not-signed-in" }, 401);
    }
    if (!actor.isSystemAdmin) {
      return c.json({ error: "forbidden" }, 403);
    }
    const snapshot = await store.exportAll(now());
    const day = snapshot.exportedAt.slice(0, 10);
    return download(c, JSON.stringify(snapshot), "application/json; charset=utf-8", `ou-link-${day}.json`);
  });

  /**
   * Takes an export into an installation nobody has used yet. Guarded like the first
   * administrator is, by the deploy's own secret: there is no account yet to sign in with.
   */
  app.post("/api/admin/import", async (c) => {
    const given = BEARER.exec(c.req.header("authorization") ?? "")?.[1];
    if (!(bootstrapToken && given) || (await hashSecret(given)) !== (await hashSecret(bootstrapToken))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const body = await readJson(c);
    if (!isSnapshot(body)) {
      return c.json({ error: "bad-snapshot" }, 422);
    }
    const outcome = await store.importAll(body);
    if (outcome === "not-empty") {
      return c.json({ error: "not-empty" }, 409);
    }
    return outcome === "done" ? c.body(null, 204) : c.json({ error: "bad-snapshot" }, 422);
  });
};

export { registerExportRoutes };
