import type { Hono } from "hono";
import { logoTypeOf } from "../../domain/logo";
import { checkSettings } from "../../domain/organization";
import { newSecret } from "../../domain/secret";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { readJson } from "../http";
import type { OrganizationRecord } from "../store";
import { systemAdmin } from "./admin";
import { readLogo } from "./qr";

/** Where the UI's logo is served. The key's last part changes with every upload, so it can be cached. */
const UI_LOGO_PATH = "/api/organization/logo";

/** Every UI logo lives under this folder; its key is not otherwise guessable. */
const UI_LOGO_FOLDER = "system/ui-logo";

/** What anyone may know of the Organization: what its pages need before anyone has signed in. */
const presentOrganization = (organization: OrganizationRecord) => ({
  brandColor: organization.brandColor,
  emailDomains: organization.emailDomains,
  language: organization.language,
  name: organization.name,
  timeZone: organization.timeZone,
  uiLogo: organization.uiLogoKey ? `${UI_LOGO_PATH}?v=${organization.uiLogoKey.split("/").at(-1)}` : null
});

/**
 * The Organization an installation serves (ADR-0007): read by anyone, set by a System
 * Administrator in the UI and never through a Khóa API.
 */
const registerOrganizationRoutes = (app: Hono<AppEnv>, { store, logos, now = () => new Date() }: AppDeps) => {
  app.get("/api/organization", async (c) => c.json(presentOrganization(await store.getOrganization())));

  /** The UI's logo, PNG or JPEG as it was checked on its way in. Never SVG (AGENTS.md). */
  app.get(UI_LOGO_PATH, async (c) => {
    const { uiLogoKey } = await store.getOrganization();
    const bytes = uiLogoKey ? await logos?.get(uiLogoKey) : null;
    const type = bytes ? logoTypeOf(bytes) : null;
    if (!(bytes && type)) {
      return c.json({ error: "not-found" }, 404);
    }
    c.header("Content-Type", type);
    c.header("Content-Security-Policy", "default-src 'none'");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Cache-Control", "public, max-age=86400");
    return c.body(new Uint8Array(bytes));
  });

  /** Any of name, emailDomains, language, timeZone and brandColor; what is left out stays. */
  app.put("/api/admin/settings", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const body = await readJson(c);
    if (!body) {
      return c.json({ error: "bad-settings" }, 422);
    }
    const current = await store.getOrganization();
    const checked = checkSettings(body, current);
    if ("problem" in checked) {
      return c.json({ error: checked.problem }, 422);
    }
    const saved = { ...checked.settings, uiLogoKey: current.uiLogoKey };
    await store.saveOrganization(saved, now());
    return c.json(presentOrganization(saved));
  });

  const setUiLogo = async (c: AppContext, key: string | null) => {
    const current = await store.getOrganization();
    await store.saveOrganization({ ...current, uiLogoKey: key }, now());
    if (current.uiLogoKey) {
      await logos?.delete(current.uiLogoKey);
    }
    return c.json(presentOrganization({ ...current, uiLogoKey: key }));
  };

  /** The UI's logo, for its header and its icon. Not the one QR show, which is set apart. */
  app.put("/api/admin/ui-logo", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const bytes = await readLogo(c, logos);
    if (bytes instanceof Response) {
      return bytes;
    }
    const key = `${UI_LOGO_FOLDER}/${newSecret()}`;
    await logos?.put(key, bytes);
    return setUiLogo(c, key);
  });

  /** Back to the Organization's name in letters. */
  app.delete("/api/admin/ui-logo", (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    return setUiLogo(c, null);
  });
};

export { presentOrganization, registerOrganizationRoutes, UI_LOGO_FOLDER };
