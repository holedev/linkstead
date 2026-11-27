import type { Hono } from "hono";
import { isAllowedEmail, normalizeEmail } from "../../domain/email";
import { hashSecret, newSecret } from "../../domain/secret";
import { API_KEY_PREFIX } from "../actor";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { positiveInt, readJson, text } from "../http";
import type { Store } from "../store";
import { issueSetupLink } from "./auth";

const MAX_NAME = 100;

/**
 * The Unit in the path, if the person asking may manage it: its Unit Manager, or a System
 * Administrator. Never an API Key - members and keys are managed by people, in the UI, so that a
 * leaked key cannot mint itself a successor (AGENTS.md).
 */
const managedUnit = async (c: AppContext, store: Store): Promise<{ unitId: number; accountId: number } | Response> => {
  const actor = c.get("actor");
  if (actor?.kind !== "account") {
    return c.json({ error: "not-signed-in" }, 401);
  }
  const unitId = positiveInt(c.req.param("unitId"));
  if (!(unitId && (await store.unitExists(unitId)))) {
    return c.json({ error: "unknown-unit" }, 404);
  }
  if (!actor.isSystemAdmin && (await store.findRole(actor.accountId, unitId)) !== "manager") {
    return c.json({ error: "forbidden" }, 403);
  }
  return { accountId: actor.accountId, unitId };
};

const registerUnitRoutes = (app: Hono<AppEnv>, { store, now = () => new Date() }: AppDeps) => {
  app.get("/api/units/:unitId/members", async (c) => {
    const unit = await managedUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    return c.json({ members: await store.listMembers(unit.unitId) });
  });

  /**
   * Adds a Member by email. A person the system has not met gets a Account and a one-time
   * link to set a password; one it already knows is simply added.
   */
  app.post("/api/units/:unitId/members", async (c) => {
    const unit = await managedUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const body = await readJson(c);
    const email = normalizeEmail(text(body?.email));
    const role = body?.role === "manager" ? "manager" : "member";
    if (!isAllowedEmail(email, (await store.getOrganization()).emailDomains)) {
      return c.json({ error: "email-not-allowed" }, 422);
    }

    const account = (await store.findAccountByEmail(email)) ?? (await store.createAccount(email, false));
    if (!(await store.addMembership(account.id, unit.unitId, role))) {
      return c.json({ error: "already-member" }, 409);
    }
    const setupUrl = account.passwordHash
      ? null
      : await issueSetupLink(store, account.id, new URL(c.req.url).origin, now());
    return c.json({ email, role, setupUrl }, 201);
  });

  /**
   * Changes a member's role or removes them from the Unit. Either is refused when it would leave
   * the Unit without a Unit Manager. The Account itself stays - it may belong elsewhere.
   */
  const changeMembership = async (c: AppContext, role: "manager" | "member" | null) => {
    const unit = await managedUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const account = await store.findAccountByEmail(normalizeEmail(c.req.param("email") ?? ""));
    const outcome = account
      ? await (role
          ? store.setMembershipRole(account.id, unit.unitId, role)
          : store.removeMembership(account.id, unit.unitId))
      : "not-a-member";
    if (outcome === "not-a-member") {
      return c.json({ error: "not-a-member" }, 404);
    }
    if (outcome === "last-manager") {
      return c.json({ error: "last-manager" }, 409);
    }
    return c.body(null, 204);
  };

  app.put("/api/units/:unitId/members/:email", async (c) => {
    const role = (await readJson(c))?.role;
    if (role !== "manager" && role !== "member") {
      return c.json({ error: "bad-role" }, 422);
    }
    return changeMembership(c, role);
  });

  app.delete("/api/units/:unitId/members/:email", (c) => changeMembership(c, null));

  /** A new one-time link for a member who forgot their password, or never used the first one. */
  app.post("/api/units/:unitId/members/password-setup", async (c) => {
    const unit = await managedUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const email = normalizeEmail(text((await readJson(c))?.email));
    const account = await store.findAccountByEmail(email);
    if (!(account && (await store.findRole(account.id, unit.unitId)))) {
      return c.json({ error: "not-a-member" }, 404);
    }
    return c.json({ email, setupUrl: await issueSetupLink(store, account.id, new URL(c.req.url).origin, now()) }, 201);
  });

  /** The Unit's keys by name. The keys themselves are not kept, so they cannot be listed. */
  app.get("/api/units/:unitId/keys", async (c) => {
    const unit = await managedUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const keys = await store.listApiKeys(unit.unitId);
    return c.json({
      keys: keys.map((key) => ({
        createdAt: key.createdAt.toISOString(),
        id: key.id,
        name: key.name,
        revokedAt: key.revokedAt?.toISOString() ?? null
      }))
    });
  });

  /** Issues an API Key. The key itself is in this response and nowhere else, ever again. */
  app.post("/api/units/:unitId/keys", async (c) => {
    const unit = await managedUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const name = text((await readJson(c))?.name);
    if (!name || name.length > MAX_NAME) {
      return c.json({ error: "bad-name" }, 422);
    }
    const key = newSecret(API_KEY_PREFIX);
    const id = await store.createApiKey({
      createdByAccountId: unit.accountId,
      keyHash: await hashSecret(key),
      name,
      unitId: unit.unitId
    });
    return c.json({ id, key, name }, 201);
  });

  app.delete("/api/units/:unitId/keys/:keyId", async (c) => {
    const unit = await managedUnit(c, store);
    if (unit instanceof Response) {
      return unit;
    }
    const keyId = positiveInt(c.req.param("keyId"));
    if (!(keyId && (await store.revokeApiKey(keyId, unit.unitId, now())))) {
      return c.json({ error: "unknown-key" }, 404);
    }
    return c.body(null, 204);
  });
};

export { managedUnit, registerUnitRoutes };
