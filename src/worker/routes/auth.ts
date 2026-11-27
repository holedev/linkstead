import type { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { isAllowedEmail, normalizeEmail } from "../../domain/email";
import { checkSettings, type OrganizationSettings } from "../../domain/organization";
import { isStretched, sealPassword, verifyPassword } from "../../domain/password";
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
const MAX_UNIT_NAME = 100;

/**
 * Verified when the email is unknown or has no password yet, so that answering does the same work
 * as it does for a real account and the timing does not say which addresses exist.
 */
const DUMMY_HASH = "stretched-hmac-sha256$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

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

/**
 * What a bootstrap call asks for - the first administrator's email, the password as the browser
 * stretched it if one was given, the Organization's settings, the name of the first Unit (the
 * Organization's own when none is given) - or the first thing wrong with it.
 */
const readBootstrap = (
  body: Record<string, unknown>,
  current: OrganizationSettings
):
  | { email: string; passwordKey: string | null; settings: OrganizationSettings; unitName: string }
  | { error: string } => {
  const { email: _email, passwordKey: _passwordKey, unitName: _unitName, ...given } = body;
  const passwordKey = body.passwordKey === undefined ? null : text(body.passwordKey);
  if (passwordKey !== null && !isStretched(passwordKey)) {
    return { error: "bad-password-key" };
  }
  const checked = checkSettings(given, current);
  if ("problem" in checked) {
    return { error: checked.problem };
  }
  const email = normalizeEmail(text(body.email));
  if (!isAllowedEmail(email, checked.settings.emailDomains)) {
    return { error: "email-not-allowed" };
  }
  const unitName = text(body.unitName) || checked.settings.name;
  if (unitName.length > MAX_UNIT_NAME) {
    return { error: "bad-name" };
  }
  return { email, passwordKey, settings: checked.settings, unitName };
};

const registerAuthRoutes = (app: Hono<AppEnv>, { store, now = () => new Date(), bootstrapToken }: AppDeps) => {
  /**
   * Whether the installation still waits for its first System Administrator, so the UI shows its
   * first-run screen instead of signing in - whether the secret that screen asks for is set, and
   * whether there is a Unit already, or the screen asks what the first one is called.
   */
  app.get("/api/bootstrap", async (c) =>
    c.json({
      hasUnits: (await store.listUnits()).length > 0,
      needed: (await store.countSystemAdmins()) === 0,
      secretSet: Boolean(bootstrapToken)
    })
  );

  /**
   * Creates the first System Administrator, once, and with it the Organization's first settings:
   * any of name, emailDomains, language, timeZone and brandColor, beside the email (ADR-0007).
   * An installation with no Unit gets its first one too, named `unitName`, so the administrator
   * can create Links at once.
   * Guarded by a secret set at deploy rather than by a seeded account, so no person's address has
   * to be written into a migration, and nobody who reaches a fresh installation first can take it.
   *
   * With `passwordKey` - the password as the browser stretched it, as the first-run screen sends
   * it - the password is set and the session starts at once. Without it, as from a script, the
   * answer carries a one-time link for setting the password.
   */
  app.post("/api/bootstrap", async (c) => {
    const given = BEARER.exec(c.req.header("authorization") ?? "")?.[1];
    if (!(bootstrapToken && given) || (await hashSecret(given)) !== (await hashSecret(bootstrapToken))) {
      return c.json({ error: "forbidden" }, 403);
    }
    if ((await store.countSystemAdmins()) > 0) {
      return c.json({ error: "already-bootstrapped" }, 409);
    }
    const current = await store.getOrganization();
    const asked = readBootstrap((await readJson(c)) ?? {}, current);
    if ("error" in asked) {
      return c.json({ error: asked.error }, 422);
    }
    const { email, passwordKey, settings, unitName } = asked;
    if (await store.findAccountByEmail(email)) {
      return c.json({ error: "account-exists" }, 409);
    }

    await store.saveOrganization({ ...settings, uiLogoKey: current.uiLogoKey }, now());
    const account = await store.createAccount(email, true);
    if ((await store.listUnits()).length === 0) {
      await store.createUnit(unitName);
    }
    // The first administrator manages every Unit that exists, or nobody could add its members.
    for (const unit of await store.listUnits()) {
      await store.addMembership(account.id, unit.id, "manager");
    }
    if (passwordKey !== null) {
      await store.setPassword(account.id, await sealPassword(passwordKey));
      await startSession(c, store, account.id, now());
      return c.json(await describeAccount(store, account.id), 201);
    }
    return c.json({ email, setupUrl: await issueSetupLink(store, account.id, new URL(c.req.url).origin, now()) }, 201);
  });

  /**
   * Whose password a one-time link sets. The browser needs the email before it can stretch the
   * new password (`domain/password.ts`), and whoever holds the link is the person it was made for.
   */
  app.post("/api/auth/setup/account", async (c) => {
    const token = text((await readJson(c))?.token);
    const setup = token ? await store.findPasswordSetup(await hashSecret(token)) : null;
    const account =
      setup && !setup.usedAt && setup.expiresAt > now() ? await store.findAccountById(setup.accountId) : null;
    return account ? c.json({ email: account.email }) : c.json({ error: "invalid-token" }, 400);
  });

  /**
   * Uses a one-time link: sets the password and ends every session the account had. `passwordKey`
   * is the password as the browser stretched it - the server never sees the password itself.
   */
  app.post("/api/auth/setup", async (c) => {
    const body = await readJson(c);
    const token = text(body?.token);
    const passwordKey = text(body?.passwordKey);

    const tokenHash = await hashSecret(token);
    const setup = token ? await store.findPasswordSetup(tokenHash) : null;
    if (!setup || setup.usedAt || setup.expiresAt <= now()) {
      return c.json({ error: "invalid-token" }, 400);
    }
    if (!isStretched(passwordKey)) {
      return c.json({ error: "bad-password-key" }, 422);
    }

    await store.setPassword(setup.accountId, await sealPassword(passwordKey));
    await store.markPasswordSetupUsed(tokenHash, now());
    await store.deleteSessionsOfAccount(setup.accountId);
    return c.body(null, 204);
  });

  app.post("/api/auth/login", async (c) => {
    const body = await readJson(c);
    const email = normalizeEmail(text(body?.email));
    const passwordKey = text(body?.passwordKey);
    const account = await store.findAccountByEmail(email);

    if (account?.lockedUntil && account.lockedUntil > now()) {
      return c.json({ error: "locked" }, 429);
    }

    const matches = await verifyPassword(passwordKey, account?.passwordHash ?? DUMMY_HASH);
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
