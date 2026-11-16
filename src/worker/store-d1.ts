import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  accounts,
  apiKeys,
  dailyVisits,
  links,
  memberships,
  passwordSetups,
  reservedCodes,
  sessions,
  units
} from "../db/schema";
import type { Store } from "./store";

const ACCOUNT_COLUMNS = {
  email: accounts.email,
  id: accounts.id,
  isSystemAdmin: accounts.isSystemAdmin,
  lockedUntil: accounts.lockedUntil,
  passwordHash: accounts.passwordHash
};

const LINK_COLUMNS = {
  code: links.code,
  createdAt: links.createdAt,
  enabled: links.enabled,
  id: links.id,
  name: links.name,
  note: links.note,
  target: links.target,
  unitId: links.unitId
};

/** The Cloudflare D1 implementation of `Store`. The only file here that knows about D1. */
const createD1Store = (database: D1Database): Store => {
  const db = drizzle(database);

  return {
    addLoginFailure: async (accountId) => {
      const [row] = await db
        .update(accounts)
        .set({ failedLogins: sql`${accounts.failedLogins} + 1` })
        .where(eq(accounts.id, accountId))
        .returning({ failedLogins: accounts.failedLogins });
      return row?.failedLogins ?? 0;
    },

    addMembership: async (accountId, unitId, role) => {
      const inserted = await db
        .insert(memberships)
        .values({ accountId, role, unitId })
        .onConflictDoNothing()
        .returning({ accountId: memberships.accountId });
      return inserted.length > 0;
    },

    clearLoginFailures: async (accountId) => {
      await db.update(accounts).set({ failedLogins: 0, lockedUntil: null }).where(eq(accounts.id, accountId));
    },

    countSystemAdmins: async () => {
      const row = await db.select({ total: count() }).from(accounts).where(eq(accounts.isSystemAdmin, true)).get();
      return row?.total ?? 0;
    },

    createAccount: async (email, isSystemAdmin) => {
      const [row] = await db.insert(accounts).values({ email, isSystemAdmin }).returning(ACCOUNT_COLUMNS);
      if (!row) {
        throw new Error("account was not created");
      }
      return row;
    },

    createApiKey: async (key) => {
      const [row] = await db.insert(apiKeys).values(key).returning({ id: apiKeys.id });
      if (!row) {
        throw new Error("key was not created");
      }
      return row.id;
    },

    createLink: async (link) => {
      // The unique index is what decides, not a check beforehand: two requests for one code
      // arriving together must not both succeed.
      const inserted = await db
        .insert(links)
        .values(link)
        .onConflictDoNothing({ target: links.code })
        .returning(LINK_COLUMNS);
      return inserted[0] ?? null;
    },

    createPasswordSetup: async (tokenHash, accountId, expiresAt) => {
      await db.insert(passwordSetups).values({ accountId, expiresAt, tokenHash });
    },

    createSession: async (tokenHash, accountId, expiresAt) => {
      await db.insert(sessions).values({ accountId, expiresAt, tokenHash });
    },

    deleteSession: async (tokenHash) => {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },

    deleteSessionsOfAccount: async (accountId) => {
      await db.delete(sessions).where(eq(sessions.accountId, accountId));
    },

    findAccountByEmail: async (email) =>
      (await db.select(ACCOUNT_COLUMNS).from(accounts).where(eq(accounts.email, email)).get()) ?? null,

    findAccountById: async (id) =>
      (await db.select(ACCOUNT_COLUMNS).from(accounts).where(eq(accounts.id, id)).get()) ?? null,

    findActiveApiKey: async (keyHash) =>
      (await db
        .select({ id: apiKeys.id, unitId: apiKeys.unitId })
        .from(apiKeys)
        .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
        .get()) ?? null,

    findLinkByCode: async (code) =>
      (await db
        .select({ enabled: links.enabled, id: links.id, target: links.target })
        .from(links)
        .where(eq(links.code, code))
        .get()) ?? null,

    findPasswordSetup: async (tokenHash) =>
      (await db
        .select({
          accountId: passwordSetups.accountId,
          expiresAt: passwordSetups.expiresAt,
          usedAt: passwordSetups.usedAt
        })
        .from(passwordSetups)
        .where(eq(passwordSetups.tokenHash, tokenHash))
        .get()) ?? null,

    findRole: async (accountId, unitId) => {
      const row = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.accountId, accountId), eq(memberships.unitId, unitId)))
        .get();
      return row?.role ?? null;
    },

    findSession: async (tokenHash) =>
      (await db
        .select({ accountId: sessions.accountId, expiresAt: sessions.expiresAt })
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .get()) ?? null,

    isReservedCode: async (code) => {
      const row = await db
        .select({ code: reservedCodes.code })
        .from(reservedCodes)
        .where(eq(reservedCodes.code, code))
        .get();
      return row !== undefined;
    },

    listApiKeys: (unitId) =>
      db
        .select({ createdAt: apiKeys.createdAt, id: apiKeys.id, name: apiKeys.name, revokedAt: apiKeys.revokedAt })
        .from(apiKeys)
        .where(eq(apiKeys.unitId, unitId))
        .orderBy(desc(apiKeys.id))
        .all(),

    listLinksByUnit: (unitId) =>
      db.select(LINK_COLUMNS).from(links).where(eq(links.unitId, unitId)).orderBy(desc(links.id)).all(),

    listMembers: async (unitId) => {
      const rows = await db
        .select({ email: accounts.email, passwordHash: accounts.passwordHash, role: memberships.role })
        .from(memberships)
        .innerJoin(accounts, eq(accounts.id, memberships.accountId))
        .where(eq(memberships.unitId, unitId))
        .orderBy(accounts.email)
        .all();
      // The hash never leaves this file: the caller learns only whether one exists.
      return rows.map((row) => ({ email: row.email, hasPassword: row.passwordHash !== null, role: row.role }));
    },

    listMemberships: (accountId) =>
      db
        .select({ role: memberships.role, unitId: units.id, unitName: units.name })
        .from(memberships)
        .innerJoin(units, eq(units.id, memberships.unitId))
        .where(eq(memberships.accountId, accountId))
        .orderBy(units.id)
        .all(),

    listUnits: () => db.select({ id: units.id, name: units.name }).from(units).orderBy(units.id).all(),

    lockAccount: async (accountId, until) => {
      await db.update(accounts).set({ failedLogins: 0, lockedUntil: until }).where(eq(accounts.id, accountId));
    },

    markPasswordSetupUsed: async (tokenHash, at) => {
      await db.update(passwordSetups).set({ usedAt: at }).where(eq(passwordSetups.tokenHash, tokenHash));
    },

    recordVisit: async (linkId, day) => {
      await db
        .insert(dailyVisits)
        .values({ count: 1, day, linkId })
        .onConflictDoUpdate({
          set: { count: sql`${dailyVisits.count} + 1` },
          target: [dailyVisits.linkId, dailyVisits.day]
        });
    },

    revokeApiKey: async (keyId, unitId, at) => {
      const revoked = await db
        .update(apiKeys)
        .set({ revokedAt: at })
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.unitId, unitId), isNull(apiKeys.revokedAt)))
        .returning({ id: apiKeys.id });
      return revoked.length > 0;
    },

    setPassword: async (accountId, passwordHash) => {
      await db
        .update(accounts)
        .set({ failedLogins: 0, lockedUntil: null, passwordHash })
        .where(eq(accounts.id, accountId));
    },

    unitExists: async (unitId) => {
      const row = await db.select({ id: units.id }).from(units).where(eq(units.id, unitId)).get();
      return row !== undefined;
    }
  };
};

export { createD1Store };
