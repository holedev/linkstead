/**
 * What the request handling needs from storage, and nothing about where storage lives.
 *
 * This seam is ADR-0001 in code: the app is written against `Store`, the Cloudflare adapter
 * (`store-d1.ts`) is one implementation of it, and moving to the university's servers means
 * writing another - not touching the handlers.
 */

type Role = "manager" | "member";

type LogoChoice = "inherit" | "none" | "custom";

type UnitRecord = { id: number; name: string; logoKey: string | null };

/**
 * Where logo files live, and nothing about where that is - R2 on Cloudflare, a folder elsewhere.
 * Keys are made by the app; the bytes were checked to be PNG or JPEG before they got here.
 */
type LogoFiles = {
  put: (key: string, bytes: Uint8Array) => Promise<void>;
  get: (key: string) => Promise<Uint8Array | null>;
  delete: (key: string) => Promise<void>;
};

type OpenableLink = {
  id: number;
  target: string;
  enabled: boolean;
};

type LinkRecord = {
  id: number;
  code: string;
  name: string;
  note: string;
  target: string;
  unitId: number;
  enabled: boolean;
  /** Switched off by a Quản trị hệ thống: only they switch it back on. */
  disabledBySystem: boolean;
  /** The QR's logo for this Link: the Đơn vị's, none, or its own file under `logoKey`. */
  logoChoice: LogoChoice;
  logoKey: string | null;
  /** Every Lượt mở the Link has had, all days together. */
  visits: number;
  createdAt: Date;
};

/** Who made a change: a person or a Khóa API, never both. */
type Author = { accountId: number | null; apiKeyId: number | null };

type AuthorName = { kind: "account"; email: string } | { kind: "key"; name: string } | null;

/** One line of a Link's history: its Đích was changed, or it was switched off or on. */
type HistoryEntry = { at: Date; by: AuthorName } & (
  | { kind: "target"; oldTarget: string; newTarget: string }
  | { kind: "unit"; oldUnitName: string; newUnitName: string }
  | { kind: "status"; enabled: boolean; bySystem: boolean }
);

/** What became of a change to a membership. A Đơn vị never loses its last Quản lý đơn vị. */
type MembershipOutcome = "done" | "last-manager" | "not-a-member";

type UnitOverview = { id: number; name: string; linkCount: number; managers: string[] };

type ReservedCode = { code: string; note: string; createdAt: Date };

/**
 * Everything an installation holds, in a form another can take in (ADR-0001): each table as plain
 * rows keyed by column name, so it does not depend on which database wrote it. Sign-in sessions,
 * unused one-time links and rate-limit counters are left out - they mean nothing elsewhere.
 */
type Snapshot = {
  version: 1;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  /** Logo files by key, base64. Absent from an export made before logos existed. */
  logos?: Record<string, string>;
};

type DayVisits = { day: string; count: number };

type NewLink = {
  code: string;
  name: string;
  note: string;
  target: string;
  unitId: number;
  createdByAccountId: number | null;
  createdByApiKeyId: number | null;
};

type AccountRecord = {
  id: number;
  email: string;
  passwordHash: string | null;
  isSystemAdmin: boolean;
  lockedUntil: Date | null;
};

type Membership = { unitId: number; unitName: string; role: Role };

type MemberRecord = { email: string; role: Role; hasPassword: boolean };

type ApiKeyRecord = { id: number; name: string; createdAt: Date; revokedAt: Date | null };

type Store = {
  // ── Opening a Link ────────────────────────────────────────────────────────
  /** The Link behind a normalised Mã link, or null when there is none. */
  findLinkByCode: (code: string) => Promise<OpenableLink | null>;
  /** Adds one Lượt mở to a Link's count for a day (`yyyy-mm-dd`). */
  recordVisit: (linkId: number, day: string) => Promise<void>;

  // ── Links ─────────────────────────────────────────────────────────────────
  /** Whether the administrators hold this code back, on top of the system's own list. */
  isReservedCode: (code: string) => Promise<boolean>;
  /** Null when the Mã link is already taken - by any Link, open or switched off. */
  createLink: (link: NewLink) => Promise<LinkRecord | null>;
  listLinksByUnit: (unitId: number) => Promise<LinkRecord[]>;
  /** The whole Link behind a normalised Mã link, for whoever manages it. */
  findLink: (code: string) => Promise<LinkRecord | null>;
  /**
   * Replaces the Đích and records the change, together or not at all. False when the Đích was no
   * longer `oldTarget` - somebody else changed it first, and nothing is written.
   */
  changeTarget: (change: {
    linkId: number;
    oldTarget: string;
    newTarget: string;
    by: Author;
    at: Date;
  }) => Promise<boolean>;
  /** Switches a Link off or on and records it. False when it was already in that state. */
  setLinkStatus: (change: {
    linkId: number;
    enabled: boolean;
    bySystem: boolean;
    by: Author;
    at: Date;
  }) => Promise<boolean>;
  /** Rewords the Tên link and its note. The Mã link and the Đích are not this method's to touch. */
  updateLinkDetails: (linkId: number, name: string, note: string) => Promise<void>;
  /** The per-Link choice of logo for its QR. `logoKey` is set only with `custom`. */
  setLinkLogo: (linkId: number, choice: LogoChoice, logoKey: string | null) => Promise<void>;
  /** Every logo file a Đơn vị or a Link points at, for the export. */
  listLogoKeys: () => Promise<string[]>;
  /** Every change of Đích and every switch-off and -on, newest first. */
  listHistory: (linkId: number) => Promise<HistoryEntry[]>;
  /** Lượt mở per day, oldest first. Days with none have no row. */
  listVisits: (linkId: number) => Promise<DayVisits[]>;

  /**
   * Gives a Link to another Đơn vị and records it; its address does not change. False when the
   * Link was no longer in `fromUnitId`.
   */
  moveLink: (move: {
    linkId: number;
    fromUnitId: number;
    toUnitId: number;
    byAccountId: number;
    at: Date;
  }) => Promise<boolean>;

  /** Lượt mở of every Link a Đơn vị owns, by Mã link then day. */
  listVisitsByUnit: (unitId: number) => Promise<{ code: string; day: string; count: number }[]>;

  // ── The whole installation ────────────────────────────────────────────────
  exportAll: (at: Date) => Promise<Snapshot>;
  /**
   * Takes a snapshot into an installation nobody has used yet. `not-empty` when a Tài khoản or a
   * Link already exists; `bad-snapshot` when it cannot be read, in which case nothing is kept.
   */
  importAll: (snapshot: Snapshot) => Promise<"done" | "not-empty" | "bad-snapshot">;

  // ── Mã dành riêng ─────────────────────────────────────────────────────────
  listReservedCodes: () => Promise<ReservedCode[]>;
  /** False when the code is already held back. */
  addReservedCode: (code: string, note: string) => Promise<boolean>;
  removeReservedCode: (code: string) => Promise<boolean>;

  // ── Accounts ──────────────────────────────────────────────────────────────
  findAccountByEmail: (email: string) => Promise<AccountRecord | null>;
  findAccountById: (id: number) => Promise<AccountRecord | null>;
  createAccount: (email: string, isSystemAdmin: boolean) => Promise<AccountRecord>;
  countSystemAdmins: () => Promise<number>;
  /** Every Quản trị hệ thống, by email. */
  listSystemAdmins: () => Promise<{ email: string; hasPassword: boolean }[]>;
  /** Makes an account a Quản trị hệ thống. False when it already is one. */
  grantSystemAdmin: (accountId: number) => Promise<boolean>;
  /**
   * Takes the role away. `last-admin`, and nothing changes, when nobody else holds it: the system
   * is never left without a Quản trị hệ thống.
   */
  revokeSystemAdmin: (accountId: number) => Promise<"done" | "last-admin" | "not-an-admin">;
  /** Sets the password and forgets every failed attempt and lock before it. */
  setPassword: (accountId: number, passwordHash: string) => Promise<void>;
  /** Counts one more wrong password and returns the new consecutive total. */
  addLoginFailure: (accountId: number) => Promise<number>;
  lockAccount: (accountId: number, until: Date) => Promise<void>;
  clearLoginFailures: (accountId: number) => Promise<void>;

  // ── One-time password links ───────────────────────────────────────────────
  createPasswordSetup: (tokenHash: string, accountId: number, expiresAt: Date) => Promise<void>;
  findPasswordSetup: (tokenHash: string) => Promise<{ accountId: number; expiresAt: Date; usedAt: Date | null } | null>;
  markPasswordSetupUsed: (tokenHash: string, at: Date) => Promise<void>;

  // ── Sessions ──────────────────────────────────────────────────────────────
  createSession: (tokenHash: string, accountId: number, expiresAt: Date) => Promise<void>;
  findSession: (tokenHash: string) => Promise<{ accountId: number; expiresAt: Date } | null>;
  deleteSession: (tokenHash: string) => Promise<void>;
  deleteSessionsOfAccount: (accountId: number) => Promise<void>;

  // ── Đơn vị and their members ──────────────────────────────────────────────
  /** Every Đơn vị that has not been dissolved. */
  listUnits: () => Promise<{ id: number; name: string }[]>;
  unitExists: (unitId: number) => Promise<boolean>;
  findUnit: (unitId: number) => Promise<UnitRecord | null>;
  /** The Đơn vị's own default logo for its QR, or null to follow the university's. */
  setUnitLogo: (unitId: number, logoKey: string | null) => Promise<void>;
  /** Every live Đơn vị with how many Links it owns and who manages it. */
  listUnitOverviews: () => Promise<UnitOverview[]>;
  /** Null when the name is taken - also by a Đơn vị that was dissolved. */
  createUnit: (name: string) => Promise<{ id: number; name: string } | null>;
  /**
   * Dissolves a Đơn vị: its members leave and its Khóa API stop working. False, and nothing
   * changes, while it still owns a Link.
   */
  dissolveUnit: (unitId: number, at: Date) => Promise<boolean>;
  listMemberships: (accountId: number) => Promise<Membership[]>;
  findRole: (accountId: number, unitId: number) => Promise<Role | null>;
  listMembers: (unitId: number) => Promise<MemberRecord[]>;
  /** False when the account already belongs to that Đơn vị. */
  addMembership: (accountId: number, unitId: number, role: Role) => Promise<boolean>;
  removeMembership: (accountId: number, unitId: number) => Promise<MembershipOutcome>;
  setMembershipRole: (accountId: number, unitId: number, role: Role) => Promise<MembershipOutcome>;

  // ── Khóa API ──────────────────────────────────────────────────────────────
  createApiKey: (key: { unitId: number; name: string; keyHash: string; createdByAccountId: number }) => Promise<number>;
  /** Every key a Đơn vị ever had, newest first - never the key itself, which is not kept. */
  listApiKeys: (unitId: number) => Promise<ApiKeyRecord[]>;
  /** The key behind a hash, unless it has been revoked. */
  findActiveApiKey: (keyHash: string) => Promise<{ id: number; unitId: number } | null>;
  /** False when that Đơn vị has no such live key. */
  revokeApiKey: (keyId: number, unitId: number, at: Date) => Promise<boolean>;
  /** Counts one call by a key in a minute (minutes since 1970) and returns that minute's total. */
  countApiCall: (apiKeyId: number, minute: number) => Promise<number>;
};

export type {
  AccountRecord,
  ApiKeyRecord,
  Author,
  AuthorName,
  DayVisits,
  HistoryEntry,
  LinkRecord,
  LogoChoice,
  LogoFiles,
  MemberRecord,
  Membership,
  MembershipOutcome,
  NewLink,
  OpenableLink,
  ReservedCode,
  Role,
  Snapshot,
  Store,
  UnitOverview,
  UnitRecord
};
