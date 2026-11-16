import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { alias, getTableConfig } from "drizzle-orm/sqlite-core";
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
  unitChanges,
  units
} from "../db/schema";
import type { AuthorName, HistoryEntry, MembershipOutcome, Snapshot, Store } from "./store";

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
  logoChoice: links.logoChoice,
  logoKey: links.logoKey,
  name: links.name,
  note: links.note,
  target: links.target,
  unitId: links.unitId
};

const LINK_COLUMNS = {
  ...NEW_LINK_COLUMNS,
  // Table names written out: inside a subquery a bare `id` would be read as the inner table's.
  visits: sql<number>`coalesce((select sum(daily_visits.count) from daily_visits where daily_visits.link_id = links.id), 0)`
};

/** What a snapshot carries, parents before children so the foreign keys hold as rows go in. */
const SNAPSHOT_TABLES = [
  accounts,
  units,
  memberships,
  apiKeys,
  reservedCodes,
  links,
  targetChanges,
  statusChanges,
  unitChanges,
  dailyVisits
].map((table) => {
  const config = getTableConfig(table);
  return { columns: config.columns.map((column) => column.name), name: config.name };
});

/** D1 takes a limited number of statements in one batch. */
const IMPORT_BATCH = 50;

const isCell = (value: unknown): value is string | number | null =>
  value === null || typeof value === "string" || typeof value === "number";

const oldUnits = alias(units, "old_units");
const newUnits = alias(units, "new_units");

/** True when that Đơn vị would still have a Quản lý đơn vị without this membership as one. */
const KEEPS_A_MANAGER = `(role != 'manager' OR (SELECT count(*) FROM memberships WHERE unit_id = ?2 AND role = 'manager') > 1)`;

const authorName = (row: { email: string | null; keyName: string | null }): AuthorName => {
  if (row.email) {
    return { email: row.email, kind: "account" };
  }
  return row.keyName ? { kind: "key", name: row.keyName } : null;
};

/** The Cloudflare D1 implementation of `Store`. The only file here that knows about D1. */
const createD1Store = (database: D1Database): Store => {
  const db = drizzle(database);

  /** Why a guarded change to a membership touched no row. */
  const membershipOutcome = async (changes: number, accountId: number, unitId: number): Promise<MembershipOutcome> => {
    if (changes > 0) {
      return "done";
    }
    const row = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.accountId, accountId), eq(memberships.unitId, unitId)))
      .get();
    return row ? "last-manager" : "not-a-member";
  };

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

    addReservedCode: async (code, note) => {
      const inserted = await db
        .insert(reservedCodes)
        .values({ code, note })
        .onConflictDoNothing()
        .returning({ code: reservedCodes.code });
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

    countApiCall: async (apiKeyId, minute) => {
      const [, counted] = await database.batch([
        database.prepare("DELETE FROM api_key_usage WHERE api_key_id = ?1 AND minute < ?2").bind(apiKeyId, minute),
        database
          .prepare(
            `INSERT INTO api_key_usage (api_key_id, minute, count) VALUES (?1, ?2, 1)
             ON CONFLICT (api_key_id, minute) DO UPDATE SET count = count + 1 RETURNING count`
          )
          .bind(apiKeyId, minute)
      ]);
      return (counted?.results[0] as { count: number } | undefined)?.count ?? 0;
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

    createUnit: async (name) => {
      const inserted = await db
        .insert(units)
        .values({ name })
        .onConflictDoNothing()
        .returning({ id: units.id, name: units.name });
      return inserted[0] ?? null;
    },

    deleteSession: async (tokenHash) => {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },

    deleteSessionsOfAccount: async (accountId) => {
      await db.delete(sessions).where(eq(sessions.accountId, accountId));
    },

    dissolveUnit: async (unitId, at) => {
      // One transaction. The first statement decides; the other two act only if it did.
      const [dissolved] = await database.batch([
        database
          .prepare(
            `UPDATE units SET dissolved_at = ?1 WHERE id = ?2 AND dissolved_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM links WHERE unit_id = ?2)`
          )
          .bind(at.getTime(), unitId),
        database
          .prepare(
            "DELETE FROM memberships WHERE unit_id = ?1 AND EXISTS (SELECT 1 FROM units WHERE id = ?1 AND dissolved_at = ?2)"
          )
          .bind(unitId, at.getTime()),
        database
          .prepare(
            `UPDATE api_keys SET revoked_at = ?2 WHERE unit_id = ?1 AND revoked_at IS NULL
             AND EXISTS (SELECT 1 FROM units WHERE id = ?1 AND dissolved_at = ?2)`
          )
          .bind(unitId, at.getTime())
      ]);
      return (dissolved?.meta.changes ?? 0) > 0;
    },

    exportAll: async (at) => {
      const tables: Snapshot["tables"] = {};
      for (const table of SNAPSHOT_TABLES) {
        const rows = await database.prepare(`SELECT ${table.columns.join(", ")} FROM ${table.name}`).all();
        tables[table.name] = rows.results;
      }
      return { exportedAt: at.toISOString(), tables, version: 1 };
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

    findUnit: async (unitId) =>
      (await db
        .select({ id: units.id, logoKey: units.logoKey, name: units.name })
        .from(units)
        .where(and(eq(units.id, unitId), isNull(units.dissolvedAt)))
        .get()) ?? null,

    importAll: async (snapshot) => {
      const used = await database
        .prepare("SELECT (SELECT count(*) FROM accounts) + (SELECT count(*) FROM links) AS total")
        .first<{ total: number }>();
      if ((used?.total ?? 0) > 0) {
        return "not-empty";
      }

      // Only columns this version knows, and only plain values: a snapshot is data, never SQL.
      const statements: D1PreparedStatement[] = [];
      for (const table of SNAPSHOT_TABLES) {
        const rows = snapshot.tables[table.name];
        if (!Array.isArray(rows)) {
          return "bad-snapshot";
        }
        const insert = `INSERT INTO ${table.name} (${table.columns.join(", ")}) VALUES (${table.columns.map(() => "?").join(", ")})`;
        for (const row of rows) {
          const values = table.columns.map((column) => row?.[column] ?? null);
          if (!values.every(isCell)) {
            return "bad-snapshot";
          }
          statements.push(database.prepare(insert).bind(...values));
        }
      }

      const wipe = [...SNAPSHOT_TABLES].reverse().map((table) => database.prepare(`DELETE FROM ${table.name}`));
      try {
        // The Đơn vị a fresh installation is seeded with give way to the snapshot's own.
        await database.batch(wipe);
        for (let start = 0; start < statements.length; start += IMPORT_BATCH) {
          await database.batch(statements.slice(start, start + IMPORT_BATCH));
        }
      } catch {
        // Batches are separate transactions, so a failure part-way is undone by hand.
        await database.batch(wipe);
        return "bad-snapshot";
      }
      return "done";
    },

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
      const moves = await db
        .select({
          at: unitChanges.createdAt,
          email: accounts.email,
          newUnitName: newUnits.name,
          oldUnitName: oldUnits.name
        })
        .from(unitChanges)
        .innerJoin(oldUnits, eq(oldUnits.id, unitChanges.oldUnitId))
        .innerJoin(newUnits, eq(newUnits.id, unitChanges.newUnitId))
        .leftJoin(accounts, eq(accounts.id, unitChanges.byAccountId))
        .where(eq(unitChanges.linkId, linkId))
        .orderBy(desc(unitChanges.id))
        .all();
      const entries: HistoryEntry[] = [
        ...moves.map((row) => ({
          at: row.at,
          by: authorName({ email: row.email, keyName: null }),
          kind: "unit" as const,
          newUnitName: row.newUnitName,
          oldUnitName: row.oldUnitName
        })),
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

    listLogoKeys: async () => {
      const rows = await database
        .prepare(
          "SELECT logo_key AS key FROM units WHERE logo_key IS NOT NULL UNION SELECT logo_key FROM links WHERE logo_key IS NOT NULL"
        )
        .all<{ key: string }>();
      return rows.results.map((row) => row.key);
    },

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

    listReservedCodes: () =>
      db
        .select({ code: reservedCodes.code, createdAt: reservedCodes.createdAt, note: reservedCodes.note })
        .from(reservedCodes)
        .orderBy(reservedCodes.code)
        .all(),

    listUnitOverviews: async () => {
      const rows = await db
        .select({
          id: units.id,
          linkCount: sql<number>`(select count(*) from links where links.unit_id = units.id)`,
          name: units.name
        })
        .from(units)
        .where(isNull(units.dissolvedAt))
        .orderBy(units.id)
        .all();
      const managers = await db
        .select({ email: accounts.email, unitId: memberships.unitId })
        .from(memberships)
        .innerJoin(accounts, eq(accounts.id, memberships.accountId))
        .where(eq(memberships.role, "manager"))
        .orderBy(accounts.email)
        .all();
      return rows.map((row) => ({
        ...row,
        managers: managers.filter((manager) => manager.unitId === row.id).map((manager) => manager.email)
      }));
    },

    listUnits: () =>
      db
        .select({ id: units.id, name: units.name })
        .from(units)
        .where(isNull(units.dissolvedAt))
        .orderBy(units.id)
        .all(),

    listVisits: (linkId) =>
      db
        .select({ count: dailyVisits.count, day: dailyVisits.day })
        .from(dailyVisits)
        .where(eq(dailyVisits.linkId, linkId))
        .orderBy(dailyVisits.day)
        .all(),

    listVisitsByUnit: (unitId) =>
      db
        .select({ code: links.code, count: dailyVisits.count, day: dailyVisits.day })
        .from(dailyVisits)
        .innerJoin(links, eq(links.id, dailyVisits.linkId))
        .where(eq(links.unitId, unitId))
        .orderBy(links.code, dailyVisits.day)
        .all(),

    lockAccount: async (accountId, until) => {
      await db.update(accounts).set({ failedLogins: 0, lockedUntil: until }).where(eq(accounts.id, accountId));
    },

    markPasswordSetupUsed: async (tokenHash, at) => {
      await db.update(passwordSetups).set({ usedAt: at }).where(eq(passwordSetups.tokenHash, tokenHash));
    },

    moveLink: async ({ linkId, fromUnitId, toUnitId, byAccountId, at }) => {
      const [, moved] = await database.batch([
        database
          .prepare(
            `INSERT INTO unit_changes (link_id, old_unit_id, new_unit_id, by_account_id, created_at)
             SELECT id, unit_id, ?1, ?2, ?3 FROM links WHERE id = ?4 AND unit_id = ?5`
          )
          .bind(toUnitId, byAccountId, at.getTime(), linkId, fromUnitId),
        database
          .prepare("UPDATE links SET unit_id = ?1 WHERE id = ?2 AND unit_id = ?3")
          .bind(toUnitId, linkId, fromUnitId)
      ]);
      return (moved?.meta.changes ?? 0) > 0;
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

    removeMembership: async (accountId, unitId) => {
      const removed = await database
        .prepare(`DELETE FROM memberships WHERE account_id = ?1 AND unit_id = ?2 AND ${KEEPS_A_MANAGER}`)
        .bind(accountId, unitId)
        .run();
      return membershipOutcome(removed.meta.changes, accountId, unitId);
    },

    removeReservedCode: async (code) => {
      const removed = await db.delete(reservedCodes).where(eq(reservedCodes.code, code)).returning();
      return removed.length > 0;
    },

    revokeApiKey: async (keyId, unitId, at) => {
      const revoked = await db
        .update(apiKeys)
        .set({ revokedAt: at })
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.unitId, unitId), isNull(apiKeys.revokedAt)))
        .returning({ id: apiKeys.id });
      return revoked.length > 0;
    },

    setLinkLogo: async (linkId, choice, logoKey) => {
      await db.update(links).set({ logoChoice: choice, logoKey }).where(eq(links.id, linkId));
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

    setMembershipRole: async (accountId, unitId, role) => {
      const guard = role === "manager" ? "1" : KEEPS_A_MANAGER;
      const updated = await database
        .prepare(`UPDATE memberships SET role = ?3 WHERE account_id = ?1 AND unit_id = ?2 AND ${guard}`)
        .bind(accountId, unitId, role)
        .run();
      return membershipOutcome(updated.meta.changes, accountId, unitId);
    },

    setPassword: async (accountId, passwordHash) => {
      await db
        .update(accounts)
        .set({ failedLogins: 0, lockedUntil: null, passwordHash })
        .where(eq(accounts.id, accountId));
    },

    setUnitLogo: async (unitId, logoKey) => {
      await db.update(units).set({ logoKey }).where(eq(units.id, unitId));
    },

    unitExists: async (unitId) => {
      const row = await db
        .select({ id: units.id })
        .from(units)
        .where(and(eq(units.id, unitId), isNull(units.dissolvedAt)))
        .get();
      return row !== undefined;
    }
  };
};

export { createD1Store };
