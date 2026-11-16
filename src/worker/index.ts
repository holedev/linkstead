import { createApp } from "./app";
import { createD1Store } from "./store-d1";

type Env = {
  DB: D1Database;
  /** A secret (`wrangler secret put BOOTSTRAP_TOKEN`). Only needed until the first administrator exists. */
  BOOTSTRAP_TOKEN?: string;
};

/** The Cloudflare entry point: the one place the portable app is given Cloudflare's pieces. */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const app = createApp({
      bootstrapToken: env.BOOTSTRAP_TOKEN,
      defer: (work) => ctx.waitUntil(work),
      store: createD1Store(env.DB)
    });
    return app.fetch(request);
  }
};
