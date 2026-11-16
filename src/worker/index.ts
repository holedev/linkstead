import { createApp } from "./app";
import { createD1Store } from "./store-d1";

type Env = {
  DB: D1Database;
  /** The built UI (`dist/client`), bound in `wrangler.jsonc`. */
  ASSETS: Fetcher;
  /** A secret (`wrangler secret put BOOTSTRAP_TOKEN`). Only needed until the first administrator exists. */
  BOOTSTRAP_TOKEN?: string;
};

/** The Cloudflare entry point: the one place the portable app is given Cloudflare's pieces. */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const app = createApp({
      bootstrapToken: env.BOOTSTRAP_TOKEN,
      defer: (work) => ctx.waitUntil(work),
      serveUi: async (uiRequest) => {
        const asset = await env.ASSETS.fetch(uiRequest);
        // A missing file stays missing; any other path is a screen the UI routes to in the browser.
        const isFile = new URL(uiRequest.url).pathname.split("/").at(-1)?.includes(".") ?? false;
        if (asset.status !== 404 || isFile) {
          return asset;
        }
        return env.ASSETS.fetch(new Request(new URL("/app/", uiRequest.url), uiRequest));
      },
      store: createD1Store(env.DB)
    });
    return app.fetch(request);
  }
};
