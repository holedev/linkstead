/**
 * What the request handling needs from storage, and nothing about where storage lives.
 *
 * This seam is ADR-0001 in code: the app is written against `Store`, the Cloudflare adapter
 * (`store-d1.ts`) is one implementation of it, and moving to the university's servers means
 * writing another - not touching the handlers.
 */

type Role = "manager" | "member";

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
  findUnit: (unitId: number) => Promise<{ id: number; name: string } | null>;
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
  MemberRecord,
  Membership,
  MembershipOutcome,
  NewLink,
  OpenableLink,
  ReservedCode,
  Role,
  Store,
  UnitOverview
};
