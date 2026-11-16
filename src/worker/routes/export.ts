import type { Hono } from "hono";
import { fromBase64, toBase64 } from "../../domain/base64";
import { toCsv } from "../../domain/csv";
import { checkLogo } from "../../domain/logo";
import { hashSecret } from "../../domain/secret";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { positiveInt, readJson } from "../http";
import type { Snapshot, Store } from "../store";
import { SYSTEM_LOGO_KEY } from "./qr";

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

/** The only shapes a logo's key has. A snapshot cannot make the import write anywhere else. */
const LOGO_KEY = /^(system\/logo|(units|links)\/\d+\/[\w-]+)$/;

const isSnapshot = (value: Record<string, unknown> | null): value is Snapshot =>
  value?.version === 1 && typeof value.tables === "object" && value.tables !== null && !Array.isArray(value.tables);

const registerExportRoutes = (app: Hono<AppEnv>, { store, logos, now = () => new Date(), bootstrapToken }: AppDeps) => {
  /** Logos are checked again like any upload. One that fails is left out: its QR shows no logo. */
  const importLogos = async (files: Record<string, unknown>) => {
    for (const [key, encoded] of Object.entries(files)) {
      const bytes = typeof encoded === "string" ? fromBase64(encoded) : null;
      if (LOGO_KEY.test(key) && bytes && !checkLogo(bytes)) {
        await logos?.put(key, bytes);
      }
    }
  };

  /** A Đơn vị's Links, one row each, for a spreadsheet. */
  app.get("/api/units/:unitId/links.csv", async (c) => {
    const unit = await memberUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const { origin } = new URL(c.req.url);
    const links = await store.listLinksByUnit(unit.id);
    const groupNames = new Map((await store.listGroups(unit.id)).map((group) => [group.id, group.name]));
    const csv = toCsv(
      ["Mã link", "Link", "Tên link", "Nhóm", "Đích", "Ghi chú", "Trạng thái", "Ngày tạo", "Lượt mở (ước tính)"],
      links.map((link) => [
        link.code,
        `${origin}/${link.code}`,
        link.name,
        (link.groupId && groupNames.get(link.groupId)) || "",
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
    snapshot.logos = {};
    for (const key of [SYSTEM_LOGO_KEY, ...(await store.listLogoKeys())]) {
      const bytes = await logos?.get(key);
      if (bytes) {
        snapshot.logos[key] = toBase64(bytes);
      }
    }
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
    if (outcome !== "done") {
      return c.json({ error: "bad-snapshot" }, 422);
    }
    await importLogos(body.logos ?? {});
    return c.body(null, 204);
  });
};

export { registerExportRoutes };
