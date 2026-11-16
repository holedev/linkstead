import { Hono } from "hono";
import { isWellFormedCode, normalizeCode, SYSTEM_RESERVED_CODES } from "../domain/link-code";
import { isMachineAgent, visitDay } from "../domain/visit";
import { Notice } from "./notice";
import type { Store } from "./store";

type AppDeps = {
  store: Store;
  /**
   * Runs work the response must not wait for - counting a Lượt mở. On Workers this is
   * `ctx.waitUntil`; elsewhere it can simply let the promise run.
   */
  defer: (work: Promise<unknown>) => void;
  now?: () => Date;
};

/**
 * The request handling, free of anything Workers-specific (ADR-0001): it is handed a `Store` and
 * a `defer`, and `index.ts` is the only place those come from Cloudflare.
 */
const createApp = ({ store, defer, now = () => new Date() }: AppDeps) => {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

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

export { type AppDeps, createApp };
