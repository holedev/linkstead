import type { Hono } from "hono";
import { checkChosenCode, generateCode, normalizeCode } from "../../domain/link-code";
import { checkTarget } from "../../domain/target";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { positiveInt, readJson, text } from "../http";
import type { LinkRecord, NewLink, Store } from "../store";

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
  enabled: link.enabled,
  name: link.name,
  note: link.note,
  target: link.target,
  unitId: link.unitId,
  url: `${origin}/${link.code}`
});

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

const registerLinkRoutes = (app: Hono<AppEnv>, { store }: AppDeps) => {
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
};

export { registerLinkRoutes };
