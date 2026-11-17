import { stretchPassword } from "../domain/password";
import { DEFAULT_QR_STYLE, type QrShape, type QrStyle } from "../domain/qr-style";

/** The one place the UI talks to the server. Every screen goes through `api`. */

type Role = "manager" | "member";
type UnitMembership = { unitId: number; unitName: string; role: Role };
type Me = { email: string; isSystemAdmin: boolean; units: UnitMembership[] };
type Link = {
  code: string;
  url: string;
  name: string;
  note: string;
  target: string;
  unitId: number;
  enabled: boolean;
  disabledBySystem: boolean;
  /** The Nhóm it is sorted into, if any. */
  groupId: number | null;
  logoChoice: LogoChoice;
  /** How much of the QR's logo box the logo fills, in percent: 40 to 100. */
  logoScale: number;
  /** How it looks when pasted somewhere, as its Đơn vị set it. Empty parts take the Đích's. */
  preview: Preview;
  visits: number;
  createdAt: string;
  /** Put away from the list. It still opens. */
  archived: boolean;
  /** Since when the daily check has found the Đích listed as unsafe, or null. */
  unsafeSince: string | null;
  /** When it stops opening, or null for never. */
  expiresAt: string | null;
  /** Whether visitors must give a password first. */
  hasPassword: boolean;
  qrShape: QrShape;
};
type Author = { kind: "account"; email: string } | { kind: "key"; name: string } | null;
type HistoryEntry = { at: string; by: Author } & (
  | { kind: "target"; oldTarget: string; newTarget: string }
  | { kind: "unit"; oldUnitName: string; newUnitName: string }
  | { kind: "status"; enabled: boolean; bySystem: boolean }
  | { kind: "deleted" }
);
type UnitOverview = { id: number; name: string; linkCount: number; managers: string[] };
type ReservedCode = { code: string; note: string; createdAt: string };
/** A Link as a Quản trị hệ thống finds it: with the Đơn vị that owns it and its history. */
type FoundLink = Link & { unitName: string; history: HistoryEntry[]; deletedAt: string | null };
type NewLinkInput = {
  unitId: number;
  name: string;
  target: string;
  code: string;
  note: string;
  groupId?: number | null;
};
/** A Nhóm: a Đơn vị's own way of sorting its Links. */
type LinkGroup = { id: number; name: string; linkCount: number };
type Preview = { title: string; description: string; image: string };
/** A country (two letters) or a referring site, and its Lượt mở. "" is "not known". */
type VisitSource = { value: string; count: number };
type Visits = {
  total: number;
  days: { day: string; count: number }[];
  countries: VisitSource[];
  referrers: VisitSource[];
};
/** A Đơn vị's Lượt mở over a stretch of days, or since the start when `since` is null. */
type UnitVisits = Visits & {
  since: string | null;
  today: string;
  topLinks: { code: string; name: string; count: number }[];
};
type LogoChoice = "inherit" | "none" | "custom";
type Member = { email: string; role: Role; hasPassword: boolean };
type ApiKey = { id: number; name: string; createdAt: string; revokedAt: string | null };

/** A refusal from the server: its machine-readable reason, never prose. `messages.ts` words it. */
class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: string | undefined;

  constructor(status: number, code: string, problem?: string) {
    super(code);
    this.status = status;
    this.code = code;
    this.problem = problem;
  }
}

const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  // A request that never got an answer is its own reason, told apart from any the server gives.
  const response = await fetch(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    method
  }).catch(() => null);
  if (!response) {
    throw new ApiFailure(0, "network");
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const data = (await response.json().catch(() => null)) as { error?: string; problem?: string } | null;
  if (!response.ok) {
    throw new ApiFailure(response.status, data?.error ?? "unknown", data?.problem);
  }
  return data as T;
};

const failureOf = async (response: Response): Promise<ApiFailure> => {
  const data = (await response.json().catch(() => null)) as { error?: string; problem?: string } | null;
  return new ApiFailure(response.status, data?.error ?? "unknown", data?.problem);
};

/** A QR as the server drew it. The API returns SVG only; PNG is made from it in the browser. */
const svg = async (path: string): Promise<string> => {
  const response = await fetch(path, { credentials: "same-origin" }).catch(() => null);
  if (!response) {
    throw new ApiFailure(0, "network");
  }
  if (!response.ok) {
    throw await failureOf(response);
  }
  return response.text();
};

/** Sends a logo file as the request body. The server decides what it is from its bytes. */
const upload = async (path: string, file: File): Promise<void> => {
  const response = await fetch(path, {
    body: file,
    credentials: "same-origin",
    headers: { "content-type": "application/octet-stream" },
    method: "PUT"
  }).catch(() => null);
  if (!response) {
    throw new ApiFailure(0, "network");
  }
  if (!response.ok) {
    throw await failureOf(response);
  }
};

const api = {
  addMember: (unitId: number, email: string, role: Role) =>
    call<{ email: string; role: Role; setupUrl: string | null }>("POST", `/api/units/${unitId}/members`, {
      email,
      role
    }),
  adminAdmins: () => call<{ admins: { email: string; hasPassword: boolean }[] }>("GET", "/api/admin/admins"),
  adminCreateLink: (input: NewLinkInput) => call<Link>("POST", "/api/admin/links", input),
  adminCreateUnit: (name: string, managerEmail: string) =>
    call<{ id: number; name: string; managerEmail: string; setupUrl: string | null }>("POST", "/api/admin/units", {
      managerEmail,
      name
    }),
  adminDissolveUnit: (unitId: number) => call<void>("DELETE", `/api/admin/units/${unitId}`),
  adminFindLink: (code: string) => call<FoundLink>("GET", `/api/admin/links/${encodeURIComponent(code)}`),
  adminGrant: (email: string) =>
    call<{ email: string; setupUrl: string | null }>("POST", "/api/admin/admins", { email }),
  adminLogo: () => call<{ set: boolean }>("GET", "/api/admin/qr-logo"),
  adminLogoPreview: () => svg("/api/admin/qr-preview"),
  adminMergeUnit: (unitId: number, intoUnitId: number) =>
    call<{
      from: string;
      into: { id: number; name: string };
      moved: { links: number; members: number; keys: number };
    }>("POST", `/api/admin/units/${unitId}/merge`, { intoUnitId }),
  adminMoveLink: (code: string, unitId: number) =>
    call<Link & { unitName: string }>("POST", `/api/admin/links/${code}/move`, { unitId }),
  adminRemoveLogo: () => call<void>("DELETE", "/api/admin/qr-logo"),
  adminReserve: (code: string, note: string) =>
    call<{ code: string; note: string }>("POST", "/api/admin/reserved-codes", { code, note }),
  adminReservedCodes: () => call<{ codes: ReservedCode[] }>("GET", "/api/admin/reserved-codes"),
  adminRevoke: (email: string) => call<void>("DELETE", `/api/admin/admins/${encodeURIComponent(email)}`),
  adminUnits: () => call<{ units: UnitOverview[] }>("GET", "/api/admin/units"),
  adminUnreserve: (code: string) => call<void>("DELETE", `/api/admin/reserved-codes/${code}`),
  adminUploadLogo: (file: File) => upload("/api/admin/qr-logo", file),
  archiveLink: (code: string) => call<Link>("POST", `/api/links/${code}/archive`),
  changeTarget: (code: string, target: string, expectedTarget: string, resetPreview = false) =>
    call<Link>("PUT", `/api/links/${code}/target`, { expectedTarget, resetPreview, target }),
  createGroup: (unitId: number, name: string) => call<LinkGroup>("POST", `/api/units/${unitId}/groups`, { name }),
  createKey: (unitId: number, name: string) =>
    call<{ id: number; key: string; name: string }>("POST", `/api/units/${unitId}/keys`, { name }),
  createLink: (input: NewLinkInput) => call<Link>("POST", "/api/links", input),
  deleteGroup: (unitId: number, groupId: number) => call<void>("DELETE", `/api/units/${unitId}/groups/${groupId}`),
  /** Deletes a Link for good. `confirmCode` is its Mã link typed back by whoever confirmed. */
  deleteLink: (code: string, confirmCode: string) => call<void>("DELETE", `/api/links/${code}`, { confirmCode }),
  disableLink: (code: string) => call<Link>("POST", `/api/links/${code}/disable`),
  enableLink: (code: string) => call<Link>("POST", `/api/links/${code}/enable`),
  groups: (unitId: number) => call<{ groups: LinkGroup[] }>("GET", `/api/units/${unitId}/groups`),
  history: (code: string) => call<{ history: HistoryEntry[] }>("GET", `/api/links/${code}/history`),
  keys: (unitId: number) => call<{ keys: ApiKey[] }>("GET", `/api/units/${unitId}/keys`),
  linkPreview: (code: string) =>
    call<{ own: Preview; fromTarget: Preview | null }>("GET", `/api/links/${code}/preview`),
  linkQr: (code: string, style: QrStyle = DEFAULT_QR_STYLE) =>
    svg(`/api/links/${code}/qr${style === DEFAULT_QR_STYLE ? "" : `?style=${style}`}`),
  links: (unitId: number) => call<{ links: Link[] }>("GET", `/api/links?unitId=${unitId}`),
  /** The password is stretched here, in the browser; the server is sent the result and never the password. */
  login: async (email: string, password: string) =>
    call<Me>("POST", "/api/auth/login", { email, passwordKey: await stretchPassword(password, email) }),
  logout: () => call<void>("POST", "/api/auth/logout"),
  me: () => call<Me>("GET", "/api/auth/me"),
  members: (unitId: number) => call<{ members: Member[] }>("GET", `/api/units/${unitId}/members`),
  reissueSetup: (unitId: number, email: string) =>
    call<{ email: string; setupUrl: string }>("POST", `/api/units/${unitId}/members/password-setup`, { email }),
  removeMember: (unitId: number, email: string) =>
    call<void>("DELETE", `/api/units/${unitId}/members/${encodeURIComponent(email)}`),
  removeUnitLogo: (unitId: number) => call<void>("DELETE", `/api/units/${unitId}/qr-logo`),
  renameGroup: (unitId: number, groupId: number, name: string) =>
    call<{ id: number; name: string }>("PUT", `/api/units/${unitId}/groups/${groupId}`, { name }),
  revokeKey: (unitId: number, keyId: number) => call<void>("DELETE", `/api/units/${unitId}/keys/${keyId}`),
  /**
   * Who may open the Link: `password` sets one (null removes it), `expiresAt` an ISO moment (null
   * for never). A part left out stays as it is.
   */
  setLinkAccess: (code: string, access: { password?: string | null; expiresAt?: string | null }) =>
    call<Link>("PUT", `/api/links/${code}/access`, access),
  setLinkGroup: (code: string, groupId: number | null) => call<Link>("PUT", `/api/links/${code}/group`, { groupId }),
  setLinkLogoChoice: (code: string, choice: "inherit" | "none") =>
    call<{ logoChoice: LogoChoice; logoScale: number }>("PUT", `/api/links/${code}/qr-logo`, { choice }),
  setLinkLogoScale: (code: string, scale: number) =>
    call<{ logoChoice: LogoChoice; logoScale: number }>("PUT", `/api/links/${code}/qr-logo`, { scale }),
  setLinkPreview: (code: string, preview: Preview) => call<Link>("PUT", `/api/links/${code}/preview`, preview),
  setLinkQrShape: (code: string, shape: QrShape) =>
    call<{ qrShape: QrShape }>("PUT", `/api/links/${code}/qr-shape`, { shape }),
  setMemberRole: (unitId: number, email: string, role: Role) =>
    call<void>("PUT", `/api/units/${unitId}/members/${encodeURIComponent(email)}`, { role }),
  setPassword: async (token: string, email: string, password: string) =>
    call<void>("POST", "/api/auth/setup", { passwordKey: await stretchPassword(password, email), token }),
  setupAccount: (token: string) => call<{ email: string }>("POST", "/api/auth/setup/account", { token }),
  unarchiveLink: (code: string) => call<Link>("POST", `/api/links/${code}/unarchive`),
  unitLogo: (unitId: number) => call<{ own: boolean; university: boolean }>("GET", `/api/units/${unitId}/qr-logo`),
  unitLogoPreview: (unitId: number) => svg(`/api/units/${unitId}/qr-preview`),
  unitVisits: (unitId: number, days: number | null) =>
    call<UnitVisits>("GET", `/api/units/${unitId}/visits${days ? `?days=${days}` : ""}`),
  updateLinkDetails: (code: string, name: string, note: string) =>
    call<Link>("PUT", `/api/links/${code}/details`, { name, note }),
  uploadLinkLogo: (code: string, file: File) => upload(`/api/links/${code}/qr-logo`, file),
  uploadUnitLogo: (unitId: number, file: File) => upload(`/api/units/${unitId}/qr-logo`, file),
  visits: (code: string) => call<Visits>("GET", `/api/links/${code}/visits`)
};

export {
  ApiFailure,
  type ApiKey,
  api,
  type FoundLink,
  type HistoryEntry,
  type Link,
  type LinkGroup,
  type LogoChoice,
  type Me,
  type Member,
  type Preview,
  type ReservedCode,
  type Role,
  type UnitMembership,
  type UnitOverview,
  type UnitVisits,
  type VisitSource,
  type Visits
};
