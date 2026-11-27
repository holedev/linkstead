import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { hashSecret } from "../domain/secret";
import type { Actor, AppContext, AppDeps, AppEnv } from "./context";

const SESSION_COOKIE = "linkstead_session";
/** What an API Key starts with, so one found in a log is recognisable. */
const API_KEY_PREFIX = "lsk_";
/**
 * Every prefix a live key may have: today's, and `oul_` from keys issued while the project was OU
 * Link - an application holding one must keep working.
 */
const API_KEY_PREFIXES = [API_KEY_PREFIX, "oul_"];
const BEARER = /^Bearer\s+(\S+)$/i;
/** Calls one API Key may make in a minute. Generous for an application, tight for a leaked key. */
const KEY_CALLS_PER_MINUTE = 120;
const MINUTE_MS = 60_000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Works out who is asking and leaves it on the context; it refuses nothing itself except a
 * cross-site write. Whether a route needs an actor, and which kind, is the route's to say.
 */
const resolveActor = ({ store, now = () => new Date() }: AppDeps) => {
  /** Sets the actor for a live API Key. Answers only when the key has used up its minute. */
  const resolveKey = async (c: AppContext, bearer: string): Promise<Response | null> => {
    const key = await store.findActiveApiKey(await hashSecret(bearer));
    if (!key) {
      return null;
    }
    const minute = Math.floor(now().getTime() / MINUTE_MS);
    if ((await store.countApiCall(key.id, minute)) > KEY_CALLS_PER_MINUTE) {
      const wait = Math.ceil(((minute + 1) * MINUTE_MS - now().getTime()) / 1000);
      c.header("Retry-After", String(Math.max(1, wait)));
      return c.json({ error: "rate-limited" }, 429);
    }
    c.set("actor", { apiKeyId: key.id, kind: "key", unitId: key.unitId });
    return null;
  };

  return createMiddleware<AppEnv>(async (c, next) => {
    c.set("actor", null);

    const bearer = BEARER.exec(c.req.header("authorization") ?? "")?.[1];
    if (bearer && API_KEY_PREFIXES.some((prefix) => bearer.startsWith(prefix))) {
      const refusal = await resolveKey(c, bearer);
      if (refusal) {
        return refusal;
      }
      return next();
    }

    const cookie = getCookie(c, SESSION_COOKIE);
    if (!cookie) {
      return next();
    }

    // A browser sends the cookie along with a request another site made it send. A write that
    // names a different origin is that case; SameSite=Lax already stops most of them, this stops
    // the rest. An API Key is immune - no browser attaches one on its own.
    const origin = c.req.header("origin");
    if (!SAFE_METHODS.has(c.req.method) && origin && origin !== new URL(c.req.url).origin) {
      return c.json({ error: "cross-site" }, 403);
    }

    const sessionHash = await hashSecret(cookie);
    const session = await store.findSession(sessionHash);
    if (session && session.expiresAt > now()) {
      const account = await store.findAccountById(session.accountId);
      if (account) {
        const actor: Actor = {
          accountId: account.id,
          email: account.email,
          isSystemAdmin: account.isSystemAdmin,
          kind: "account",
          sessionHash
        };
        c.set("actor", actor);
      }
    }
    return next();
  });
};

export { API_KEY_PREFIX, KEY_CALLS_PER_MINUTE, resolveActor, SESSION_COOKIE };
