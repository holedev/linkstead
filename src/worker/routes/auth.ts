import type { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { isUniversityEmail, normalizeEmail } from "../../domain/email";
import { checkNewPassword, hashPassword, verifyPassword } from "../../domain/password";
import { hashSecret, newSecret } from "../../domain/secret";
import { SESSION_COOKIE } from "../actor";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { readJson, text } from "../http";
import type { Store } from "../store";

const SESSION_DAYS = 7;
const SETUP_LINK_DAYS = 7;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Verified when the email is unknown or has no password yet, so that answering takes as long as
 * it does for a real account and the timing does not say which addresses exist. A constant and
 * not a value computed at start-up: a Worker must not await in one request a promise another made.
 */
const DUMMY_HASH = "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/**
 * The one-time link an insider passes on by hand - the system sends no mail (ADR-0003). It points
 * at the UI, which hands the token to `POST /api/auth/setup`.
 */
const issueSetupLink = async (store: Store, accountId: number, origin: string, now: Date): Promise<string> => {
  const token = newSecret();
  await store.createPasswordSetup(
    await hashSecret(token),
    accountId,
    new Date(now.getTime() + SETUP_LINK_DAYS * DAY_MS)
  );
  return `${origin}/app/setup?token=${token}`;
};

const describeAccount = async (store: Store, accountId: number) => {
  const account = await store.findAccountById(accountId);
  if (!account) {
    return null;
  }
  return {
    email: account.email,
    isSystemAdmin: account.isSystemAdmin,
    units: await store.listMemberships(accountId)
  };
};

const startSession = async (c: AppContext, store: Store, accountId: number, now: Date) => {
  const token = newSecret();
  await store.createSession(await hashSecret(token), accountId, new Date(now.getTime() + SESSION_DAYS * DAY_MS));
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
    sameSite: "Lax",
    // Plain http only exists on a developer's machine; everywhere else the cookie is https-only.
    secure: new URL(c.req.url).protocol === "https:"
  });
};

const registerAuthRoutes = (app: Hono<AppEnv>, { store, now = () => new Date(), bootstrapToken }: AppDeps) => {
  /**
   * Creates the first Quản trị hệ thống, once. Guarded by a secret set at deploy rather than by a
   * seeded account, so no person's address has to be written into a migration.
   */
  app.post("/api/bootstrap", async (c) => {
    const given = BEARER.exec(c.req.header("authorization") ?? "")?.[1];
    if (!(bootstrapToken && given) || (await hashSecret(given)) !== (await hashSecret(bootstrapToken))) {
      return c.json({ error: "forbidden" }, 403);
    }
    if ((await store.countSystemAdmins()) > 0) {
      return c.json({ error: "already-bootstrapped" }, 409);
    }
    const email = normalizeEmail(text((await readJson(c))?.email));
    if (!isUniversityEmail(email)) {
      return c.json({ error: "not-university-email" }, 422);
    }
    if (await store.findAccountByEmail(email)) {
      return c.json({ error: "account-exists" }, 409);
    }

    const account = await store.createAccount(email, true);
    // The first administrator manages every Đơn vị that exists, or nobody could add its members.
    for (const unit of await store.listUnits()) {
      await store.addMembership(account.id, unit.id, "manager");
    }
    return c.json({ email, setupUrl: await issueSetupLink(store, account.id, new URL(c.req.url).origin, now()) }, 201);
  });

  /** Uses a one-time link: sets the password and ends every session the account had. */
  app.post("/api/auth/setup", async (c) => {
    const body = await readJson(c);
    const token = text(body?.token);
    const password = typeof body?.password === "string" ? body.password : "";

    const tokenHash = await hashSecret(token);
    const setup = token ? await store.findPasswordSetup(tokenHash) : null;
    if (!setup || setup.usedAt || setup.expiresAt <= now()) {
      return c.json({ error: "invalid-token" }, 400);
    }
    const problem = checkNewPassword(password);
    if (problem) {
      return c.json({ error: problem }, 422);
    }

    await store.setPassword(setup.accountId, await hashPassword(password));
    await store.markPasswordSetupUsed(tokenHash, now());
    await store.deleteSessionsOfAccount(setup.accountId);
    return c.body(null, 204);
  });

  app.post("/api/auth/login", async (c) => {
    const body = await readJson(c);
    const email = normalizeEmail(text(body?.email));
    const password = typeof body?.password === "string" ? body.password : "";
    const account = await store.findAccountByEmail(email);

    if (account?.lockedUntil && account.lockedUntil > now()) {
      return c.json({ error: "locked" }, 429);
    }

    const matches = await verifyPassword(password, account?.passwordHash ?? DUMMY_HASH);
    if (!(account?.passwordHash && matches)) {
      if (account) {
        const failures = await store.addLoginFailure(account.id);
        if (failures >= MAX_FAILED_LOGINS) {
          await store.lockAccount(account.id, new Date(now().getTime() + LOCK_MINUTES * 60 * 1000));
        }
      }
      // One answer for a wrong password and an unknown address.
      return c.json({ error: "invalid-credentials" }, 401);
    }

    await store.clearLoginFailures(account.id);
    await startSession(c, store, account.id, now());
    return c.json(await describeAccount(store, account.id));
  });

  app.post("/api/auth/logout", async (c) => {
    const actor = c.get("actor");
    if (actor?.kind === "account") {
      await store.deleteSession(actor.sessionHash);
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  app.get("/api/auth/me", async (c) => {
    const actor = c.get("actor");
    if (actor?.kind !== "account") {
      return c.json({ error: "not-signed-in" }, 401);
    }
    return c.json(await describeAccount(store, actor.accountId));
  });
};

export { issueSetupLink, registerAuthRoutes };
