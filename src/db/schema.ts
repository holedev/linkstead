import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * The whole model. Names follow CONTEXT.md: account = Account, unit = Unit, link = Link,
 * target = Target, visit = Visit.
 *
 * Nothing here has a delete path on purpose - a Link is switched off, never removed (ADR-0002).
 */

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

/** Account. Known by its email and by nothing else (ADR-0003). */
const accounts = sqliteTable("accounts", {
  createdAt: createdAt(),
  email: text("email").notNull().unique(),
  /** Consecutive wrong passwords since the last right one. Five lock the account for a while. */
  failedLogins: integer("failed_logins").notNull().default(0),
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** System Administrator. A flag on the account, not a membership: it belongs to no Unit. */
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

/** Unit. */
const units = sqliteTable("units", {
  createdAt: createdAt(),
  /**
   * Set when a System Administrator dissolved the Unit - possible only once it owns no Link. The
   * row stays: Links that moved away and their history still name it.
   */
  dissolvedAt: integer("dissolved_at", { mode: "timestamp_ms" }),
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** The Unit's own default logo, as a storage key. Null means the Organization's. */
  logoKey: text("logo_key"),
  name: text("name").notNull().unique()
});

/** Member: which Account belongs to which Unit, and whether as its Unit Manager. */
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

/** API Key. Belongs to a Unit, never to a person. Only the hash is kept. */
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

/** Reserved Code the administrators keep, on top of the system's own in `domain/link-code.ts`. */
const reservedCodes = sqliteTable("reserved_codes", {
  code: text("code").primaryKey(),
  createdAt: createdAt(),
  note: text("note").notNull().default("")
});

/**
 * Group: a Unit's own way of sorting its Links - by event, by year, by issue. A Link is in at most
 * one. Unlike a Link, a Group can be renamed and deleted: nothing printed carries it.
 */
const linkGroups = sqliteTable(
  "link_groups",
  {
    createdAt: createdAt(),
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id)
  },
  (table) => [uniqueIndex("link_groups_unit_name_unique").on(table.unitId, table.name)]
);

/** Link. */
const links = sqliteTable(
  "links",
  {
    /**
     * When it was put away from the Unit's list. It still opens: tidying, not switching off.
     */
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    /**
     * Link Code, stored normalised. Unique for ever: a deleted Link keeps its row, so its code is
     * never handed out again (ADR-0004).
     */
    code: text("code").notNull(),
    createdAt: createdAt(),
    createdByAccountId: integer("created_by_account_id").references(() => accounts.id),
    createdByApiKeyId: integer("created_by_api_key_id").references(() => apiKeys.id),
    /** Who deleted it, and when (ADR-0004). A deleted Link opens nowhere and is listed nowhere. */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    deletedByAccountId: integer("deleted_by_account_id").references(() => accounts.id),
    /** Set when a System Administrator switched it off: then only they switch it back on. */
    disabledBySystem: integer("disabled_by_system", { mode: "boolean" }).notNull().default(false),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /**
     * When it stops opening, if ever (ADR-0006). Past it the Link shows the expired notice; its
     * Link Code stays taken, and a later date - or none - brings it back.
     */
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    /** The Group it is sorted into, of its own Unit, if any. */
    groupId: integer("group_id").references(() => linkGroups.id),
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** `inherit` follows the Unit, then the Organization. `custom` reads `logoKey`. */
    logoChoice: text("logo_choice", { enum: ["inherit", "none", "custom"] })
      .notNull()
      .default("inherit"),
    logoKey: text("logo_key"),
    /** How much of the QR's logo box the logo fills, in percent (`domain/qr.ts`). The box itself is fixed. */
    logoScale: integer("logo_scale").notNull().default(100),
    /** Link Name. */
    name: text("name").notNull(),
    note: text("note").notNull().default(""),
    /**
     * A password visitors must give before being sent on (ADR-0006), as `domain/link-password.ts`
     * stores it - never the password itself. Null: the Link opens for anyone.
     */
    passwordHash: text("password_hash"),
    /**
     * How the Link looks when pasted into a chat or a post, where its Unit wants that set by hand.
     * Empty takes the Target's own (`domain/preview.ts`). Public, unlike the Link Name and the note.
     */
    previewDescription: text("preview_description").notNull().default(""),
    previewImage: text("preview_image").notNull().default(""),
    previewTitle: text("preview_title").notNull().default(""),
    /** How the QR's modules are drawn (`domain/qr-style.ts`), kept so every download looks the same. */
    qrShape: text("qr_shape", { enum: ["square", "dots"] })
      .notNull()
      .default("square"),
    /** Target - the only column here that is expected to change. */
    target: text("target").notNull(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id),
    /**
     * When the daily check found the Target listed as unsafe. Visitors then meet a warning instead
     * of the redirect, until the Target is changed or a later check clears it.
     */
    unsafeSince: integer("unsafe_since", { mode: "timestamp_ms" })
  },
  (table) => [uniqueIndex("links_code_unique").on(table.code), index("links_unit_idx").on(table.unitId)]
);

/** The history of a Link's Target: every change, and who or which key made it. */
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

/** Every move of a Link from one Unit to another. Its address does not change (ADR-0002). */
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
 * How many calls an API Key made in one minute, for the rate limit. `minute` counts minutes since
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
 * switch-off made as System Administrator - the kind only they undo.
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

/**
 * Wrong passwords given for a Link in one minute (minutes since 1970), so guessing is slowed down.
 * Rows of earlier minutes are removed as new ones come.
 */
const linkPasswordFailures = sqliteTable(
  "link_password_failures",
  {
    count: integer("count").notNull().default(0),
    linkId: integer("link_id")
      .notNull()
      .references(() => links.id),
    minute: integer("minute").notNull()
  },
  (table) => [primaryKey({ columns: [table.linkId, table.minute] })]
);

/** Visits, one row per Link per Vietnamese day. A count and nothing about who. */
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

/**
 * Visits by where they came from, one row per Link per day per country or per referring site
 * (ADR-0005). Counts only: the country is the one the network reports, the site is a host name,
 * and nothing ties a row to a person. An empty `value` is "not known" - a scanned QR sends no site.
 */
const dailyVisitSources = sqliteTable(
  "daily_visit_sources",
  {
    count: integer("count").notNull().default(0),
    day: text("day").notNull(),
    kind: text("kind", { enum: ["country", "referrer"] }).notNull(),
    linkId: integer("link_id")
      .notNull()
      .references(() => links.id),
    value: text("value").notNull()
  },
  (table) => [primaryKey({ columns: [table.linkId, table.day, table.kind, table.value] })]
);

/**
 * The one Organization an installation serves (ADR-0007): a single row, id 1, written by a System
 * Administrator. No row yet means the defaults in `domain/organization.ts`.
 */
const organization = sqliteTable("organization", {
  /** `#rrggbb`. */
  brandColor: text("brand_color").notNull(),
  /** The domains an Account's email may have, as a JSON array. Empty: any address. */
  emailDomains: text("email_domains").notNull().default("[]"),
  id: integer("id").primaryKey(),
  /** `en` or `vi`: the language of the UI and of the pages visitors meet. */
  language: text("language", { enum: ["en", "vi"] }).notNull(),
  name: text("name").notNull(),
  /** An IANA zone: the days Visits are counted under, and how an expiry is read. */
  timeZone: text("time_zone").notNull(),
  /** The logo the UI shows in its header and as its icon, as a storage key. Not the QR's. */
  uiLogoKey: text("ui_logo_key"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
});

export {
  accounts,
  apiKeys,
  apiKeyUsage,
  dailyVisitSources,
  dailyVisits,
  linkGroups,
  linkPasswordFailures,
  links,
  memberships,
  organization,
  passwordSetups,
  reservedCodes,
  sessions,
  statusChanges,
  targetChanges,
  unitChanges,
  units
};
