import type { Hono } from "hono";
import { isUniversityEmail, normalizeEmail } from "../../domain/email";
import { checkChosenCode, isWellFormedCode, normalizeCode } from "../../domain/link-code";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { positiveInt, readJson, text } from "../http";
import type { LinkRecord, Store } from "../store";
import { issueSetupLink } from "./auth";
import { createLink, present, presentEntry } from "./links";

const MAX_NAME = 100;
const MAX_NOTE = 200;

/**
 * What only a Quản trị hệ thống does: Đơn vị, Mã dành riêng, and reaching a Link of any Đơn vị.
 * Always a signed-in person - none of this is in the API a Khóa API speaks (AGENTS.md).
 */
const systemAdmin = (c: AppContext): { accountId: number } | Response => {
  const actor = c.get("actor");
  if (actor?.kind !== "account") {
    return c.json({ error: "not-signed-in" }, 401);
  }
  return actor.isSystemAdmin ? { accountId: actor.accountId } : c.json({ error: "forbidden" }, 403);
};

const linkInPath = async (c: AppContext, store: Store): Promise<LinkRecord | null> => {
  const code = normalizeCode(c.req.param("code") ?? "");
  return isWellFormedCode(code) ? await store.findLink(code) : null;
};

const registerAdminRoutes = (app: Hono<AppEnv>, { store, now = () => new Date() }: AppDeps) => {
  // ── Quản trị hệ thống ─────────────────────────────────────────────────────
  app.get("/api/admin/admins", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    return c.json({ admins: await store.listSystemAdmins() });
  });

  /**
   * Makes someone a Quản trị hệ thống, by email. A person the system has not met gets a Tài khoản
   * and a one-time link to set a password. The role is not membership: it puts them in no Đơn vị.
   */
  app.post("/api/admin/admins", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const email = normalizeEmail(text((await readJson(c))?.email));
    if (!isUniversityEmail(email)) {
      return c.json({ error: "not-university-email" }, 422);
    }
    const account = (await store.findAccountByEmail(email)) ?? (await store.createAccount(email, false));
    if (!(await store.grantSystemAdmin(account.id))) {
      return c.json({ error: "already-admin" }, 409);
    }
    const setupUrl = account.passwordHash
      ? null
      : await issueSetupLink(store, account.id, new URL(c.req.url).origin, now());
    return c.json({ email, setupUrl }, 201);
  });

  /**
   * Takes the role away - from anyone, oneself included, but never from the last one. The Tài
   * khoản and its memberships stay. It takes effect on that person's very next request.
   */
  app.delete("/api/admin/admins/:email", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const account = await store.findAccountByEmail(normalizeEmail(c.req.param("email")));
    const outcome = account ? await store.revokeSystemAdmin(account.id) : "not-an-admin";
    if (outcome === "not-an-admin") {
      return c.json({ error: "not-an-admin" }, 404);
    }
    return outcome === "done" ? c.body(null, 204) : c.json({ error: "last-admin" }, 409);
  });

  // ── Đơn vị ────────────────────────────────────────────────────────────────
  app.get("/api/admin/units", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    return c.json({ units: await store.listUnitOverviews() });
  });

  /** Creates a Đơn vị together with its first Quản lý đơn vị - it is never without one. */
  app.post("/api/admin/units", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const body = await readJson(c);
    const name = text(body?.name);
    const managerEmail = normalizeEmail(text(body?.managerEmail));
    if (!name || name.length > MAX_NAME) {
      return c.json({ error: "bad-name" }, 422);
    }
    if (!isUniversityEmail(managerEmail)) {
      return c.json({ error: "not-university-email" }, 422);
    }
    const unit = await store.createUnit(name);
    if (!unit) {
      return c.json({ error: "unit-name-taken" }, 409);
    }
    const account = (await store.findAccountByEmail(managerEmail)) ?? (await store.createAccount(managerEmail, false));
    await store.addMembership(account.id, unit.id, "manager");
    const setupUrl = account.passwordHash
      ? null
      : await issueSetupLink(store, account.id, new URL(c.req.url).origin, now());
    return c.json({ id: unit.id, managerEmail, name: unit.name, setupUrl }, 201);
  });

  /**
   * Folds a Đơn vị into another - for offices that merge. Its Links keep their addresses, so
   * nothing printed changes; the other Đơn vị takes them, its members and its Khóa API, and this
   * one is dissolved. Cannot be undone, which is why the UI asks first.
   */
  app.post("/api/admin/units/:unitId/merge", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const fromId = positiveInt(c.req.param("unitId"));
    const intoId = positiveInt(String((await readJson(c))?.intoUnitId ?? ""));
    const from = fromId ? await store.findUnit(fromId) : null;
    const into = intoId ? await store.findUnit(intoId) : null;
    if (!(from && into)) {
      return c.json({ error: "unknown-unit" }, 404);
    }
    if (from.id === into.id) {
      return c.json({ error: "same-unit" }, 422);
    }
    const moved = await store.mergeUnit({
      at: now(),
      byAccountId: admin.accountId,
      fromUnitId: from.id,
      intoUnitId: into.id
    });
    return c.json({ from: from.name, into: { id: into.id, name: into.name }, moved });
  });

  /** Dissolves a Đơn vị that owns no Link. One that still does must give its Links away first. */
  app.delete("/api/admin/units/:unitId", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const unitId = positiveInt(c.req.param("unitId"));
    if (!(unitId && (await store.unitExists(unitId)))) {
      return c.json({ error: "unknown-unit" }, 404);
    }
    if (!(await store.dissolveUnit(unitId, now()))) {
      return c.json({ error: "unit-owns-links" }, 409);
    }
    return c.body(null, 204);
  });

  // ── Mã dành riêng ─────────────────────────────────────────────────────────
  app.get("/api/admin/reserved-codes", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const codes = await store.listReservedCodes();
    return c.json({ codes: codes.map((code) => ({ ...code, createdAt: code.createdAt.toISOString() })) });
  });

  app.post("/api/admin/reserved-codes", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const body = await readJson(c);
    const code = normalizeCode(text(body?.code));
    const note = text(body?.note);
    // The system's own paths answer `reserved` here too: they are held back already, for good.
    const problem = checkChosenCode(code);
    if (problem) {
      return c.json({ error: "bad-code", problem }, 422);
    }
    if (note.length > MAX_NOTE) {
      return c.json({ error: "bad-note" }, 422);
    }
    if (await store.findLink(code)) {
      return c.json({ error: "code-taken" }, 409);
    }
    if (!(await store.addReservedCode(code, note))) {
      return c.json({ error: "already-reserved" }, 409);
    }
    return c.json({ code, note }, 201);
  });

  /** Frees a reserved code for whoever asks first. It is not a Link; nothing printed depends on it. */
  app.delete("/api/admin/reserved-codes/:code", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    if (!(await store.removeReservedCode(normalizeCode(c.req.param("code"))))) {
      return c.json({ error: "unknown-code" }, 404);
    }
    return c.body(null, 204);
  });

  // ── Links of any Đơn vị ───────────────────────────────────────────────────
  /**
   * Creates a Link for a Đơn vị the administrator need not belong to, and may give it a Mã dành
   * riêng - the one way such a code is handed out.
   */
  app.post("/api/admin/links", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const body = await readJson(c);
    const unitId = positiveInt(String(body?.unitId ?? ""));
    if (!(unitId && (await store.unitExists(unitId)))) {
      return c.json({ error: "unknown-unit" }, 404);
    }
    return createLink(c, store, { accountId: admin.accountId, apiKeyId: null, unitId }, body, true);
  });

  /** Looks a Link up by its Mã link, whichever Đơn vị owns it, with its history. */
  app.get("/api/admin/links/:code", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const link = await linkInPath(c, store);
    if (!link) {
      return c.json({ error: "unknown-link" }, 404);
    }
    const unit = await store.findUnit(link.unitId);
    return c.json({
      ...present(link, new URL(c.req.url).origin),
      history: (await store.listHistory(link.id)).map(presentEntry),
      unitName: unit?.name ?? ""
    });
  });

  /** Gives a Link to another Đơn vị. Its Mã link, its Đích and its Lượt mở go with it unchanged. */
  app.post("/api/admin/links/:code/move", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const link = await linkInPath(c, store);
    if (!link) {
      return c.json({ error: "unknown-link" }, 404);
    }
    const unitId = positiveInt(String((await readJson(c))?.unitId ?? ""));
    const unit = unitId ? await store.findUnit(unitId) : null;
    if (!unit) {
      return c.json({ error: "unknown-unit" }, 404);
    }
    if (unit.id === link.unitId) {
      return c.json({ error: "same-unit" }, 422);
    }
    const moved = await store.moveLink({
      at: now(),
      byAccountId: admin.accountId,
      fromUnitId: link.unitId,
      linkId: link.id,
      toUnitId: unit.id
    });
    if (!moved) {
      return c.json({ error: "link-moved" }, 409);
    }
    return c.json({ ...present({ ...link, unitId: unit.id }, new URL(c.req.url).origin), unitName: unit.name });
  });
};

export { registerAdminRoutes, systemAdmin };
