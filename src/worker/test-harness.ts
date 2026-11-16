import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { createApp } from "./app";
import { createD1Store } from "./store-d1";

/**
 * Runs the app against a real local D1 with the real migrations applied, so the tests exercise
 * the SQL the Worker will run and not a hand-written double of it.
 */

const MIGRATIONS = join(import.meta.dirname, "../../migrations");
const BREAKPOINT = "--> statement-breakpoint";
const ORIGIN = "https://go.test";
const BOOTSTRAP_TOKEN = "bootstrap-secret-for-tests";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1";

// Children before parents, so the foreign keys never object.
const TABLES = [
  "daily_visits",
  "target_changes",
  "links",
  "api_keys",
  "memberships",
  "sessions",
  "password_setups",
  "reserved_codes",
  "units",
  "accounts"
];

type RequestOptions = { body?: unknown; headers?: Record<string, string> };

const startHarness = async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false });
  const db = proxy.env.DB;

  const run = async (statement: string) => {
    await db.prepare(statement).run();
  };

  const seedFile = readdirSync(MIGRATIONS).find((file) => file.includes("seed_first_units"));
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
  const app = createApp({
    bootstrapToken: BOOTSTRAP_TOKEN,
    defer: (work) => {
      deferred.push(work);
    },
    now: () => clock.now,
    store: createD1Store(db)
  });

  /** Back to what a fresh deploy holds: the two seeded Đơn vị (ids 1 and 2) and nothing else. */
  const reset = async () => {
    for (const table of TABLES) {
      await run(`DELETE FROM ${table}`);
    }
    await run("DELETE FROM sqlite_sequence");
    for (const statement of seedFile ? statementsOf(seedFile) : []) {
      await run(statement);
    }
    clock.now = new Date("2027-03-01T03:00:00Z");
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
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
      post: (path: string, body?: unknown, options?: RequestOptions) => request("POST", path, { ...options, body })
    };
  };

  /** The first administrator, with a password set and signed in. Manager of both seeded Đơn vị. */
  const signedInAdmin = async (email = "admin@ou.edu.vn", password = "mat-khau-quan-tri") => {
    const browser = client();
    const created = await browser.post("/api/bootstrap", { email }, { headers: bearer(BOOTSTRAP_TOKEN) });
    const { setupUrl } = (await created.json()) as { setupUrl: string };
    await browser.post("/api/auth/setup", { password, token: tokenOf(setupUrl) });
    await browser.post("/api/auth/login", { email, password });
    return browser;
  };

  return {
    advance: (ms: number) => {
      clock.now = new Date(clock.now.getTime() + ms);
    },
    client,
    db,
    dispose: proxy.dispose,
    reset,
    signedInAdmin
  };
};

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const tokenOf = (setupUrl: string) => new URL(setupUrl).searchParams.get("token") ?? "";

export { BOOTSTRAP_TOKEN, bearer, ORIGIN, startHarness, tokenOf };
