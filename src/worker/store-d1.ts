import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { alias, getTableConfig } from "drizzle-orm/sqlite-core";
import {
  accounts,
  apiKeys,
  dailyVisitSources,
  dailyVisits,
  linkGroups,
  links,
  memberships,
  organization,
  passwordSetups,
  redirectChanges,
  reservedCodes,
  sessions,
  statusChanges,
  targetChanges,
  unitChanges,
  units,
  visitRollup
} from "../db/schema";
import { DEFAULT_SETTINGS, isLanguage } from "../domain/organization";
import type {
  AuthorName,
  HistoryEntry,
  MembershipOutcome,
  OrganizationRecord,
  Snapshot,
  Store,
  VisitScope,
  VisitSourceKind
} from "./store";

const ACCOUNT_COLUMNS = {
  email: accounts.email,
  id: accounts.id,
  isSystemAdmin: accounts.isSystemAdmin,
  lockedUntil: accounts.lockedUntil,
  passwordHash: accounts.passwordHash
};

const NEW_LINK_COLUMNS = {
  archivedAt: links.archivedAt,
  code: links.code,
  createdAt: links.createdAt,
  deletedAt: links.deletedAt,
  disabledBySystem: links.disabledBySystem,
  enabled: links.enabled,
  expiresAt: links.expiresAt,
  groupId: links.groupId,
  id: links.id,
  logoChoice: links.logoChoice,
  logoKey: links.logoKey,
  logoScale: links.logoScale,
  name: links.name,
  note: links.note,
  passwordHash: links.passwordHash,
  previewDescription: links.previewDescription,
  previewImage: links.previewImage,
  previewTitle: links.previewTitle,
  qrShape: links.qrShape,
  redirectType: links.redirectType,
  target: links.target,
  unitId: links.unitId,
  unsafeSince: links.unsafeSince
};

const LINK_COLUMNS = {
  ...NEW_LINK_COLUMNS,
  // Table names written out: inside a subquery a bare `id` would be read as the inner table's.
  visits: sql<number>`coalesce((select sum(daily_visits.count) from daily_visits where daily_visits.link_id = links.id), 0)`
};

/** What a snapshot carries, parents before children so the foreign keys hold as rows go in. */
const SNAPSHOT_TABLES = [
  organization,
  accounts,
  units,
  memberships,
  apiKeys,
  reservedCodes,
  linkGroups,
  links,
  targetChanges,
  redirectChanges,
  statusChanges,
  unitChanges,
  dailyVisits,
  dailyVisitSources
].map((table) => {
  const config = getTableConfig(table);
  return { columns: config.columns.map((column) => column.name), name: config.name };
});

/** Tables added after the first snapshots were made: one without them is still read, as empty. */
const LATER_TABLES: ReadonlySet<string> = new Set(["daily_visit_sources", "organization", "redirect_changes"]);

/** D1 takes a limited number of statements in one batch. */
const IMPORT_BATCH = 50;

const isCell = (value: unknown): value is string | number | null =>
  value === null || typeof value === "string" || typeof value === "number";

/**
 * The inserts that put a snapshot's rows back, or null when it cannot be read. Only columns this
 * version knows, and only plain values: a snapshot is data, never SQL. A column the row does not
 * carry - one added after the snapshot was made - is left to its default.
 */
const snapshotInserts = (database: D1Database, snapshot: Snapshot): D1PreparedStatement[] | null => {
  const statements: D1PreparedStatement[] = [];
  for (const table of SNAPSHOT_TABLES) {
    const rows = snapshot.tables[table.name] ?? (LATER_TABLES.has(table.name) ? [] : undefined);
    if (!Array.isArray(rows)) {
      return null;
    }
    for (const row of rows) {
      const columns = table.columns.filter((column) => row?.[column] !== undefined);
      const values = columns.map((column) => row?.[column] ?? null);
      if (columns.length === 0 || !values.every(isCell)) {
        return null;
      }
      const insert = `INSERT INTO ${table.name} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
      statements.push(database.prepare(insert).bind(...values));
    }
  }
  return statements;
};

/** The Organization's one row. */
const ORGANIZATION_ID = 1;

/** A stored list of domains, read defensively: a row is data, and a bad one means none. */
const readDomains = (stored: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((domain): domain is string => typeof domain === "string") : [];
  } catch {
    return [];
  }
};

const oldUnits = alias(units, "old_units");
const newUnits = alias(units, "new_units");

/** True when that Unit would still have a Unit Manager without this membership as one. */
const KEEPS_A_MANAGER = `(role != 'manager' OR (SELECT count(*) FROM memberships WHERE unit_id = ?2 AND role = 'manager') > 1)`;

/** One Link's rows, or every Link a Unit owns that is not deleted. */
const scopeOf = (scope: VisitScope) =>
  "linkId" in scope ? eq(links.id, scope.linkId) : and(eq(links.unitId, scope.unitId), isNull(links.deletedAt));

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

    addVisitCounts: async (counts, through) => {
      // `WHERE EXISTS` drops a count for a Link this installation does not have: a dataset can
      // be shared by mistake, and one unknown Link must not fail the whole batch.
      const totals = counts.totals.map((row) =>
        database
          .prepare(
            `INSERT INTO daily_visits (link_id, day, count) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM links WHERE id = ?1)
             ON CONFLICT (link_id, day) DO UPDATE SET count = count + excluded.count`
          )
          .bind(row.linkId, row.day, row.count)
      );
      const sources = counts.sources.map((row) =>
        database
          .prepare(
            `INSERT INTO daily_visit_sources (link_id, day, kind, value, count) SELECT ?1, ?2, ?3, ?4, ?5
             WHERE EXISTS (SELECT 1 FROM links WHERE id = ?1)
             ON CONFLICT (link_id, day, kind, value) DO UPDATE SET count = count + excluded.count`
          )
          .bind(row.linkId, row.day, row.kind, row.value, row.count)
      );
      const mark = database
        .prepare(
          `INSERT INTO visit_rollup (id, rolled_through) VALUES (1, ?1)
           ON CONFLICT (id) DO UPDATE SET rolled_through = excluded.rolled_through`
        )
        .bind(through.getTime());
      // One batch, one transaction: the counts and the mark move together.
      await database.batch([...totals, ...sources, mark]);
    },

    changeTarget: async ({ linkId, oldTarget, newTarget, by, at }) => {
      // One batch, so one transaction: the history line is written from the row as it stands, and
      // only if the Target is still the one the caller saw. Neither statement runs without the other.
      const [, updated] = await database.batch([
        database
          .prepare(
            `INSERT INTO target_changes (link_id, old_target, new_target, by_account_id, by_api_key_id, created_at)
             SELECT id, target, ?1, ?2, ?3, ?4 FROM links WHERE id = ?5 AND target = ?6`
          )
          .bind(newTarget, by.accountId, by.apiKeyId, at.getTime(), linkId, oldTarget),
        database
          // A new Target was checked on its way in: whatever the daily check said of the old one goes.
          .prepare("UPDATE links SET target = ?1, unsafe_since = NULL WHERE id = ?2 AND target = ?3")
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

    countPasswordFailure: async (linkId, minute) => {
      await database.batch([
        database.prepare("DELETE FROM link_password_failures WHERE link_id = ?1 AND minute < ?2").bind(linkId, minute),
        database
          .prepare(
            `INSERT INTO link_password_failures (link_id, minute, count) VALUES (?1, ?2, 1)
             ON CONFLICT (link_id, minute) DO UPDATE SET count = count + 1`
          )
          .bind(linkId, minute)
      ]);
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

    createGroup: async (unitId, name) => {
      const inserted = await db
        .insert(linkGroups)
        .values({ name, unitId })
        .onConflictDoNothing()
        .returning({ id: linkGroups.id, name: linkGroups.name });
      return inserted[0] ?? null;
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

    deleteGroup: async (unitId, groupId) => {
      const [, removed] = await database.batch([
        database
          .prepare(
            "UPDATE links SET group_id = NULL WHERE group_id = ?1 AND EXISTS (SELECT 1 FROM link_groups WHERE id = ?1 AND unit_id = ?2)"
          )
          .bind(groupId, unitId),
        database.prepare("DELETE FROM link_groups WHERE id = ?1 AND unit_id = ?2").bind(groupId, unitId)
      ]);
      return (removed?.meta.changes ?? 0) > 0;
    },

    deleteLink: async ({ linkId, byAccountId, at }) => {
      const deleted = await db
        .update(links)
        .set({ deletedAt: at, deletedByAccountId: byAccountId })
        .where(and(eq(links.id, linkId), isNull(links.deletedAt)))
        .returning({ id: links.id });
      return deleted.length > 0;
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
             AND NOT EXISTS (SELECT 1 FROM links WHERE unit_id = ?2 AND deleted_at IS NULL)`
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
          .bind(unitId, at.getTime()),
        // Its Group hold no Link - it owns none - so they simply go.
        database
          .prepare(
            "DELETE FROM link_groups WHERE unit_id = ?1 AND EXISTS (SELECT 1 FROM units WHERE id = ?1 AND dissolved_at = ?2)"
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

    findGroup: async (unitId, groupId) =>
      (await db
        .select({ id: linkGroups.id, name: linkGroups.name })
        .from(linkGroups)
        .where(and(eq(linkGroups.id, groupId), eq(linkGroups.unitId, unitId)))
        .get()) ?? null,

    findLink: async (code) => (await db.select(LINK_COLUMNS).from(links).where(eq(links.code, code)).get()) ?? null,

    findLinkByCode: async (code) =>
      (await db
        .select({
          deleted: sql<boolean>`${links.deletedAt} IS NOT NULL`.mapWith(Boolean),
          enabled: links.enabled,
          expiresAt: links.expiresAt,
          id: links.id,
          passwordHash: links.passwordHash,
          previewDescription: links.previewDescription,
          previewImage: links.previewImage,
          previewTitle: links.previewTitle,
          redirectType: links.redirectType,
          target: links.target,
          unitId: links.unitId,
          unsafe: sql<boolean>`${links.unsafeSince} IS NOT NULL`.mapWith(Boolean)
        })
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

    getOrganization: async (): Promise<OrganizationRecord> => {
      const row = await db.select().from(organization).where(eq(organization.id, ORGANIZATION_ID)).get();
      if (!row) {
        return { ...DEFAULT_SETTINGS, uiLogoKey: null };
      }
      return {
        brandColor: row.brandColor,
        emailDomains: readDomains(row.emailDomains),
        language: isLanguage(row.language) ? row.language : DEFAULT_SETTINGS.language,
        name: row.name,
        timeZone: row.timeZone,
        uiLogoKey: row.uiLogoKey
      };
    },

    grantSystemAdmin: async (accountId) => {
      const granted = await db
        .update(accounts)
        .set({ isSystemAdmin: true })
        .where(and(eq(accounts.id, accountId), eq(accounts.isSystemAdmin, false)))
        .returning({ id: accounts.id });
      return granted.length > 0;
    },

    importAll: async (snapshot) => {
      const used = await database
        .prepare("SELECT (SELECT count(*) FROM accounts) + (SELECT count(*) FROM links) AS total")
        .first<{ total: number }>();
      if ((used?.total ?? 0) > 0) {
        return "not-empty";
      }

      const statements = snapshotInserts(database, snapshot);
      if (!statements) {
        return "bad-snapshot";
      }

      const wipe = [...SNAPSHOT_TABLES].reverse().map((table) => database.prepare(`DELETE FROM ${table.name}`));
      try {
        // Whatever an unused installation holds gives way to the snapshot.
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

    listGroups: (unitId) =>
      db
        .select({
          id: linkGroups.id,
          // What the folder shows: archived and deleted Links are not in it.
          linkCount: sql<number>`(select count(*) from links where links.group_id = link_groups.id and links.archived_at is null and links.deleted_at is null)`,
          name: linkGroups.name
        })
        .from(linkGroups)
        .where(eq(linkGroups.unitId, unitId))
        .orderBy(linkGroups.name)
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
      const redirects = await db
        .select({
          at: redirectChanges.createdAt,
          email: accounts.email,
          keyName: apiKeys.name,
          newType: redirectChanges.newType,
          oldType: redirectChanges.oldType
        })
        .from(redirectChanges)
        .leftJoin(accounts, eq(accounts.id, redirectChanges.byAccountId))
        .leftJoin(apiKeys, eq(apiKeys.id, redirectChanges.byApiKeyId))
        .where(eq(redirectChanges.linkId, linkId))
        .orderBy(desc(redirectChanges.id))
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
      const deletion = await db
        .select({ at: links.deletedAt, email: accounts.email })
        .from(links)
        .leftJoin(accounts, eq(accounts.id, links.deletedByAccountId))
        .where(eq(links.id, linkId))
        .get();
      const entries: HistoryEntry[] = [
        ...(deletion?.at
          ? [{ at: deletion.at, by: authorName({ email: deletion.email, keyName: null }), kind: "deleted" as const }]
          : []),
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
        ...redirects.map((row) => ({
          at: row.at,
          by: authorName(row),
          kind: "redirect" as const,
          newType: row.newType,
          oldType: row.oldType
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
      db
        .select(LINK_COLUMNS)
        .from(links)
        .where(and(eq(links.unitId, unitId), isNull(links.deletedAt)))
        .orderBy(desc(links.id))
        .all(),

    listLinksToCheck: () =>
      db
        .select({ id: links.id, target: links.target, unsafeSince: links.unsafeSince })
        .from(links)
        .where(isNull(links.deletedAt))
        .orderBy(links.id)
        .all(),

    listLogoKeys: async () => {
      const rows = await database
        .prepare(
          "SELECT logo_key AS key FROM units WHERE logo_key IS NOT NULL UNION SELECT logo_key FROM links WHERE logo_key IS NOT NULL UNION SELECT ui_logo_key FROM organization WHERE ui_logo_key IS NOT NULL"
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

    listSystemAdmins: async () => {
      const rows = await db
        .select({ email: accounts.email, passwordHash: accounts.passwordHash })
        .from(accounts)
        .where(eq(accounts.isSystemAdmin, true))
        .orderBy(accounts.email)
        .all();
      return rows.map((row) => ({ email: row.email, hasPassword: row.passwordHash !== null }));
    },

    listUnitOverviews: async () => {
      const rows = await db
        .select({
          id: units.id,
          linkCount: sql<number>`(select count(*) from links where links.unit_id = units.id and links.deleted_at is null)`,
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

    listUnitTopLinks: (unitId, since, limit) =>
      db
        .select({ code: links.code, count: sql<number>`sum(${dailyVisits.count})`.mapWith(Number), name: links.name })
        .from(dailyVisits)
        .innerJoin(links, eq(links.id, dailyVisits.linkId))
        .where(and(eq(links.unitId, unitId), isNull(links.deletedAt), since ? gte(dailyVisits.day, since) : undefined))
        .groupBy(links.id)
        .orderBy(desc(sql`sum(${dailyVisits.count})`), links.code)
        .limit(limit)
        .all(),

    listUnitVisitDays: (unitId, since) =>
      db
        .select({ count: sql<number>`sum(${dailyVisits.count})`.mapWith(Number), day: dailyVisits.day })
        .from(dailyVisits)
        .innerJoin(links, eq(links.id, dailyVisits.linkId))
        .where(and(eq(links.unitId, unitId), isNull(links.deletedAt), since ? gte(dailyVisits.day, since) : undefined))
        .groupBy(dailyVisits.day)
        .orderBy(dailyVisits.day)
        .all(),

    listVisitSources: async (scope) => {
      const rows = await db
        .select({
          count: sql<number>`sum(${dailyVisitSources.count})`.mapWith(Number),
          kind: dailyVisitSources.kind,
          value: dailyVisitSources.value
        })
        .from(dailyVisitSources)
        .innerJoin(links, eq(links.id, dailyVisitSources.linkId))
        .where(and(scopeOf(scope), scope.since ? gte(dailyVisitSources.day, scope.since) : undefined))
        .groupBy(dailyVisitSources.kind, dailyVisitSources.value)
        .orderBy(desc(sql`sum(${dailyVisitSources.count})`), dailyVisitSources.value)
        .all();
      return rows;
    },

    listVisitSourcesByUnit: (unitId) =>
      db
        .select({
          code: links.code,
          count: dailyVisitSources.count,
          day: dailyVisitSources.day,
          kind: dailyVisitSources.kind,
          value: dailyVisitSources.value
        })
        .from(dailyVisitSources)
        .innerJoin(links, eq(links.id, dailyVisitSources.linkId))
        .where(and(eq(links.unitId, unitId), isNull(links.deletedAt)))
        .orderBy(links.code, dailyVisitSources.day, dailyVisitSources.kind, desc(dailyVisitSources.count))
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
        .where(and(eq(links.unitId, unitId), isNull(links.deletedAt)))
        .orderBy(links.code, dailyVisits.day)
        .all(),

    lockAccount: async (accountId, until) => {
      await db.update(accounts).set({ failedLogins: 0, lockedUntil: until }).where(eq(accounts.id, accountId));
    },

    markPasswordSetupUsed: async (tokenHash, at) => {
      await db.update(passwordSetups).set({ usedAt: at }).where(eq(passwordSetups.tokenHash, tokenHash));
    },

    mergeUnit: async ({ fromUnitId, intoUnitId, byAccountId, at }) => {
      const from = fromUnitId;
      const into = intoUnitId;
      // One batch, so one transaction: a merge never stops half-way.
      const [, , , , linksMoved, keysMoved, , , membersMoved] = await database.batch([
        // A Group whose name the other Unit already has joins that one; the rest move across.
        database
          .prepare(
            `UPDATE links SET group_id = (
               SELECT kept.id FROM link_groups kept JOIN link_groups own ON own.name = kept.name
               WHERE own.id = links.group_id AND kept.unit_id = ?2)
             WHERE unit_id = ?1 AND group_id IN (
               SELECT id FROM link_groups WHERE unit_id = ?1 AND name IN (SELECT name FROM link_groups WHERE unit_id = ?2))`
          )
          .bind(from, into),
        database
          .prepare(
            "DELETE FROM link_groups WHERE unit_id = ?1 AND name IN (SELECT name FROM link_groups WHERE unit_id = ?2)"
          )
          .bind(from, into),
        database.prepare("UPDATE link_groups SET unit_id = ?2 WHERE unit_id = ?1").bind(from, into),
        database
          .prepare(
            `INSERT INTO unit_changes (link_id, old_unit_id, new_unit_id, by_account_id, created_at)
             SELECT id, unit_id, ?2, ?3, ?4 FROM links WHERE unit_id = ?1`
          )
          .bind(from, into, byAccountId, at.getTime()),
        database.prepare("UPDATE links SET unit_id = ?2 WHERE unit_id = ?1").bind(from, into),
        database.prepare("UPDATE api_keys SET unit_id = ?2 WHERE unit_id = ?1").bind(from, into),
        database
          .prepare(
            `UPDATE memberships SET role = 'manager' WHERE unit_id = ?2
             AND account_id IN (SELECT account_id FROM memberships WHERE unit_id = ?1 AND role = 'manager')`
          )
          .bind(from, into),
        database
          .prepare(
            `INSERT OR IGNORE INTO memberships (account_id, unit_id, role, created_at)
             SELECT account_id, ?2, role, created_at FROM memberships WHERE unit_id = ?1`
          )
          .bind(from, into),
        database.prepare("DELETE FROM memberships WHERE unit_id = ?1").bind(from),
        database
          .prepare(
            `UPDATE units SET logo_key = (SELECT logo_key FROM units WHERE id = ?1)
             WHERE id = ?2 AND logo_key IS NULL`
          )
          .bind(from, into),
        // The file now belongs to the other Unit, so the dissolved one stops pointing at it.
        database
          .prepare(
            "UPDATE units SET logo_key = NULL WHERE id = ?1 AND logo_key = (SELECT logo_key FROM units WHERE id = ?2)"
          )
          .bind(from, into),
        database.prepare("UPDATE units SET dissolved_at = ?2 WHERE id = ?1").bind(from, at.getTime())
      ]);
      return {
        keys: keysMoved?.meta.changes ?? 0,
        links: linksMoved?.meta.changes ?? 0,
        members: membersMoved?.meta.changes ?? 0
      };
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
          // A Group belongs to its Unit, so a Link moving away leaves it.
          .prepare("UPDATE links SET unit_id = ?1, group_id = NULL WHERE id = ?2 AND unit_id = ?3")
          .bind(toUnitId, linkId, fromUnitId)
      ]);
      return (moved?.meta.changes ?? 0) > 0;
    },

    passwordFailures: async (linkId, minute) => {
      const row = await database
        .prepare("SELECT count FROM link_password_failures WHERE link_id = ?1 AND minute = ?2")
        .bind(linkId, minute)
        .first<{ count: number }>();
      return row?.count ?? 0;
    },

    recordVisit: async (linkId, day, origin) => {
      const countSource = (kind: VisitSourceKind, value: string) =>
        database
          .prepare(
            `INSERT INTO daily_visit_sources (link_id, day, kind, value, count) VALUES (?1, ?2, ?3, ?4, 1)
             ON CONFLICT (link_id, day, kind, value) DO UPDATE SET count = count + 1`
          )
          .bind(linkId, day, kind, value);
      await database.batch([
        database
          .prepare(
            `INSERT INTO daily_visits (link_id, day, count) VALUES (?1, ?2, 1)
             ON CONFLICT (link_id, day) DO UPDATE SET count = count + 1`
          )
          .bind(linkId, day),
        countSource("country", origin.country),
        countSource("referrer", origin.referrer),
        countSource("device", origin.device),
        countSource("browser", origin.browser)
      ]);
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

    renameGroup: async (unitId, groupId, name) => {
      const renamed = await database
        .prepare("UPDATE OR IGNORE link_groups SET name = ?1 WHERE id = ?2 AND unit_id = ?3")
        .bind(name, groupId, unitId)
        .run();
      if (renamed.meta.changes > 0) {
        return "done";
      }
      const row = await db
        .select({ id: linkGroups.id })
        .from(linkGroups)
        .where(and(eq(linkGroups.id, groupId), eq(linkGroups.unitId, unitId)))
        .get();
      return row ? "taken" : "unknown";
    },

    renameUnit: async (unitId, name) => {
      const renamed = await database
        .prepare("UPDATE OR IGNORE units SET name = ?1 WHERE id = ?2 AND dissolved_at IS NULL")
        .bind(name, unitId)
        .run();
      if (renamed.meta.changes > 0) {
        return "done";
      }
      const row = await db
        .select({ id: units.id })
        .from(units)
        .where(and(eq(units.id, unitId), isNull(units.dissolvedAt)))
        .get();
      return row ? "taken" : "unknown";
    },

    revokeApiKey: async (keyId, unitId, at) => {
      const revoked = await db
        .update(apiKeys)
        .set({ revokedAt: at })
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.unitId, unitId), isNull(apiKeys.revokedAt)))
        .returning({ id: apiKeys.id });
      return revoked.length > 0;
    },

    revokeSystemAdmin: async (accountId) => {
      // One statement decides, so two administrators removing each other cannot both succeed.
      const revoked = await database
        .prepare(
          `UPDATE accounts SET is_system_admin = 0 WHERE id = ?1 AND is_system_admin = 1
           AND (SELECT count(*) FROM accounts WHERE is_system_admin = 1) > 1`
        )
        .bind(accountId)
        .run();
      if (revoked.meta.changes > 0) {
        return "done";
      }
      const row = await db
        .select({ is: accounts.isSystemAdmin })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
      return row?.is ? "last-admin" : "not-an-admin";
    },

    saveOrganization: async (record, at) => {
      const values = {
        brandColor: record.brandColor,
        emailDomains: JSON.stringify(record.emailDomains),
        language: record.language,
        name: record.name,
        timeZone: record.timeZone,
        uiLogoKey: record.uiLogoKey,
        updatedAt: at
      };
      await db
        .insert(organization)
        .values({ ...values, id: ORGANIZATION_ID })
        .onConflictDoUpdate({ set: values, target: organization.id });
    },

    setLinkArchived: async (linkId, at) => {
      await db.update(links).set({ archivedAt: at }).where(eq(links.id, linkId));
    },

    setLinkExpiry: async (linkId, expiresAt) => {
      await db.update(links).set({ expiresAt }).where(eq(links.id, linkId));
    },

    setLinkGroup: async (linkId, groupId) => {
      await db.update(links).set({ groupId }).where(eq(links.id, linkId));
    },

    setLinkLogo: async (linkId, choice, logoKey) => {
      await db.update(links).set({ logoChoice: choice, logoKey }).where(eq(links.id, linkId));
    },

    setLinkLogoScale: async (linkId, scale) => {
      await db.update(links).set({ logoScale: scale }).where(eq(links.id, linkId));
    },

    setLinkPassword: async (linkId, passwordHash) => {
      await db.update(links).set({ passwordHash }).where(eq(links.id, linkId));
    },

    setLinkQrShape: async (linkId, qrShape) => {
      await db.update(links).set({ qrShape }).where(eq(links.id, linkId));
    },

    setLinkRedirect: async ({ linkId, type, by, at }) => {
      // As with a Target: the line and the change in one transaction, and neither when nothing changes.
      const [, updated] = await database.batch([
        database
          .prepare(
            `INSERT INTO redirect_changes (link_id, old_type, new_type, by_account_id, by_api_key_id, created_at)
             SELECT id, redirect_type, ?1, ?2, ?3, ?4 FROM links WHERE id = ?5 AND redirect_type != ?1`
          )
          .bind(type, by.accountId, by.apiKeyId, at.getTime(), linkId),
        database.prepare("UPDATE links SET redirect_type = ?1 WHERE id = ?2 AND redirect_type != ?1").bind(type, linkId)
      ]);
      return (updated?.meta.changes ?? 0) > 0;
    },

    setLinkStatus: async ({ linkId, enabled, bySystem, by, at }) => {
      // As with a Target: the line and the switch in one transaction, and neither when nothing changes.
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

    setLinkUnsafe: async (linkId, since) => {
      await db.update(links).set({ unsafeSince: since }).where(eq(links.id, linkId));
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
    },

    updateLinkDetails: async (linkId, name, note) => {
      await db.update(links).set({ name, note }).where(eq(links.id, linkId));
    },

    updateLinkPreview: async (linkId, preview) => {
      await db.update(links).set(preview).where(eq(links.id, linkId));
    },

    visitRollupMark: async () =>
      (await db.select().from(visitRollup).where(eq(visitRollup.id, 1)).get())?.rolledThrough ?? null
  };
};

export { createD1Store };
