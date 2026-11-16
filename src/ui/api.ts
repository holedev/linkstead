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
  visits: number;
  createdAt: string;
};
type Author = { kind: "account"; email: string } | { kind: "key"; name: string } | null;
type HistoryEntry = { at: string; by: Author } & (
  | { kind: "target"; oldTarget: string; newTarget: string }
  | { kind: "status"; enabled: boolean; bySystem: boolean }
);
type Visits = { total: number; days: { day: string; count: number }[] };
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

const api = {
  addMember: (unitId: number, email: string, role: Role) =>
    call<{ email: string; role: Role; setupUrl: string | null }>("POST", `/api/units/${unitId}/members`, {
      email,
      role
    }),
  changeTarget: (code: string, target: string, expectedTarget: string) =>
    call<Link>("PUT", `/api/links/${code}/target`, { expectedTarget, target }),
  createKey: (unitId: number, name: string) =>
    call<{ id: number; key: string; name: string }>("POST", `/api/units/${unitId}/keys`, { name }),
  createLink: (input: { unitId: number; name: string; target: string; code: string; note: string }) =>
    call<Link>("POST", "/api/links", input),
  disableLink: (code: string) => call<Link>("POST", `/api/links/${code}/disable`),
  enableLink: (code: string) => call<Link>("POST", `/api/links/${code}/enable`),
  history: (code: string) => call<{ history: HistoryEntry[] }>("GET", `/api/links/${code}/history`),
  keys: (unitId: number) => call<{ keys: ApiKey[] }>("GET", `/api/units/${unitId}/keys`),
  links: (unitId: number) => call<{ links: Link[] }>("GET", `/api/links?unitId=${unitId}`),
  login: (email: string, password: string) => call<Me>("POST", "/api/auth/login", { email, password }),
  logout: () => call<void>("POST", "/api/auth/logout"),
  me: () => call<Me>("GET", "/api/auth/me"),
  members: (unitId: number) => call<{ members: Member[] }>("GET", `/api/units/${unitId}/members`),
  reissueSetup: (unitId: number, email: string) =>
    call<{ email: string; setupUrl: string }>("POST", `/api/units/${unitId}/members/password-setup`, { email }),
  revokeKey: (unitId: number, keyId: number) => call<void>("DELETE", `/api/units/${unitId}/keys/${keyId}`),
  setPassword: (token: string, password: string) => call<void>("POST", "/api/auth/setup", { password, token }),
  visits: (code: string) => call<Visits>("GET", `/api/links/${code}/visits`)
};

export {
  ApiFailure,
  type ApiKey,
  api,
  type HistoryEntry,
  type Link,
  type Me,
  type Member,
  type Role,
  type UnitMembership,
  type Visits
};
