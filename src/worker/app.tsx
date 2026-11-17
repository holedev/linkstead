import { Hono } from "hono";
import { isWellFormedCode, normalizeCode, SYSTEM_RESERVED_CODES } from "../domain/link-code";
import { mergePreview, readPreview, renderPreviewPage } from "../domain/preview";
import { isMachineAgent, isPreviewFetcher, visitDay } from "../domain/visit";
import { resolveActor } from "./actor";
import type { AppDeps, AppEnv } from "./context";
import { fetchPage as fetchRealPage } from "./fetch-page";
import { Landing } from "./landing";
import { Notice } from "./notice";
import { openApiDocument } from "./openapi";
import { registerAdminRoutes } from "./routes/admin";
import { registerAuthRoutes } from "./routes/auth";
import { registerExportRoutes } from "./routes/export";
import { registerGroupRoutes } from "./routes/groups";
import { registerLinkRoutes } from "./routes/links";
import { registerQrRoutes } from "./routes/qr";
import { registerUnitRoutes } from "./routes/units";

/** How the system names itself in a preview. */
const SITE_NAME = "OU Link - Trường Đại học Mở Thành phố Hồ Chí Minh";

/** Search engines may follow a Link to its Đích, but have no business in the UI or the API. */
const ROBOTS = "User-agent: *\nDisallow: /app\nDisallow: /api\n";

/**
 * The request handling, free of anything Workers-specific (ADR-0001): it is handed a `Store` and
 * a `defer`, and `index.ts` is the only place those come from Cloudflare.
 */
const createApp = (deps: AppDeps) => {
  const { store, defer, now = () => new Date(), fetchPage = fetchRealPage } = deps;
  const app = new Hono<AppEnv>();

  app.use("/api/*", resolveActor(deps));
  app.get("/api/health", (c) => c.json({ ok: true }));
  // The API's description, for the Swagger page and any client generator. Public: it says what a
  // key can do, not anything a key would unlock.
  app.get("/api/openapi.json", (c) => c.json(openApiDocument(new URL(c.req.url).origin)));
  registerAuthRoutes(app, deps);
  registerUnitRoutes(app, deps);
  registerLinkRoutes(app, deps);
  registerGroupRoutes(app, deps);
  registerAdminRoutes(app, deps);
  registerExportRoutes(app, deps);
  registerQrRoutes(app, deps);
  // An unknown API path answers as an API, not with the visitor's notice page.
  app.all("/api/*", (c) => c.json({ error: "not-found" }, 404));

  app.get("/robots.txt", (c) => c.text(ROBOTS));

  // What OU Link is, for whoever opens the bare domain. Not a fallback: a Link that does not answer
  // shows its notice, which only offers this page.
  app.get("/", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.html(<Landing url={c.req.url} />);
  });

  // The UI. It answers before the Link route does; `app` is a reserved code for that reason.
  app.on(["GET", "HEAD"], ["/app", "/app/*"], async (c) => {
    if (!deps.serveUi) {
      return c.html(<Notice kind='unknown' url={c.req.url} />, 404);
    }
    const served = await deps.serveUi(c.req.raw);
    // Copied so the headers can be set: a response handed back by the platform is read-only.
    const response = new Response(served.body, served);
    // A one-time password link carries its token in the address, so the page must never pass that
    // address on as a referrer - and must not be framed by another site.
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Robots-Tag", "noindex");
    return response;
  });

  // Opening a Link. Everything else in the system exists to make this one route worth trusting.
  app.get("/:code", async (c) => {
    const code = normalizeCode(c.req.param("code"));

    // Asked before the database: a malformed or system path can never be a Link.
    if (!isWellFormedCode(code) || SYSTEM_RESERVED_CODES.has(code)) {
      return c.html(<Notice kind='unknown' url={c.req.url} />, 404);
    }

    const link = await store.findLinkByCode(code);
    if (!link) {
      return c.html(<Notice kind='unknown' url={c.req.url} />, 404);
    }
    if (!link.enabled) {
      return c.html(<Notice kind='disabled' url={c.req.url} />, 404);
    }

    const userAgent = c.req.header("user-agent");
    c.header("Cache-Control", "no-store");

    // A chat app or social site building a preview gets the tags, not a redirect: not every one
    // follows a redirect to read the Đích's. It is never counted as a Lượt mở.
    if (isPreviewFetcher(userAgent)) {
      const own = { description: link.previewDescription, image: link.previewImage, title: link.previewTitle };
      const page = own.title && own.description && own.image ? null : await fetchPage(link.target);
      const preview = mergePreview(own, page ? readPreview(page.html, page.url) : null);
      const linkUrl = `${new URL(c.req.url).origin}/${code}`;
      return c.html(renderPreviewPage({ linkUrl, preview, siteName: SITE_NAME, target: link.target }));
    }

    if (!isMachineAgent(userAgent)) {
      // A failed count must never cost the visitor their redirect.
      defer(store.recordVisit(link.id, visitDay(now())).catch(() => undefined));
    }

    // Temporary on purpose, and never stored: a permanent redirect is remembered by the browser,
    // which would keep sending people to the old Đích after it has been changed.
    return c.redirect(link.target, 302);
  });

  app.notFound((c) => c.html(<Notice kind='unknown' url={c.req.url} />, 404));

  return app;
};

export { createApp };
