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
  statusChanges,
  targetChanges,
  units
} from "../db/schema";
import type { AuthorName, HistoryEntry, Store } from "./store";

const ACCOUNT_COLUMNS = {
  email: accounts.email,
  id: accounts.id,
  isSystemAdmin: accounts.isSystemAdmin,
  lockedUntil: accounts.lockedUntil,
  passwordHash: accounts.passwordHash
};

const NEW_LINK_COLUMNS = {
  code: links.code,
  createdAt: links.createdAt,
  disabledBySystem: links.disabledBySystem,
  enabled: links.enabled,
  id: links.id,
  name: links.name,
  note: links.note,
  target: links.target,
  unitId: links.unitId
};

const LINK_COLUMNS = {
  ...NEW_LINK_COLUMNS,
  visits: sql<number>`coalesce((select sum(${dailyVisits.count}) from ${dailyVisits} where ${dailyVisits.linkId} = ${links.id}), 0)`
};

const authorName = (row: { email: string | null; keyName: string | null }): AuthorName => {
  if (row.email) {
    return { email: row.email, kind: "account" };
  }
  return row.keyName ? { kind: "key", name: row.keyName } : null;
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

    changeTarget: async ({ linkId, oldTarget, newTarget, by, at }) => {
      // One batch, so one transaction: the history line is written from the row as it stands, and
      // only if the Đích is still the one the caller saw. Neither statement runs without the other.
      const [, updated] = await database.batch([
        database
          .prepare(
            `INSERT INTO target_changes (link_id, old_target, new_target, by_account_id, by_api_key_id, created_at)
             SELECT id, target, ?1, ?2, ?3, ?4 FROM links WHERE id = ?5 AND target = ?6`
          )
          .bind(newTarget, by.accountId, by.apiKeyId, at.getTime(), linkId, oldTarget),
        database
          .prepare("UPDATE links SET target = ?1 WHERE id = ?2 AND target = ?3")
          .bind(newTarget, linkId, oldTarget)
      ]);
      return (updated?.meta.changes ?? 0) > 0;
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
        .returning(NEW_LINK_COLUMNS);
      return inserted[0] ? { ...inserted[0], visits: 0 } : null;
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

    findLink: async (code) => (await db.select(LINK_COLUMNS).from(links).where(eq(links.code, code)).get()) ?? null,

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

    listHistory: async (linkId) => {
      const targets = await db
        .select({
          at: targetChanges.createdAt,
          email: accounts.email,
          keyName: apiKeys.name,
          newTarget: targetChanges.newTarget,
          oldTarget: targetChanges.oldTarget
        })
        .from(targetChanges)
        .leftJoin(accounts, eq(accounts.id, targetChanges.byAccountId))
        .leftJoin(apiKeys, eq(apiKeys.id, targetChanges.byApiKeyId))
        .where(eq(targetChanges.linkId, linkId))
        .orderBy(desc(targetChanges.id))
        .all();
      const statuses = await db
        .select({
          at: statusChanges.createdAt,
          bySystem: statusChanges.bySystem,
          email: accounts.email,
          enabled: statusChanges.enabled,
          keyName: apiKeys.name
        })
        .from(statusChanges)
        .leftJoin(accounts, eq(accounts.id, statusChanges.byAccountId))
        .leftJoin(apiKeys, eq(apiKeys.id, statusChanges.byApiKeyId))
        .where(eq(statusChanges.linkId, linkId))
        .orderBy(desc(statusChanges.id))
        .all();
      const entries: HistoryEntry[] = [
        ...targets.map((row) => ({
          at: row.at,
          by: authorName(row),
          kind: "target" as const,
          newTarget: row.newTarget,
          oldTarget: row.oldTarget
        })),
        ...statuses.map((row) => ({
          at: row.at,
          by: authorName(row),
          bySystem: row.bySystem,
          enabled: row.enabled,
          kind: "status" as const
        }))
      ];
      // Stable, so two changes in the same millisecond keep the newest-first order of their table.
      return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
    },

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

    listVisits: (linkId) =>
      db
        .select({ count: dailyVisits.count, day: dailyVisits.day })
        .from(dailyVisits)
        .where(eq(dailyVisits.linkId, linkId))
        .orderBy(dailyVisits.day)
        .all(),

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

    setLinkStatus: async ({ linkId, enabled, bySystem, by, at }) => {
      // As with a Đích: the line and the switch in one transaction, and neither when nothing changes.
      const [, updated] = await database.batch([
        database
          .prepare(
            `INSERT INTO status_changes (link_id, enabled, by_system, by_account_id, by_api_key_id, created_at)
             SELECT id, ?1, ?2, ?3, ?4, ?5 FROM links
             WHERE id = ?6 AND (enabled != ?1 OR disabled_by_system != ?2)`
          )
          .bind(Number(enabled), Number(bySystem), by.accountId, by.apiKeyId, at.getTime(), linkId),
        database
          .prepare(
            `UPDATE links SET enabled = ?1, disabled_by_system = ?2
             WHERE id = ?3 AND (enabled != ?1 OR disabled_by_system != ?2)`
          )
          .bind(Number(enabled), Number(bySystem), linkId)
      ]);
      return (updated?.meta.changes ?? 0) > 0;
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
