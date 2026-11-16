import { Hono } from "hono";
import { isWellFormedCode, normalizeCode, SYSTEM_RESERVED_CODES } from "../domain/link-code";
import { isMachineAgent, visitDay } from "../domain/visit";
import { resolveActor } from "./actor";
import type { AppDeps, AppEnv } from "./context";
import { Notice } from "./notice";
import { registerAuthRoutes } from "./routes/auth";
import { registerLinkRoutes } from "./routes/links";
import { registerUnitRoutes } from "./routes/units";

/**
 * The request handling, free of anything Workers-specific (ADR-0001): it is handed a `Store` and
 * a `defer`, and `index.ts` is the only place those come from Cloudflare.
 */
const createApp = (deps: AppDeps) => {
  const { store, defer, now = () => new Date() } = deps;
  const app = new Hono<AppEnv>();

  app.use("/api/*", resolveActor(deps));
  app.get("/api/health", (c) => c.json({ ok: true }));
  registerAuthRoutes(app, deps);
  registerUnitRoutes(app, deps);
  registerLinkRoutes(app, deps);
  // An unknown API path answers as an API, not with the visitor's notice page.
  app.all("/api/*", (c) => c.json({ error: "not-found" }, 404));

  // The UI. It answers before the Link route does; `app` is a reserved code for that reason.
  app.on(["GET", "HEAD"], ["/app", "/app/*"], async (c) => {
    if (!deps.serveUi) {
      return c.html(<Notice kind='unknown' />, 404);
    }
    const served = await deps.serveUi(c.req.raw);
    // Copied so the headers can be set: a response handed back by the platform is read-only.
    const response = new Response(served.body, served);
    // A one-time password link carries its token in the address, so the page must never pass that
    // address on as a referrer - and must not be framed by another site.
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  });

  // Opening a Link. Everything else in the system exists to make this one route worth trusting.
  app.get("/:code", async (c) => {
    const code = normalizeCode(c.req.param("code"));

    // Asked before the database: a malformed or system path can never be a Link.
    if (!isWellFormedCode(code) || SYSTEM_RESERVED_CODES.has(code)) {
      return c.html(<Notice kind='unknown' />, 404);
    }

    const link = await store.findLinkByCode(code);
    if (!link) {
      return c.html(<Notice kind='unknown' />, 404);
    }
    if (!link.enabled) {
      return c.html(<Notice kind='disabled' />, 404);
    }

    if (!isMachineAgent(c.req.header("user-agent"))) {
      // A failed count must never cost the visitor their redirect.
      defer(store.recordVisit(link.id, visitDay(now())).catch(() => undefined));
    }

    // Temporary on purpose, and never stored: a permanent redirect is remembered by the browser,
    // which would keep sending people to the old Đích after it has been changed.
    c.header("Cache-Control", "no-store");
    return c.redirect(link.target, 302);
  });

  app.notFound((c) => c.html(<Notice kind='unknown' />, 404));

  return app;
};

export { createApp };
