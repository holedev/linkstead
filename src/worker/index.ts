import { createApp } from "./app";
import { googleSafeBrowsing, recheckTargets } from "./safety";
import type { LogoFiles, OrganizationRecord, Store } from "./store";
import { createD1Store } from "./store-d1";

type Env = {
  DB: D1Database;
  /** The built UI (`dist/client`), bound in `wrangler.jsonc`. */
  ASSETS: Fetcher;
  /** Logo files, for QR and the UI. Optional so the Worker still runs, without logos, where no bucket is bound. */
  LOGOS?: R2Bucket;
  /** A secret (`wrangler secret put BOOTSTRAP_TOKEN`). Only needed until the first administrator exists. */
  BOOTSTRAP_TOKEN?: string;
  /**
   * A Google Safe Browsing key (`wrangler secret put SAFE_BROWSING_KEY`). Without it no Target is
   * looked up, on its way in or in the daily check.
   */
  SAFE_BROWSING_KEY?: string;
};

const r2Logos = (bucket: R2Bucket): LogoFiles => ({
  delete: (key) => bucket.delete(key),
  get: async (key) => {
    const object = await bucket.get(key);
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  },
  put: async (key, bytes) => {
    await bucket.put(key, bytes);
  }
});

/** How long an isolate trusts the Organization's settings it read, before reading them again. */
const ORGANIZATION_CACHE_MS = 60_000;
let cachedOrganization: { record: OrganizationRecord; readAt: number } | null = null;

/**
 * The D1 store, with the Organization's settings held in the isolate for a minute: every opened
 * Link needs its time zone, and they change rarely. A save here forgets them at once; another
 * isolate sees the change within the minute.
 */
const storeOf = (database: D1Database): Store => {
  const store = createD1Store(database);
  return {
    ...store,
    getOrganization: async () => {
      if (cachedOrganization && Date.now() - cachedOrganization.readAt < ORGANIZATION_CACHE_MS) {
        return cachedOrganization.record;
      }
      const record = await store.getOrganization();
      cachedOrganization = { readAt: Date.now(), record };
      return record;
    },
    saveOrganization: async (record, at) => {
      cachedOrganization = null;
      await store.saveOrganization(record, at);
    }
  };
};

/** The Cloudflare entry point: the one place the portable app is given Cloudflare's pieces. */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const app = createApp({
      bootstrapToken: env.BOOTSTRAP_TOKEN,
      checkSafety: env.SAFE_BROWSING_KEY ? googleSafeBrowsing(env.SAFE_BROWSING_KEY) : undefined,
      defer: (work) => ctx.waitUntil(work),
      logos: env.LOGOS && r2Logos(env.LOGOS),
      serveUi: async (uiRequest) => {
        const asset = await env.ASSETS.fetch(uiRequest);
        // A missing file stays missing; any other path is a screen the UI routes to in the browser.
        const isFile = new URL(uiRequest.url).pathname.split("/").at(-1)?.includes(".") ?? false;
        if (asset.status !== 404 || isFile) {
          return asset;
        }
        return env.ASSETS.fetch(new Request(new URL("/app/", uiRequest.url), uiRequest));
      },
      store: storeOf(env.DB)
    });
    return app.fetch(request);
  },

  /** The daily check of every Target (`triggers.crons` in `wrangler.jsonc`). */
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    if (env.SAFE_BROWSING_KEY) {
      ctx.waitUntil(recheckTargets(createD1Store(env.DB), googleSafeBrowsing(env.SAFE_BROWSING_KEY), new Date()));
    }
  }
};
