import type { Hono } from "hono";
import { checkChosenCode, generateCode, isWellFormedCode, normalizeCode } from "../../domain/link-code";
import { checkTarget } from "../../domain/target";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { positiveInt, readJson, text } from "../http";
import type { Author, HistoryEntry, LinkRecord, NewLink, Store } from "../store";

const MAX_NAME = 200;
const MAX_NOTE = 1000;
const GENERATE_ATTEMPTS = 5;

type Creator = { unitId: number; accountId: number | null; apiKeyId: number | null };

/**
 * Which Đơn vị a request is about, and on whose behalf. A Khóa API has one Đơn vị and cannot name
 * another; a person names theirs and must belong to it - being a Quản trị hệ thống is not
 * membership, they add themselves like anybody else.
 */
const resolveCreator = async (c: AppContext, store: Store, requested: unknown): Promise<Creator | Response> => {
  const actor = c.get("actor");
  if (!actor) {
    return c.json({ error: "not-signed-in" }, 401);
  }
  if (actor.kind === "key") {
    return { accountId: null, apiKeyId: actor.apiKeyId, unitId: actor.unitId };
  }
  const unitId = positiveInt(String(requested ?? ""));
  if (!unitId) {
    return c.json({ error: "unit-required" }, 422);
  }
  if (!(await store.findRole(actor.accountId, unitId))) {
    return c.json({ error: "forbidden" }, 403);
  }
  return { accountId: actor.accountId, apiKeyId: null, unitId };
};

const present = (link: LinkRecord, origin: string) => ({
  code: link.code,
  createdAt: link.createdAt.toISOString(),
  disabledBySystem: link.disabledBySystem,
  enabled: link.enabled,
  name: link.name,
  note: link.note,
  target: link.target,
  unitId: link.unitId,
  url: `${origin}/${link.code}`,
  visits: link.visits
});

const presentEntry = (entry: HistoryEntry) => ({ ...entry, at: entry.at.toISOString() });

type Reach = {
  link: LinkRecord;
  by: Author;
  /** The request comes from a Quản trị hệ thống: a switch-off of theirs only they undo. */
  asSystem: boolean;
};

type ReachOptions = {
  /** Lets a Quản trị hệ thống through without membership - for switching off and on only. */
  systemAdmin?: boolean;
  /** Refuses a Khóa API: the request is not one of the six things the API does. */
  peopleOnly?: boolean;
};

/**
 * The Link in the path, if whoever is asking may act on it: a Thành viên of the Đơn vị that owns
 * it, or that Đơn vị's Khóa API.
 */
const reachLink = async (c: AppContext, store: Store, options: ReachOptions = {}): Promise<Reach | Response> => {
  const actor = c.get("actor");
  if (!actor) {
    return c.json({ error: "not-signed-in" }, 401);
  }
  const code = normalizeCode(c.req.param("code") ?? "");
  const link = isWellFormedCode(code) ? await store.findLink(code) : null;
  if (!link) {
    return c.json({ error: "unknown-link" }, 404);
  }
  if (actor.kind === "key") {
    if (options.peopleOnly || actor.unitId !== link.unitId) {
      return c.json({ error: "forbidden" }, 403);
    }
    return { asSystem: false, by: { accountId: null, apiKeyId: actor.apiKeyId }, link };
  }
  const isMember = (await store.findRole(actor.accountId, link.unitId)) !== null;
  if (!(isMember || (options.systemAdmin && actor.isSystemAdmin))) {
    return c.json({ error: "forbidden" }, 403);
  }
  return { asSystem: actor.isSystemAdmin, by: { accountId: actor.accountId, apiKeyId: null }, link };
};

type LinkFields = Omit<NewLink, "code">;

/** The parts of a new Link that do not depend on its code, or what is wrong with them. */
const readFields = (
  body: Record<string, unknown> | null,
  creator: Creator,
  ownHost: string
): LinkFields | { error: string; problem?: string } => {
  const name = text(body?.name);
  const note = text(body?.note);
  const target = text(body?.target);
  if (!name || name.length > MAX_NAME) {
    return { error: "bad-name" };
  }
  if (note.length > MAX_NOTE) {
    return { error: "bad-note" };
  }
  const problem = checkTarget(target, [ownHost]);
  if (problem) {
    return { error: "bad-target", problem };
  }
  return {
    createdByAccountId: creator.accountId,
    createdByApiKeyId: creator.apiKeyId,
    name,
    note,
    target,
    unitId: creator.unitId
  };
};

/** A generated code can collide or land on a reserved word; both are rare, so it tries again. */
const createWithGeneratedCode = async (store: Store, fields: LinkFields): Promise<LinkRecord | null> => {
  for (let attempt = 0; attempt < GENERATE_ATTEMPTS; attempt += 1) {
    const code = generateCode();
    if (await store.isReservedCode(code)) {
      continue;
    }
    const link = await store.createLink({ ...fields, code });
    if (link) {
      return link;
    }
  }
  return null;
};

const registerLinkRoutes = (app: Hono<AppEnv>, { store, now = () => new Date() }: AppDeps) => {
  /** Creates a Link. With no `code`, the system picks one. */
  app.post("/api/links", async (c) => {
    const body = await readJson(c);
    const creator = await resolveCreator(c, store, body?.unitId);
    if (creator instanceof Response) {
      return creator;
    }
    const url = new URL(c.req.url);
    const fields = readFields(body, creator, url.hostname);
    if ("error" in fields) {
      return c.json(fields, 422);
    }

    const chosen = normalizeCode(text(body?.code));
    if (!chosen) {
      const generated = await createWithGeneratedCode(store, fields);
      return generated ? c.json(present(generated, url.origin), 201) : c.json({ error: "no-code-available" }, 503);
    }

    const reserved = (await store.isReservedCode(chosen)) ? new Set([chosen]) : undefined;
    const problem = checkChosenCode(chosen, reserved);
    if (problem) {
      return c.json({ error: "bad-code", problem }, 422);
    }
    const link = await store.createLink({ ...fields, code: chosen });
    return link ? c.json(present(link, url.origin), 201) : c.json({ error: "code-taken" }, 409);
  });

  /** The Links of one Đơn vị, newest first. */
  app.get("/api/links", async (c) => {
    const creator = await resolveCreator(c, store, c.req.query("unitId"));
    if (creator instanceof Response) {
      return creator;
    }
    const { origin } = new URL(c.req.url);
    const links = await store.listLinksByUnit(creator.unitId);
    return c.json({ links: links.map((link) => present(link, origin)) });
  });

  /**
   * Changes a Link's Đích and records who did. `expectedTarget` is the Đích the caller was shown
   * when confirming; if it has changed since, nothing is written and the answer says what it is now.
   */
  app.put("/api/links/:code/target", async (c) => {
    const reach = await reachLink(c, store);
    if (reach instanceof Response) {
      return reach;
    }
    const { link, by } = reach;
    const body = await readJson(c);
    const url = new URL(c.req.url);
    const target = text(body?.target);
    const problem = checkTarget(target, [url.hostname]);
    if (problem) {
      return c.json({ error: "bad-target", problem }, 422);
    }
    if (target === link.target) {
      return c.json({ error: "bad-target", problem: "unchanged" }, 422);
    }
    const expected = typeof body?.expectedTarget === "string" ? body.expectedTarget.trim() : link.target;
    const changed =
      expected === link.target &&
      (await store.changeTarget({ at: now(), by, linkId: link.id, newTarget: target, oldTarget: link.target }));
    if (!changed) {
      const current = await store.findLink(link.code);
      return c.json({ error: "target-changed", target: current?.target ?? link.target }, 409);
    }
    return c.json(present({ ...link, target }, url.origin));
  });

  /**
   * Switches a Link off: it shows the notice from now on, and keeps its Mã link. Switched off by a
   * Quản trị hệ thống, it stays theirs to switch back on - also when it was already off.
   */
  app.post("/api/links/:code/disable", async (c) => {
    const reach = await reachLink(c, store, { systemAdmin: true });
    if (reach instanceof Response) {
      return reach;
    }
    const { link, by, asSystem } = reach;
    // A member switching off a Link the administrators already hold changes nothing.
    const bySystem = asSystem || (!link.enabled && link.disabledBySystem);
    await store.setLinkStatus({ at: now(), by, bySystem, enabled: false, linkId: link.id });
    return c.json(present({ ...link, disabledBySystem: bySystem, enabled: false }, new URL(c.req.url).origin));
  });

  app.post("/api/links/:code/enable", async (c) => {
    const reach = await reachLink(c, store, { systemAdmin: true });
    if (reach instanceof Response) {
      return reach;
    }
    const { link, by, asSystem } = reach;
    if (!link.enabled && link.disabledBySystem && !asSystem) {
      return c.json({ error: "disabled-by-system" }, 403);
    }
    await store.setLinkStatus({ at: now(), by, bySystem: false, enabled: true, linkId: link.id });
    return c.json(present({ ...link, disabledBySystem: false, enabled: true }, new URL(c.req.url).origin));
  });

  /** Every change of Đích and every switch-off and -on, for the Thành viên of the owning Đơn vị. */
  app.get("/api/links/:code/history", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    return c.json({ history: (await store.listHistory(reach.link.id)).map(presentEntry) });
  });

  /** Lượt mở per Vietnamese day, oldest first. Days nobody opened the Link are left out. */
  app.get("/api/links/:code/visits", async (c) => {
    const reach = await reachLink(c, store);
    if (reach instanceof Response) {
      return reach;
    }
    const days = await store.listVisits(reach.link.id);
    return c.json({ days, total: days.reduce((sum, day) => sum + day.count, 0) });
  });
};

export { registerLinkRoutes };
