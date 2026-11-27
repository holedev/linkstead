import { type Context, Hono } from "hono";
import { isWellFormedCode, normalizeCode, SYSTEM_RESERVED_CODES } from "../domain/link-code";
import { matchesLinkPassword } from "../domain/link-password";
import { lockedPreview, mergePreview, readPreview, renderPreviewPage } from "../domain/preview";
import { isMachineAgent, isPreviewFetcher, referrerSite, visitCountry, visitDay } from "../domain/visit";
import { resolveActor } from "./actor";
import type { AppDeps, AppEnv } from "./context";
import { fetchPage as fetchRealPage } from "./fetch-page";
import { Landing } from "./landing";
import { Notice } from "./notice";
import { openApiDocument } from "./openapi";
import { PasswordPage } from "./password-page";
import { registerAdminRoutes } from "./routes/admin";
import { registerAuthRoutes } from "./routes/auth";
import { registerExportRoutes } from "./routes/export";
import { registerGroupRoutes } from "./routes/groups";
import { registerLinkRoutes } from "./routes/links";
import { presentOrganization, registerOrganizationRoutes } from "./routes/organization";
import { registerQrRoutes } from "./routes/qr";
import { registerStatsRoutes } from "./routes/stats";
import { registerUnitRoutes } from "./routes/units";
import type { OpenableLink } from "./store";
import type { Site } from "./visitor-page";
import type { NoticeKind } from "./visitor-text";

/** Search engines may follow a Link to its Target, but have no business in the UI or the API. */
const ROBOTS = "User-agent: *\nDisallow: /app\nDisallow: /api\n";

/** Why a Link found by its code does not open: deleted (gone for good), or switched off. */
const closedAs = (link: OpenableLink | null, at: Date): { kind: NoticeKind; status: 404 | 410 } | null => {
  if (!link) {
    return null;
  }
  if (link.deleted) {
    return { kind: "deleted", status: 410 };
  }
  if (!link.enabled) {
    return { kind: "disabled", status: 404 };
  }
  return link.expiresAt && link.expiresAt <= at ? { kind: "expired", status: 404 } : null;
};

/** What a Link behind a password shows when pasted somewhere: its own words, never its Target's. */
const lockedPreviewOf = (link: OpenableLink, site: Site) =>
  lockedPreview(
    { description: link.previewDescription, image: link.previewImage, title: link.previewTitle },
    site.language
  );

/** Wrong passwords a Link takes in a minute before it asks the visitor to wait (ADR-0006). */
const MAX_WRONG_PASSWORDS = 10;
const MINUTE_MS = 60_000;

/**
 * Where a Visit came from, as counts only (ADR-0005): the country the network in front reports,
 * and the referring site's host.
 */
const sourceOf = (c: Context) => ({
  country: visitCountry(c.req.header("cf-ipcountry")),
  referrer: referrerSite(c.req.header("referer"), new URL(c.req.url).hostname)
});

/**
 * The request handling, free of anything Workers-specific (ADR-0001): it is handed a `Store` and
 * a `defer`, and `index.ts` is the only place those come from Cloudflare.
 */
const createApp = (deps: AppDeps) => {
  const { store, defer, now = () => new Date(), fetchPage = fetchRealPage } = deps;
  const app = new Hono<AppEnv>();

  /** The Organization, as every visitor page shows it. */
  const site = async (): Promise<Site> => presentOrganization(await store.getOrganization());

  /** A notice page, in the Organization's name and language. */
  const notice = async (c: Context, kind: NoticeKind, status: 200 | 404 | 410, target?: string) =>
    c.html(<Notice kind={kind} site={await site()} target={target} url={c.req.url} />, status);

  app.use("/api/*", resolveActor(deps));
  app.get("/api/health", (c) => c.json({ ok: true }));
  // The API's description, for the Swagger page and any client generator. Public: it says what a
  // key can do, not anything a key would unlock.
  app.get("/api/openapi.json", async (c) =>
    c.json(openApiDocument(new URL(c.req.url).origin, (await store.getOrganization()).name))
  );
  registerAuthRoutes(app, deps);
  registerUnitRoutes(app, deps);
  registerLinkRoutes(app, deps);
  registerGroupRoutes(app, deps);
  registerAdminRoutes(app, deps);
  registerExportRoutes(app, deps);
  registerQrRoutes(app, deps);
  registerStatsRoutes(app, deps);
  registerOrganizationRoutes(app, deps);
  // An unknown API path answers as an API, not with the visitor's notice page.
  app.all("/api/*", (c) => c.json({ error: "not-found" }, 404));

  app.get("/robots.txt", (c) => c.text(ROBOTS));

  // What these links are, for whoever opens the bare domain. Not a fallback: a Link that does not
  // answer shows its notice, which only offers this page.
  app.get("/", async (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.html(<Landing site={await site()} url={c.req.url} />);
  });

  // The UI. It answers before the Link route does; `app` is a reserved code for that reason.
  app.on(["GET", "HEAD"], ["/app", "/app/*"], async (c) => {
    if (!deps.serveUi) {
      return notice(c, "unknown", 404);
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

  /** The page of Open Graph tags a preview fetcher is given: the Link's own, else its Target's. */
  const previewPageOf = async (link: OpenableLink, linkUrl: string) => {
    const own = { description: link.previewDescription, image: link.previewImage, title: link.previewTitle };
    const page = own.title && own.description && own.image ? null : await fetchPage(link.target);
    const preview = mergePreview(own, page ? readPreview(page.html, page.url) : null);
    // The preview names the Organization the Link is under, as the site it is on.
    const { name } = await store.getOrganization();
    return renderPreviewPage({ linkUrl, preview, siteName: name, target: link.target });
  };

  /**
   * The Link at the path if it may be opened, or the page that says why not: unknown, deleted,
   * switched off, expired, or with a Target listed as unsafe - where the visitor is warned and
   * decides, no preview is built from a page that may be a trap, and nothing is counted.
   */
  const reachOpenable = async (c: Context): Promise<{ link: OpenableLink; code: string } | Response> => {
    const code = normalizeCode(c.req.param("code") ?? "");
    // Asked before the database: a malformed or system path can never be a Link.
    if (!isWellFormedCode(code) || SYSTEM_RESERVED_CODES.has(code)) {
      return notice(c, "unknown", 404);
    }
    const link = await store.findLinkByCode(code);
    const closed = closedAs(link, now());
    if (!link || closed) {
      return notice(c, closed?.kind ?? "unknown", closed?.status ?? 404);
    }
    c.header("Cache-Control", "no-store");
    if (link.unsafe) {
      return notice(c, "unsafe", 200, link.target);
    }
    return { code, link };
  };

  /**
   * Sends the visitor to the Target, counting it when a person asked. Temporary on purpose, and
   * never stored: a permanent redirect is remembered by the browser, which would keep sending
   * people to the old Target after it has been changed.
   */
  const sendOn = (c: Context, link: OpenableLink, status: 302 | 303) => {
    if (!isMachineAgent(c.req.header("user-agent"))) {
      // A failed count must never cost the visitor their redirect.
      const at = now();
      const source = sourceOf(c);
      defer(
        store
          .getOrganization()
          .then(({ timeZone }) => store.recordVisit(link.id, visitDay(at, timeZone), source))
          .catch(() => undefined)
      );
    }
    return c.redirect(link.target, status);
  };

  // Opening a Link. Everything else in the system exists to make this one route worth trusting.
  app.get("/:code", async (c) => {
    const reach = await reachOpenable(c);
    if (reach instanceof Response) {
      return reach;
    }
    const { link, code } = reach;
    // A Link with a password says nothing of its Target - to a person or to a preview fetcher.
    if (link.passwordHash) {
      const here = await site();
      return c.html(<PasswordPage preview={lockedPreviewOf(link, here)} site={here} state='ask' url={c.req.url} />);
    }
    // A chat app or social site building a preview gets the tags, not a redirect: not every one
    // follows a redirect to read the Target's. It is never counted as a Visit.
    if (isPreviewFetcher(c.req.header("user-agent"))) {
      return c.html(await previewPageOf(link, `${new URL(c.req.url).origin}/${code}`));
    }
    return sendOn(c, link, 302);
  });

  /** The password page's form. Right, it sends the visitor on; wrong, it asks again. */
  app.post("/:code", async (c) => {
    const reach = await reachOpenable(c);
    if (reach instanceof Response) {
      return reach;
    }
    const { link } = reach;
    if (!link.passwordHash) {
      return sendOn(c, link, 303);
    }
    const here = await site();
    const minute = Math.floor(now().getTime() / MINUTE_MS);
    if ((await store.passwordFailures(link.id, minute)) >= MAX_WRONG_PASSWORDS) {
      return c.html(
        <PasswordPage preview={lockedPreviewOf(link, here)} site={here} state='too-many' url={c.req.url} />,
        429
      );
    }
    const form = await c.req.parseBody();
    const password = typeof form.password === "string" ? form.password : "";
    if (!(await matchesLinkPassword(password, link.passwordHash))) {
      await store.countPasswordFailure(link.id, minute);
      return c.html(
        <PasswordPage preview={lockedPreviewOf(link, here)} site={here} state='wrong' url={c.req.url} />,
        401
      );
    }
    return sendOn(c, link, 303);
  });

  app.notFound((c) => notice(c, "unknown", 404));

  return app;
};

export { createApp };
