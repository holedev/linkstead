import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { stretchPassword } from "../domain/password";
import { createApp } from "./app";
import { createD1Store } from "./store-d1";

/**
 * Runs the app against a real local D1 with the real migrations applied, so the tests exercise
 * the SQL the Worker will run and not a hand-written double of it.
 */

const MIGRATIONS = join(import.meta.dirname, "../../migrations");
/** The tests' two Units. Not part of any deploy: a fresh installation starts with none. */
const FIRST_UNIT = "Journal & Press";
const OTHER_UNIT = "Accounting";
/**
 * The Organization the tests run as. A zone ahead of UTC, so a test of which day a Visit lands on
 * means something, and one email domain, so the rule about it is exercised.
 */
const ORGANIZATION = {
  brandColor: "#114fa0",
  emailDomains: ["example.org"],
  language: "vi",
  name: "Example University",
  timeZone: "Asia/Ho_Chi_Minh"
} as const;
const BREAKPOINT = "--> statement-breakpoint";
const ORIGIN = "https://go.test";
const BOOTSTRAP_TOKEN = "bootstrap-secret-for-tests";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1";

// Children before parents, so the foreign keys never object.
const TABLES = [
  "link_password_failures",
  "daily_visit_sources",
  "daily_visits",
  "target_changes",
  "unit_changes",
  "api_key_usage",
  "status_changes",
  "links",
  "link_groups",
  "api_keys",
  "memberships",
  "sessions",
  "password_setups",
  "reserved_codes",
  "units",
  "accounts",
  "organization"
];

/**
 * What a browser sends in place of a password. Remembered, because the stretching is slow on
 * purpose and the tests sign the same few people in again and again.
 */
const stretched = new Map<string, Promise<string>>();
const passwordKey = (email: string, password: string): Promise<string> => {
  const id = `${email.trim().toLowerCase()}\n${password}`;
  const known = stretched.get(id) ?? stretchPassword(password, email);
  stretched.set(id, known);
  return known;
};

type RequestOptions = { body?: unknown; headers?: Record<string, string>; bytes?: Uint8Array };

const startHarness = async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false });
  const db = proxy.env.DB;

  const run = async (statement: string) => {
    await db.prepare(statement).run();
  };

  const migrationNamed = (part: string) => readdirSync(MIGRATIONS).find((file) => file.includes(part)) ?? "";
  const statementsOf = (file: string) =>
    readFileSync(join(MIGRATIONS, file), "utf8")
      .split(BREAKPOINT)
      .map((statement) => statement.trim())
      .filter(Boolean);

  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    for (const statement of statementsOf(file)) {
      await run(statement);
    }
  }

  const clock = { now: new Date("2027-03-01T03:00:00Z") };
  const deferred: Promise<unknown>[] = [];
  // Logo files in memory: the app only knows the `LogoFiles` seam, so this is as real as R2 to it.
  const logoFiles = new Map<string, Uint8Array>();
  /** The pages the tests pretend are on the internet, by address. Anything else is unreachable. */
  const pages = new Map<string, string>();
  /** The addresses the tests pretend Safe Browsing lists as unsafe. */
  const unsafe = new Set<string>();
  const checkSafety = (urls: readonly string[]) => Promise.resolve(new Set(urls.filter((url) => unsafe.has(url))));
  const app = createApp({
    bootstrapToken: BOOTSTRAP_TOKEN,
    checkSafety,
    defer: (work) => {
      deferred.push(work);
    },
    fetchPage: (url) => {
      const html = pages.get(url);
      return Promise.resolve(html === undefined ? null : { html, url });
    },
    logos: {
      delete: async (key) => {
        await Promise.resolve(logoFiles.delete(key));
      },
      get: (key) => Promise.resolve(logoFiles.get(key) ?? null),
      put: async (key, bytes) => {
        await Promise.resolve(logoFiles.set(key, bytes));
      }
    },
    now: () => clock.now,
    serveUi: () =>
      Promise.resolve(new Response("<!doctype html><title>ui</title>", { headers: { "content-type": "text/html" } })),
    store: createD1Store(db)
  });

  /** Runs one migration's statements again, by a part of its file name. */
  const runMigration = async (part: string) => {
    for (const statement of statementsOf(migrationNamed(part))) {
      await run(statement);
    }
  };

  /**
   * Back to an installation with the tests' Organization and two Units: the first (id 1), and a
   * second (id 2) that exists only so the tests have "another Unit" to be refused by.
   */
  const reset = async () => {
    for (const table of TABLES) {
      await run(`DELETE FROM ${table}`);
    }
    await run("DELETE FROM sqlite_sequence");
    await run(`INSERT INTO units (name) VALUES ('${FIRST_UNIT}')`);
    await run(`INSERT INTO units (name) VALUES ('${OTHER_UNIT}')`);
    await createD1Store(db).saveOrganization(
      { ...ORGANIZATION, emailDomains: [...ORGANIZATION.emailDomains], uiLogoKey: null },
      clock.now
    );
    clock.now = new Date("2027-03-01T03:00:00Z");
    logoFiles.clear();
    pages.clear();
    unsafe.clear();
  };

  /** A caller that keeps its cookies between requests, like a browser - or sends none. */
  const client = () => {
    let cookie = "";
    const request = async (method: string, path: string, options: RequestOptions = {}) => {
      const headers: Record<string, string> = { "user-agent": PHONE, ...options.headers };
      if (cookie) {
        headers.cookie = cookie;
      }
      if (options.body !== undefined) {
        headers["content-type"] = "application/json";
      }
      const response = await app.request(`${ORIGIN}${path}`, {
        body: options.bytes ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
        headers,
        method
      });
      await Promise.all(deferred.splice(0));
      for (const value of response.headers.getSetCookie()) {
        cookie = value.split(";")[0] ?? "";
      }
      return response;
    };
    return {
      delete: (path: string, options?: RequestOptions) => request("DELETE", path, options),
      get: (path: string, options?: RequestOptions) => request("GET", path, options),
      /** Signs in the way the UI does: the password is stretched before it leaves. */
      login: async (email: string, password: string) =>
        request("POST", "/api/auth/login", { body: { email, passwordKey: await passwordKey(email, password) } }),
      post: (path: string, body?: unknown, options?: RequestOptions) => request("POST", path, { ...options, body }),
      /** Sends a form as a browser does - the password page's. */
      postForm: (path: string, fields: Record<string, string>) =>
        request("POST", path, {
          bytes: new TextEncoder().encode(new URLSearchParams(fields).toString()),
          headers: { "content-type": "application/x-www-form-urlencoded" }
        }),
      put: (path: string, body?: unknown, options?: RequestOptions) => request("PUT", path, { ...options, body }),
      /** Uses a one-time link the way the UI does. */
      setup: async (token: string, email: string, password: string) =>
        request("POST", "/api/auth/setup", { body: { passwordKey: await passwordKey(email, password), token } }),
      /** Sends a file as the request body, the way the UI uploads a logo. */
      upload: (path: string, bytes: Uint8Array, options?: RequestOptions) =>
        request("PUT", path, { ...options, bytes, headers: { "content-type": "image/png", ...options?.headers } })
    };
  };

  /** The first administrator, with a password set and signed in. Manager of both Units. */
  const signedInAdmin = async (email = "admin@example.org", password = "mat-khau-quan-tri") => {
    const browser = client();
    const created = await browser.post("/api/bootstrap", { email }, { headers: bearer(BOOTSTRAP_TOKEN) });
    const { setupUrl } = (await created.json()) as { setupUrl: string };
    await browser.setup(tokenOf(setupUrl), email, password);
    await browser.login(email, password);
    return browser;
  };

  return {
    advance: (ms: number) => {
      clock.now = new Date(clock.now.getTime() + ms);
    },
    checkSafety,
    client,
    db,
    dispose: proxy.dispose,
    logoFiles,
    pages,
    reset,
    run,
    runMigration,
    signedInAdmin,
    store: createD1Store(db),
    unsafe
  };
};

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const tokenOf = (setupUrl: string) => new URL(setupUrl).searchParams.get("token") ?? "";

export { BOOTSTRAP_TOKEN, bearer, FIRST_UNIT, ORGANIZATION, ORIGIN, OTHER_UNIT, passwordKey, startHarness, tokenOf };
