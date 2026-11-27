import type { Hono } from "hono";
import { fromBase64, toBase64 } from "../../domain/base64";
import { toCsv } from "../../domain/csv";
import { checkLogo } from "../../domain/logo";
import type { Language } from "../../domain/organization";
import { hashSecret } from "../../domain/secret";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { positiveInt, readJson } from "../http";
import type { Snapshot, Store } from "../store";
import { SYSTEM_LOGO_KEY } from "./qr";

const BEARER = /^Bearer\s+(\S+)$/i;

/** A Member's own Unit, from the path. Downloads are for people: not one of the API's six things. */
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

/** The words of the CSV downloads, in the Organization's language: they are opened by people. */
const CSV_TEXT: Record<
  Language,
  {
    links: string[];
    visits: string[];
    sources: string[];
    on: string;
    off: string;
    offBySystem: string;
    yes: string;
    country: string;
    referrer: string;
    unknown: string;
  }
> = {
  en: {
    country: "Country",
    links: [
      "Link Code",
      "Link",
      "Link Name",
      "Group",
      "Target",
      "Note",
      "State",
      "Archived",
      "Created",
      "Visits (estimate)"
    ],
    off: "Switched off",
    offBySystem: "Switched off by a System Administrator",
    on: "On",
    referrer: "Referring site",
    sources: ["Link Code", "Day", "Kind", "Value", "Visits (estimate)"],
    unknown: "Not known",
    visits: ["Link Code", "Day", "Visits (estimate)"],
    yes: "Yes"
  },
  vi: {
    country: "Quốc gia",
    links: [
      "Mã link",
      "Link",
      "Tên link",
      "Nhóm",
      "Đích",
      "Ghi chú",
      "Trạng thái",
      "Lưu trữ",
      "Ngày tạo",
      "Lượt mở (ước tính)"
    ],
    off: "Đã tắt",
    offBySystem: "Quản trị hệ thống đã tắt",
    on: "Đang bật",
    referrer: "Nguồn giới thiệu",
    sources: ["Mã link", "Ngày", "Loại", "Giá trị", "Lượt mở (ước tính)"],
    unknown: "Không rõ",
    visits: ["Mã link", "Ngày", "Lượt mở (ước tính)"],
    yes: "Có"
  }
};

const status = (link: { enabled: boolean; disabledBySystem: boolean }, words: (typeof CSV_TEXT)[Language]): string => {
  if (link.enabled) {
    return words.on;
  }
  return link.disabledBySystem ? words.offBySystem : words.off;
};

/** The only shapes a logo's key has. A snapshot cannot make the import write anywhere else. */
const LOGO_KEY = /^(system\/logo|system\/ui-logo\/[\w-]+|(units|links)\/\d+\/[\w-]+)$/;

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

  /** A Unit's Links, one row each, for a spreadsheet. */
  app.get("/api/units/:unitId/links.csv", async (c) => {
    const unit = await memberUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const { origin } = new URL(c.req.url);
    const words = CSV_TEXT[(await store.getOrganization()).language];
    const links = await store.listLinksByUnit(unit.id);
    const groupNames = new Map((await store.listGroups(unit.id)).map((group) => [group.id, group.name]));
    const csv = toCsv(
      words.links,
      links.map((link) => [
        link.code,
        `${origin}/${link.code}`,
        link.name,
        (link.groupId && groupNames.get(link.groupId)) || "",
        link.target,
        link.note,
        status(link, words),
        link.archivedAt ? words.yes : "",
        link.createdAt.toISOString(),
        link.visits
      ])
    );
    return download(c, csv, "text/csv; charset=utf-8", `linkstead-unit-${unit.id}-links.csv`);
  });

  /** A Unit's Visits, one row per Link per day that had any. */
  app.get("/api/units/:unitId/visits.csv", async (c) => {
    const unit = await memberUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const words = CSV_TEXT[(await store.getOrganization()).language];
    const visits = await store.listVisitsByUnit(unit.id);
    const csv = toCsv(
      words.visits,
      visits.map((visit) => [visit.code, visit.day, visit.count])
    );
    return download(c, csv, "text/csv; charset=utf-8", `linkstead-unit-${unit.id}-visits.csv`);
  });

  /** Where a Unit's Visits came from: one row per Link, day, and country or referring site. */
  app.get("/api/units/:unitId/visit-sources.csv", async (c) => {
    const unit = await memberUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const words = CSV_TEXT[(await store.getOrganization()).language];
    const rows = await store.listVisitSourcesByUnit(unit.id);
    const csv = toCsv(
      words.sources,
      rows.map((row) => [
        row.code,
        row.day,
        row.kind === "country" ? words.country : words.referrer,
        row.value || words.unknown,
        row.count
      ])
    );
    return download(c, csv, "text/csv; charset=utf-8", `linkstead-unit-${unit.id}-visit-sources.csv`);
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
    return download(c, JSON.stringify(snapshot), "application/json; charset=utf-8", `linkstead-${day}.json`);
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

export { memberUnit, registerExportRoutes };
