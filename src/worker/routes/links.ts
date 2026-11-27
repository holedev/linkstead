import type { Hono } from "hono";
import { checkChosenCode, generateCode, isWellFormedCode, normalizeCode } from "../../domain/link-code";
import { checkLinkPassword, hashLinkPassword } from "../../domain/link-password";
import { MAX_PREVIEW_DESCRIPTION, MAX_PREVIEW_TITLE, readPreview } from "../../domain/preview";
import { checkTarget } from "../../domain/target";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { fetchPage as fetchRealPage } from "../fetch-page";
import { positiveInt, readJson, text } from "../http";
import { isListedUnsafe, type SafetyCheck } from "../safety";
import type { Author, HistoryEntry, LinkRecord, NewLink, Store, VisitSource } from "../store";

const MAX_NAME = 200;
const MAX_NOTE = 1000;
const GENERATE_ATTEMPTS = 5;

type Creator = { unitId: number; accountId: number | null; apiKeyId: number | null };

/**
 * Which Unit a request is about, and on whose behalf. An API Key has one Unit and cannot name
 * another; a person names theirs and must belong to it - being a System Administrator is not
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
  archived: link.archivedAt !== null,
  code: link.code,
  createdAt: link.createdAt.toISOString(),
  disabledBySystem: link.disabledBySystem,
  enabled: link.enabled,
  /** When it stops opening, or null for never. */
  expiresAt: link.expiresAt?.toISOString() ?? null,
  groupId: link.groupId,
  /** Whether visitors must give a password first. The password itself is never sent back. */
  hasPassword: link.passwordHash !== null,
  logoChoice: link.logoChoice,
  logoScale: link.logoScale,
  name: link.name,
  note: link.note,
  preview: { description: link.previewDescription, image: link.previewImage, title: link.previewTitle },
  qrShape: link.qrShape,
  target: link.target,
  unitId: link.unitId,
  /** Since when the daily check has found the Target listed as unsafe, or null. */
  unsafeSince: link.unsafeSince?.toISOString() ?? null,
  url: `${origin}/${link.code}`,
  visits: link.visits
});

type Access = { passwordHash?: string | null; expiresAt?: Date | null };

/** The password and expiry a request asks for, checked; `undefined` parts are left as they are. */
const readAccess = async (
  body: Record<string, unknown>,
  at: Date
): Promise<Access | { error: string; problem?: string }> => {
  const access: Access = {};
  if (body.password === null || body.password === "") {
    access.passwordHash = null;
  } else if (typeof body.password === "string") {
    const problem = checkLinkPassword(body.password);
    if (problem) {
      return { error: "bad-password", problem };
    }
    access.passwordHash = await hashLinkPassword(body.password);
  }
  if (body.expiresAt === null) {
    access.expiresAt = null;
  } else if (body.expiresAt !== undefined) {
    const expiresAt = typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
      return { error: "bad-expiry", problem: "not-a-date" };
    }
    if (expiresAt <= at) {
      return { error: "bad-expiry", problem: "in-the-past" };
    }
    access.expiresAt = expiresAt;
  }
  return access;
};

/** One side of where Visits came from, most first. "" is "not known". */
const sourcesOf = (sources: VisitSource[], kind: VisitSource["kind"]) =>
  sources.filter((source) => source.kind === kind).map(({ value, count }) => ({ count, value }));

const presentEntry = (entry: HistoryEntry) => ({ ...entry, at: entry.at.toISOString() });

type Reach = {
  link: LinkRecord;
  by: Author;
  /** The request comes from a System Administrator: a switch-off of theirs only they undo. */
  asSystem: boolean;
};

type ReachOptions = {
  /** Lets a System Administrator through without membership - for switching off and on only. */
  systemAdmin?: boolean;
  /** Refuses an API Key: the request is not one of the six things the API does. */
  peopleOnly?: boolean;
  /** Lets a deleted Link through - for a System Administrator's lookup only. Otherwise it is unknown. */
  deleted?: boolean;
};

/**
 * The Link in the path, if whoever is asking may act on it: a Member of the Unit that owns
 * it, or that Unit's API Key.
 */
const reachLink = async (c: AppContext, store: Store, options: ReachOptions = {}): Promise<Reach | Response> => {
  const actor = c.get("actor");
  if (!actor) {
    return c.json({ error: "not-signed-in" }, 401);
  }
  const code = normalizeCode(c.req.param("code") ?? "");
  const link = isWellFormedCode(code) ? await store.findLink(code) : null;
  if (!link || (link.deletedAt && !options.deleted)) {
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

/**
 * Creates a Link for a creator already known to be allowed. `handOut` is a System Administrator
 * giving out a Reserved Code: the administrators' list is skipped, the system's own paths never.
 */
const createLink = async (
  c: AppContext,
  { store, checkSafety }: { store: Store; checkSafety?: SafetyCheck },
  creator: Creator,
  body: Record<string, unknown> | null,
  handOut = false
) => {
  const url = new URL(c.req.url);
  const read = readFields(body, creator, url.hostname);
  if ("error" in read) {
    return c.json(read, 422);
  }
  if (await isListedUnsafe(checkSafety, read.target)) {
    return c.json({ error: "bad-target", problem: "unsafe" }, 422);
  }
  // A Group, if one is named, must be one of the Unit's own.
  const groupId = body?.groupId === undefined || body.groupId === null ? null : positiveInt(String(body.groupId));
  if (groupId === null && body?.groupId !== undefined && body.groupId !== null) {
    return c.json({ error: "unknown-group" }, 422);
  }
  if (groupId !== null && !(await store.findGroup(creator.unitId, groupId))) {
    return c.json({ error: "unknown-group" }, 422);
  }
  const fields = { ...read, groupId };

  const chosen = normalizeCode(text(body?.code));
  if (!chosen) {
    const generated = await createWithGeneratedCode(store, fields);
    return generated ? c.json(present(generated, url.origin), 201) : c.json({ error: "no-code-available" }, 503);
  }

  const reserved = !handOut && (await store.isReservedCode(chosen)) ? new Set([chosen]) : undefined;
  const problem = checkChosenCode(chosen, reserved);
  if (problem) {
    return c.json({ error: "bad-code", problem }, 422);
  }
  const link = await store.createLink({ ...fields, code: chosen });
  return link ? c.json(present(link, url.origin), 201) : c.json({ error: "code-taken" }, 409);
};

const registerLinkRoutes = (
  app: Hono<AppEnv>,
  { store, now = () => new Date(), fetchPage = fetchRealPage, checkSafety }: AppDeps
) => {
  /** Creates a Link. With no `code`, the system picks one. */
  app.post("/api/links", async (c) => {
    const body = await readJson(c);
    const creator = await resolveCreator(c, store, body?.unitId);
    if (creator instanceof Response) {
      return creator;
    }
    return createLink(c, { checkSafety, store }, creator, body);
  });

  /** The Links of one Unit, newest first. */
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
   * One Link, for its page in the UI. A person only: the API Key lists a Unit's Links and that
   * is all it reads (AGENTS.md), so this adds nothing a leaked key could use.
   */
  app.get("/api/links/:code", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    return c.json(present(reach.link, new URL(c.req.url).origin));
  });

  /**
   * Changes a Link's Target and records who did. `expectedTarget` is the Target the caller was shown
   * when confirming; if it has changed since, nothing is written and the answer says what it is now.
   * `resetPreview: true` also drops the share preview set by hand, which described the old Target.
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
    if (await isListedUnsafe(checkSafety, target)) {
      return c.json({ error: "bad-target", problem: "unsafe" }, 422);
    }
    const expected = typeof body?.expectedTarget === "string" ? body.expectedTarget.trim() : link.target;
    const changed =
      expected === link.target &&
      (await store.changeTarget({ at: now(), by, linkId: link.id, newTarget: target, oldTarget: link.target }));
    if (!changed) {
      const current = await store.findLink(link.code);
      return c.json({ error: "target-changed", target: current?.target ?? link.target }, 409);
    }
    // A preview set by hand described the old Target. Asked to, it goes, and the new Target's own
    // title, description and image show instead.
    if (body?.resetPreview === true) {
      const cleared = { previewDescription: "", previewImage: "", previewTitle: "" };
      await store.updateLinkPreview(link.id, cleared);
      return c.json(present({ ...link, ...cleared, target, unsafeSince: null }, url.origin));
    }
    return c.json(present({ ...link, target, unsafeSince: null }, url.origin));
  });

  /** Sorts the Link into one of its Unit's Group, or into none with `groupId: null`. */
  app.put("/api/links/:code/group", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    const { link } = reach;
    const raw = (await readJson(c))?.groupId;
    const groupId = raw === null ? null : positiveInt(String(raw ?? ""));
    if (raw !== null && !(groupId && (await store.findGroup(link.unitId, groupId)))) {
      return c.json({ error: "unknown-group" }, 422);
    }
    await store.setLinkGroup(link.id, groupId);
    return c.json(present({ ...link, groupId }, new URL(c.req.url).origin));
  });

  /**
   * Rewords the Link Name and its note - what the Link is for, in its Unit's own words. For
   * people only: it is not one of the things the API does. The Link Code never changes.
   */
  app.put("/api/links/:code/details", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    const { link } = reach;
    const body = await readJson(c);
    const name = text(body?.name);
    // A note left out of the request is kept; an empty one clears it.
    const note = typeof body?.note === "string" ? body.note.trim() : link.note;
    if (!name || name.length > MAX_NAME) {
      return c.json({ error: "bad-name" }, 422);
    }
    if (note.length > MAX_NOTE) {
      return c.json({ error: "bad-note" }, 422);
    }
    await store.updateLinkDetails(link.id, name, note);
    return c.json(present({ ...link, name, note }, new URL(c.req.url).origin));
  });

  /**
   * How the Link looks when pasted into a chat or a post: what it sets itself, and what its Target's
   * page says, which fills whatever it leaves empty. For people: not one of the API's six things.
   */
  app.get("/api/links/:code/preview", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    const { link } = reach;
    // Behind a password the Target's own words are never shown, so they are not read either.
    const page = link.passwordHash ? null : await fetchPage(link.target);
    return c.json({
      fromTarget: page ? readPreview(page.html, page.url) : null,
      own: { description: link.previewDescription, image: link.previewImage, title: link.previewTitle }
    });
  });

  /** Sets the Link's own preview. An empty part goes back to the Target's. */
  app.put("/api/links/:code/preview", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    const { link } = reach;
    const body = await readJson(c);
    const previewTitle = text(body?.title);
    const previewDescription = text(body?.description);
    const previewImage = text(body?.image);
    if (previewTitle.length > MAX_PREVIEW_TITLE) {
      return c.json({ error: "bad-preview", problem: "title-too-long" }, 422);
    }
    if (previewDescription.length > MAX_PREVIEW_DESCRIPTION) {
      return c.json({ error: "bad-preview", problem: "description-too-long" }, 422);
    }
    if (previewImage && !(URL.canParse(previewImage) && new URL(previewImage).protocol === "https:")) {
      return c.json({ error: "bad-preview", problem: "image-not-https" }, 422);
    }
    const preview = { previewDescription, previewImage, previewTitle };
    await store.updateLinkPreview(link.id, preview);
    return c.json(present({ ...link, ...preview }, new URL(c.req.url).origin));
  });

  /**
   * Switches a Link off: it shows the notice from now on, and keeps its Link Code. Switched off by a
   * System Administrator, it stays theirs to switch back on - also when it was already off.
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

  /**
   * Who may open the Link (ADR-0006): `password` - a string sets it, null or "" removes it - and
   * `expiresAt` - an ISO moment in the future, or null for never. A part left out stays as it is.
   * For people only: it is not one of the API's six things.
   */
  app.put("/api/links/:code/access", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    const { link } = reach;
    const body = (await readJson(c)) ?? {};
    const access = await readAccess(body, now());
    if ("error" in access) {
      return c.json(access, 422);
    }
    if (access.passwordHash !== undefined) {
      await store.setLinkPassword(link.id, access.passwordHash);
    }
    if (access.expiresAt !== undefined) {
      await store.setLinkExpiry(link.id, access.expiresAt);
    }
    return c.json(
      present(
        {
          ...link,
          expiresAt: access.expiresAt === undefined ? link.expiresAt : access.expiresAt,
          passwordHash: access.passwordHash === undefined ? link.passwordHash : access.passwordHash
        },
        new URL(c.req.url).origin
      )
    );
  });

  /**
   * Puts a Link away from the Unit's list, or brings it back. It keeps opening and counting: this
   * is tidying, for any Member, and not one of the API's six things.
   */
  app.post("/api/links/:code/archive", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    const archivedAt = reach.link.archivedAt ?? now();
    await store.setLinkArchived(reach.link.id, archivedAt);
    return c.json(present({ ...reach.link, archivedAt }, new URL(c.req.url).origin));
  });

  app.post("/api/links/:code/unarchive", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    await store.setLinkArchived(reach.link.id, null);
    return c.json(present({ ...reach.link, archivedAt: null }, new URL(c.req.url).origin));
  });

  /**
   * Deletes a Link (ADR-0004): it stops opening and leaves every list, and its Link Code is never
   * given out again. For a Unit Manager of the owning Unit, or a System Administrator - never a
   * API Key, which would make a leaked key able to break what is printed.
   */
  app.delete("/api/links/:code", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true, systemAdmin: true });
    if (reach instanceof Response) {
      return reach;
    }
    const actor = c.get("actor");
    if (actor?.kind !== "account") {
      return c.json({ error: "forbidden" }, 403);
    }
    const role = await store.findRole(actor.accountId, reach.link.unitId);
    if (!(role === "manager" || actor.isSystemAdmin)) {
      return c.json({ error: "forbidden" }, 403);
    }
    // The Link Code typed back, as the confirmation asks: a slip of the mouse deletes nothing.
    if (normalizeCode(text((await readJson(c))?.confirmCode)) !== reach.link.code) {
      return c.json({ error: "confirm-code" }, 422);
    }
    await store.deleteLink({ at: now(), byAccountId: actor.accountId, linkId: reach.link.id });
    return c.body(null, 204);
  });

  /** Every change of Target and every switch-off and -on, for the Member of the owning Unit. */
  app.get("/api/links/:code/history", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    return c.json({ history: (await store.listHistory(reach.link.id)).map(presentEntry) });
  });

  /** Visits per day of the Organization, oldest first. Days nobody opened the Link are left out. */
  app.get("/api/links/:code/visits", async (c) => {
    const reach = await reachLink(c, store);
    if (reach instanceof Response) {
      return reach;
    }
    const days = await store.listVisits(reach.link.id);
    const sources = await store.listVisitSources({ linkId: reach.link.id });
    return c.json({
      browsers: sourcesOf(sources, "browser"),
      countries: sourcesOf(sources, "country"),
      days,
      devices: sourcesOf(sources, "device"),
      referrers: sourcesOf(sources, "referrer"),
      total: days.reduce((sum, day) => sum + day.count, 0)
    });
  });
};

export { createLink, present, presentEntry, reachLink, registerLinkRoutes, sourcesOf };
