/**
 * What the request handling needs from storage, and nothing about where storage lives.
 *
 * This seam is ADR-0001 in code: the app is written against `Store`, the Cloudflare adapter
 * (`store-d1.ts`) is one implementation of it, and moving to the university's servers means
 * writing another - not touching the handlers.
 */

import type { OrganizationSettings } from "../domain/organization";
import type { QrShape } from "../domain/qr-style";

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

/** How a Link presents itself when pasted somewhere, as its Đơn vị set it. Empty means the Đích's. */
type LinkPreview = { previewTitle: string; previewDescription: string; previewImage: string };

type OpenableLink = LinkPreview & {
  id: number;
  target: string;
  enabled: boolean;
  /** Deleted: it opens nowhere, and its code is never given out again (ADR-0004). */
  deleted: boolean;
  /** The daily check found the Đích listed as unsafe: visitors are warned instead of sent on. */
  unsafe: boolean;
  /** Past this it shows the expired notice (ADR-0006). */
  expiresAt: Date | null;
  /** Set when visitors must give a password first (`domain/link-password.ts`). */
  passwordHash: string | null;
};

type LinkRecord = LinkPreview & {
  id: number;
  code: string;
  name: string;
  note: string;
  target: string;
  unitId: number;
  enabled: boolean;
  /** Switched off by a Quản trị hệ thống: only they switch it back on. */
  disabledBySystem: boolean;
  /** The Nhóm it is sorted into, if any. */
  groupId: number | null;
  /** The QR's logo for this Link: the Đơn vị's, none, or its own file under `logoKey`. */
  logoChoice: LogoChoice;
  logoKey: string | null;
  /** How much of the QR's logo box the logo fills, in percent. */
  logoScale: number;
  /** Every Lượt mở the Link has had, all days together. */
  visits: number;
  createdAt: Date;
  /** Put away from the Đơn vị's list. It still opens. */
  archivedAt: Date | null;
  /** Deleted (ADR-0004). Only a lookup by a Quản trị hệ thống ever returns such a Link. */
  deletedAt: Date | null;
  /** Since when the daily check has found the Đích listed as unsafe, if it has. */
  unsafeSince: Date | null;
  /** Past this it stops opening (ADR-0006). */
  expiresAt: Date | null;
  /** What its password is kept as, if it has one. Never leaves the server. */
  passwordHash: string | null;
  /** How its QR's modules are drawn. */
  qrShape: QrShape;
};

/** Who made a change: a person or a Khóa API, never both. */
type Author = { accountId: number | null; apiKeyId: number | null };

type AuthorName = { kind: "account"; email: string } | { kind: "key"; name: string } | null;

/** One line of a Link's history: its Đích was changed, or it was switched off or on. */
type HistoryEntry = { at: Date; by: AuthorName } & (
  | { kind: "target"; oldTarget: string; newTarget: string }
  | { kind: "unit"; oldUnitName: string; newUnitName: string }
  | { kind: "status"; enabled: boolean; bySystem: boolean }
  | { kind: "deleted" }
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

/** Where Lượt mở came from: a country (two letters) or a referring site; "" is "not known". */
type VisitSource = { kind: "country" | "referrer"; value: string; count: number };

/** Which Lượt mở to add up: one Link's or a whole Đơn vị's, from a day on (`yyyy-mm-dd`) or ever. */
type VisitScope = ({ linkId: number } | { unitId: number }) & { since?: string };

/** A Link to look at again in the daily safety check. */
type LinkToCheck = { id: number; target: string; unsafeSince: Date | null };

type NewLink = {
  code: string;
  groupId?: number | null;
  name: string;
  note: string;
  target: string;
  unitId: number;
  createdByAccountId: number | null;
  createdByApiKeyId: number | null;
};

/** A Nhóm: a Đơn vị's own way of sorting its Links. */
type LinkGroup = { id: number; name: string; linkCount: number };

/** The Organization as kept: its settings, and the key of the logo its UI shows, if one was uploaded. */
type OrganizationRecord = OrganizationSettings & { uiLogoKey: string | null };

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
  /**
   * Adds one Lượt mở to a Link's count for a day (`yyyy-mm-dd`), and to the counts of the country
   * and the site it came from ("" when not known).
   */
  recordVisit: (linkId: number, day: string, source: { country: string; referrer: string }) => Promise<void>;

  // ── Links ─────────────────────────────────────────────────────────────────
  /** Whether the administrators hold this code back, on top of the system's own list. */
  isReservedCode: (code: string) => Promise<boolean>;
  /** Null when the Mã link is already taken - by any Link, open, switched off or deleted. */
  createLink: (link: NewLink) => Promise<LinkRecord | null>;
  /** A Đơn vị's Links, archived ones included, deleted ones not. */
  listLinksByUnit: (unitId: number) => Promise<LinkRecord[]>;
  /** The whole Link behind a normalised Mã link - also a deleted one, which the caller turns away. */
  findLink: (code: string) => Promise<LinkRecord | null>;
  /** Puts a Link away from the Đơn vị's list, or back with null. It keeps opening either way. */
  setLinkArchived: (linkId: number, at: Date | null) => Promise<void>;
  /**
   * Deletes a Link: from now on it opens nowhere and is listed nowhere, but its row - and so its
   * Mã link - stays, never to be given out again (ADR-0004). False when it was already deleted.
   */
  deleteLink: (deletion: { linkId: number; byAccountId: number; at: Date }) => Promise<boolean>;
  /** Every Link that is not deleted, for the daily safety check of its Đích. */
  listLinksToCheck: () => Promise<LinkToCheck[]>;
  /** Sets the password visitors must give, as its stored form, or none with null. */
  setLinkPassword: (linkId: number, passwordHash: string | null) => Promise<void>;
  /** Sets when the Link stops opening, or never with null. */
  setLinkExpiry: (linkId: number, expiresAt: Date | null) => Promise<void>;
  setLinkQrShape: (linkId: number, shape: QrShape) => Promise<void>;
  /** Wrong passwords given for a Link in a minute (minutes since 1970). */
  passwordFailures: (linkId: number, minute: number) => Promise<number>;
  /** Counts one more wrong password in a minute, forgetting earlier minutes. */
  countPasswordFailure: (linkId: number, minute: number) => Promise<void>;
  /** Marks a Link's Đích as found unsafe since a moment, or clears that with null. */
  setLinkUnsafe: (linkId: number, since: Date | null) => Promise<void>;
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
  /** Sets how the Link presents itself when pasted somewhere. Empty parts follow the Đích. */
  updateLinkPreview: (linkId: number, preview: LinkPreview) => Promise<void>;
  /** The per-Link choice of logo for its QR. `logoKey` is set only with `custom`. */
  setLinkLogo: (linkId: number, choice: LogoChoice, logoKey: string | null) => Promise<void>;
  /** How much of the QR's logo box the Link's logo fills, in percent. */
  setLinkLogoScale: (linkId: number, scale: number) => Promise<void>;
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
  /** Lượt mở of every Link a Đơn vị owns, by Mã link, day, and where they came from. */
  listVisitSourcesByUnit: (
    unitId: number
  ) => Promise<{ code: string; day: string; kind: "country" | "referrer"; value: string; count: number }[]>;
  /** Lượt mở added up by country and by referring site, most first. */
  listVisitSources: (scope: VisitScope) => Promise<VisitSource[]>;
  /** A Đơn vị's Lượt mở per day, all its Links together, oldest first. */
  listUnitVisitDays: (unitId: number, since?: string) => Promise<DayVisits[]>;
  /** A Đơn vị's most opened Links over a stretch of days, most first. */
  listUnitTopLinks: (
    unitId: number,
    since: string | undefined,
    limit: number
  ) => Promise<{ code: string; name: string; count: number }[]>;

  // ── The whole installation ────────────────────────────────────────────────
  /** The Organization's settings - the defaults in `domain/organization.ts` until any are saved. */
  getOrganization: () => Promise<OrganizationRecord>;
  saveOrganization: (organization: OrganizationRecord, at: Date) => Promise<void>;
  exportAll: (at: Date) => Promise<Snapshot>;
  /**
   * Takes a snapshot into an installation nobody has used yet. `not-empty` when a Tài khoản or a
   * Link already exists; `bad-snapshot` when it cannot be read, in which case nothing is kept.
   */
  importAll: (snapshot: Snapshot) => Promise<"done" | "not-empty" | "bad-snapshot">;

  // ── Nhóm ──────────────────────────────────────────────────────────────────
  /** A Đơn vị's Nhóm by name, each with how many Links it holds. */
  listGroups: (unitId: number) => Promise<LinkGroup[]>;
  findGroup: (unitId: number, groupId: number) => Promise<{ id: number; name: string } | null>;
  /** Null when the Đơn vị already has a Nhóm of that name. */
  createGroup: (unitId: number, name: string) => Promise<{ id: number; name: string } | null>;
  renameGroup: (unitId: number, groupId: number, name: string) => Promise<"done" | "taken" | "unknown">;
  /** Removes a Nhóm; its Links stay, in no Nhóm. False when there is no such Nhóm in the Đơn vị. */
  deleteGroup: (unitId: number, groupId: number) => Promise<boolean>;
  /** Sorts a Link into a Nhóm of its own Đơn vị, or into none. The caller checks the Nhóm is its. */
  setLinkGroup: (linkId: number, groupId: number | null) => Promise<void>;

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
   * Folds one live Đơn vị into another, in one transaction: its Links move (each noting it in its
   * history), its Khóa API keep working for the other, its members join it - keeping the higher
   * role where someone was in both - its default logo is kept if the other has none, and it is
   * then dissolved. The caller checks first that both exist and differ.
   */
  mergeUnit: (merge: {
    fromUnitId: number;
    intoUnitId: number;
    byAccountId: number;
    at: Date;
  }) => Promise<{ links: number; members: number; keys: number }>;
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
  LinkGroup,
  LinkPreview,
  LinkRecord,
  LinkToCheck,
  LogoChoice,
  LogoFiles,
  MemberRecord,
  Membership,
  MembershipOutcome,
  NewLink,
  OpenableLink,
  OrganizationRecord,
  ReservedCode,
  Role,
  Snapshot,
  Store,
  UnitOverview,
  UnitRecord,
  VisitScope,
  VisitSource
};
