import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * The whole model of the first version. Names follow CONTEXT.md: account = Tài khoản, unit = Đơn
 * vị, link = Link, target = Đích, visit = Lượt mở.
 *
 * Nothing here has a delete path on purpose - a Link is switched off, never removed (ADR-0002).
 */

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

/** Tài khoản. Known by its university email and by nothing else (ADR-0003). */
const accounts = sqliteTable("accounts", {
  createdAt: createdAt(),
  email: text("email").notNull().unique(),
  /** Consecutive wrong passwords since the last right one. Five lock the account for a while. */
  failedLogins: integer("failed_logins").notNull().default(0),
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Quản trị hệ thống. A flag on the account, not a membership: it belongs to no Đơn vị. */
  isSystemAdmin: integer("is_system_admin", { mode: "boolean" }).notNull().default(false),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  /** Null until the one-time setup link has been used. */
  passwordHash: text("password_hash")
});

/** The one-time link an insider passes on so a colleague can set, or reset, a password. */
const passwordSetups = sqliteTable("password_setups", {
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  createdAt: createdAt(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  tokenHash: text("token_hash").primaryKey(),
  usedAt: integer("used_at", { mode: "timestamp_ms" })
});

/** A signed-in browser. Kept in the database rather than in a signed cookie so it can be ended. */
const sessions = sqliteTable(
  "sessions",
  {
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: createdAt(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    tokenHash: text("token_hash").primaryKey()
  },
  (table) => [index("sessions_account_idx").on(table.accountId)]
);

/** Đơn vị. */
const units = sqliteTable("units", {
  createdAt: createdAt(),
  /**
   * Set when a Quản trị hệ thống dissolved the Đơn vị - possible only once it owns no Link. The
   * row stays: Links that moved away and their history still name it.
   */
  dissolvedAt: integer("dissolved_at", { mode: "timestamp_ms" }),
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** The Đơn vị's own default logo, as a storage key. Null means the university's. */
  logoKey: text("logo_key"),
  name: text("name").notNull().unique()
});

/** Thành viên: which Tài khoản belongs to which Đơn vị, and whether as its Quản lý đơn vị. */
const memberships = sqliteTable(
  "memberships",
  {
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: createdAt(),
    role: text("role", { enum: ["manager", "member"] }).notNull(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id)
  },
  (table) => [primaryKey({ columns: [table.accountId, table.unitId] })]
);

/** Khóa API. Belongs to a Đơn vị, never to a person. Only the hash is kept. */
const apiKeys = sqliteTable("api_keys", {
  createdAt: createdAt(),
  createdByAccountId: integer("created_by_account_id").references(() => accounts.id),
  id: integer("id").primaryKey({ autoIncrement: true }),
  keyHash: text("key_hash").notNull().unique(),
  name: text("name").notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  unitId: integer("unit_id")
    .notNull()
    .references(() => units.id)
});

/** Mã dành riêng the administrators keep, on top of the system's own in `domain/link-code.ts`. */
const reservedCodes = sqliteTable("reserved_codes", {
  code: text("code").primaryKey(),
  createdAt: createdAt(),
  note: text("note").notNull().default("")
});

/** Link. */
const links = sqliteTable(
  "links",
  {
    /** Mã link, stored normalised. Unique for ever: there is no delete to free it. */
    code: text("code").notNull(),
    createdAt: createdAt(),
    createdByAccountId: integer("created_by_account_id").references(() => accounts.id),
    createdByApiKeyId: integer("created_by_api_key_id").references(() => apiKeys.id),
    /** Set when a Quản trị hệ thống switched it off: then only they switch it back on. */
    disabledBySystem: integer("disabled_by_system", { mode: "boolean" }).notNull().default(false),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** `inherit` follows the Đơn vị, then the university. `custom` reads `logoKey`. */
    logoChoice: text("logo_choice", { enum: ["inherit", "none", "custom"] })
      .notNull()
      .default("inherit"),
    logoKey: text("logo_key"),
    /** Tên link. */
    name: text("name").notNull(),
    note: text("note").notNull().default(""),
    /** Đích - the only column here that is expected to change. */
    target: text("target").notNull(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id)
  },
  (table) => [uniqueIndex("links_code_unique").on(table.code), index("links_unit_idx").on(table.unitId)]
);

/** The history of a Link's Đích: every change, and who or which key made it. */
const targetChanges = sqliteTable(
  "target_changes",
  {
    byAccountId: integer("by_account_id").references(() => accounts.id),
    byApiKeyId: integer("by_api_key_id").references(() => apiKeys.id),
    createdAt: createdAt(),
    id: integer("id").primaryKey({ autoIncrement: true }),
    linkId: integer("link_id")
      .notNull()
      .references(() => links.id),
    newTarget: text("new_target").notNull(),
    oldTarget: text("old_target").notNull()
  },
  (table) => [index("target_changes_link_idx").on(table.linkId)]
);

/** Every move of a Link from one Đơn vị to another. Its address does not change (ADR-0002). */
const unitChanges = sqliteTable(
  "unit_changes",
  {
    byAccountId: integer("by_account_id").references(() => accounts.id),
    createdAt: createdAt(),
    id: integer("id").primaryKey({ autoIncrement: true }),
    linkId: integer("link_id")
      .notNull()
      .references(() => links.id),
    newUnitId: integer("new_unit_id")
      .notNull()
      .references(() => units.id),
    oldUnitId: integer("old_unit_id")
      .notNull()
      .references(() => units.id)
  },
  (table) => [index("unit_changes_link_idx").on(table.linkId)]
);

/**
 * How many calls a Khóa API made in one minute, for the rate limit. `minute` counts minutes since
 * 1970; rows of earlier minutes are removed as the key is used.
 */
const apiKeyUsage = sqliteTable(
  "api_key_usage",
  {
    apiKeyId: integer("api_key_id")
      .notNull()
      .references(() => apiKeys.id),
    count: integer("count").notNull().default(0),
    minute: integer("minute").notNull()
  },
  (table) => [primaryKey({ columns: [table.apiKeyId, table.minute] })]
);

/**
 * Every time a Link was switched off or on, and who or which key did it. `bySystem` marks a
 * switch-off made as Quản trị hệ thống - the kind only they undo.
 */
const statusChanges = sqliteTable(
  "status_changes",
  {
    byAccountId: integer("by_account_id").references(() => accounts.id),
    byApiKeyId: integer("by_api_key_id").references(() => apiKeys.id),
    bySystem: integer("by_system", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    id: integer("id").primaryKey({ autoIncrement: true }),
    linkId: integer("link_id")
      .notNull()
      .references(() => links.id)
  },
  (table) => [index("status_changes_link_idx").on(table.linkId)]
);

/** Lượt mở, one row per Link per Vietnamese day. A count and nothing about who. */
const dailyVisits = sqliteTable(
  "daily_visits",
  {
    count: integer("count").notNull().default(0),
    /** `yyyy-mm-dd`, from `domain/visit.ts::visitDay`. */
    day: text("day").notNull(),
    linkId: integer("link_id")
      .notNull()
      .references(() => links.id)
  },
  (table) => [primaryKey({ columns: [table.linkId, table.day] })]
);

export {
  accounts,
  apiKeys,
  apiKeyUsage,
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
};
