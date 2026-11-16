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
/** The tests' second Đơn vị. Not part of any deploy. */
const OTHER_UNIT = "Khoa Kế toán";
const FIRST_UNIT = "Tạp chí Khoa học & Nhà xuất bản";
const BREAKPOINT = "--> statement-breakpoint";
const ORIGIN = "https://go.test";
const BOOTSTRAP_TOKEN = "bootstrap-secret-for-tests";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1";

// Children before parents, so the foreign keys never object.
const TABLES = [
  "daily_visits",
  "target_changes",
  "unit_changes",
  "api_key_usage",
  "status_changes",
  "links",
  "api_keys",
  "memberships",
  "sessions",
  "password_setups",
  "reserved_codes",
  "units",
  "accounts"
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
  const app = createApp({
    bootstrapToken: BOOTSTRAP_TOKEN,
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
   * Back to what a fresh deploy holds - the one Đơn vị the trial starts with (id 1) - plus a
   * second Đơn vị (id 2) that exists only so the tests have "another Đơn vị" to be refused by.
   */
  const reset = async () => {
    for (const table of TABLES) {
      await run(`DELETE FROM ${table}`);
    }
    await run("DELETE FROM sqlite_sequence");
    await runMigration("seed_first_units");
    await runMigration("merge_first_units");
    await run("UPDATE sqlite_sequence SET seq = 1 WHERE name = 'units'");
    await run(`INSERT INTO units (name) VALUES ('${OTHER_UNIT}')`);
    clock.now = new Date("2027-03-01T03:00:00Z");
    logoFiles.clear();
    pages.clear();
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
      put: (path: string, body?: unknown, options?: RequestOptions) => request("PUT", path, { ...options, body }),
      /** Uses a one-time link the way the UI does. */
      setup: async (token: string, email: string, password: string) =>
        request("POST", "/api/auth/setup", { body: { passwordKey: await passwordKey(email, password), token } }),
      /** Sends a file as the request body, the way the UI uploads a logo. */
      upload: (path: string, bytes: Uint8Array, options?: RequestOptions) =>
        request("PUT", path, { ...options, bytes, headers: { "content-type": "image/png", ...options?.headers } })
    };
  };

  /** The first administrator, with a password set and signed in. Manager of both Đơn vị. */
  const signedInAdmin = async (email = "admin@ou.edu.vn", password = "mat-khau-quan-tri") => {
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
    client,
    db,
    dispose: proxy.dispose,
    logoFiles,
    pages,
    reset,
    run,
    runMigration,
    signedInAdmin
  };
};

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const tokenOf = (setupUrl: string) => new URL(setupUrl).searchParams.get("token") ?? "";

export { BOOTSTRAP_TOKEN, bearer, FIRST_UNIT, ORIGIN, OTHER_UNIT, passwordKey, startHarness, tokenOf };
