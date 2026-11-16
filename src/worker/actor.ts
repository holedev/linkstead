import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { hashSecret } from "../domain/secret";
import type { Actor, AppDeps, AppEnv } from "./context";

const SESSION_COOKIE = "oul_session";
const API_KEY_PREFIX = "oul_";
const BEARER = /^Bearer\s+(\S+)$/i;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Works out who is asking and leaves it on the context; it refuses nothing itself except a
 * cross-site write. Whether a route needs an actor, and which kind, is the route's to say.
 */
const resolveActor = ({ store, now = () => new Date() }: AppDeps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("actor", null);

    const bearer = BEARER.exec(c.req.header("authorization") ?? "")?.[1];
    if (bearer?.startsWith(API_KEY_PREFIX)) {
      const key = await store.findActiveApiKey(await hashSecret(bearer));
      if (key) {
        c.set("actor", { apiKeyId: key.id, kind: "key", unitId: key.unitId });
      }
      return next();
    }

    const cookie = getCookie(c, SESSION_COOKIE);
    if (!cookie) {
      return next();
    }

    // A browser sends the cookie along with a request another site made it send. A write that
    // names a different origin is that case; SameSite=Lax already stops most of them, this stops
    // the rest. A Khóa API is immune - no browser attaches one on its own.
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

export { API_KEY_PREFIX, resolveActor, SESSION_COOKIE };
