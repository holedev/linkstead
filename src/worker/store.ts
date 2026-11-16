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
  createdAt: Date;
};

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
  listUnits: () => Promise<{ id: number; name: string }[]>;
  unitExists: (unitId: number) => Promise<boolean>;
  listMemberships: (accountId: number) => Promise<Membership[]>;
  findRole: (accountId: number, unitId: number) => Promise<Role | null>;
  listMembers: (unitId: number) => Promise<MemberRecord[]>;
  /** False when the account already belongs to that Đơn vị. */
  addMembership: (accountId: number, unitId: number, role: Role) => Promise<boolean>;

  // ── Khóa API ──────────────────────────────────────────────────────────────
  createApiKey: (key: { unitId: number; name: string; keyHash: string; createdByAccountId: number }) => Promise<number>;
  /** Every key a Đơn vị ever had, newest first - never the key itself, which is not kept. */
  listApiKeys: (unitId: number) => Promise<ApiKeyRecord[]>;
  /** The key behind a hash, unless it has been revoked. */
  findActiveApiKey: (keyHash: string) => Promise<{ id: number; unitId: number } | null>;
  /** False when that Đơn vị has no such live key. */
  revokeApiKey: (keyId: number, unitId: number, at: Date) => Promise<boolean>;
};

export type { AccountRecord, ApiKeyRecord, LinkRecord, MemberRecord, Membership, NewLink, OpenableLink, Role, Store };
