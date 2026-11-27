import type { Hono } from "hono";
import { checkLogo, MAX_LOGO_BYTES } from "../../domain/logo";
import { renderQrSvg } from "../../domain/qr";
import { DEFAULT_QR_STYLE, isLogoScale, isQrShape, isQrStyle } from "../../domain/qr-style";
import { newSecret } from "../../domain/secret";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { readJson } from "../http";
import type { LinkRecord, LogoFiles, Store } from "../store";
import { systemAdmin } from "./admin";
import { reachLink } from "./links";
import { managedUnit } from "./units";

/** The Organization's logo for QR, for the whole system: the one file whose key is not in the database. */
const SYSTEM_LOGO_KEY = "system/logo";

/**
 * The logo a Link's QR shows, the lowest level winning: the Link's own choice - which may be
 * "none" - then its Unit's default, then the Organization's. None of them set: no logo.
 */
const logoOfLink = async (store: Store, logos: LogoFiles | undefined, link: LinkRecord): Promise<Uint8Array | null> => {
  if (link.logoChoice === "none") {
    return null;
  }
  if (link.logoChoice === "custom") {
    return link.logoKey ? ((await logos?.get(link.logoKey)) ?? null) : null;
  }
  return logoOfUnit(store, logos, link.unitId);
};

/** The Organization's: the one a System Administrator uploaded, or none. Nothing is built in. */
const organizationLogo = async (logos: LogoFiles | undefined): Promise<Uint8Array | null> =>
  (await logos?.get(SYSTEM_LOGO_KEY)) ?? null;

const logoOfUnit = async (store: Store, logos: LogoFiles | undefined, unitId: number): Promise<Uint8Array | null> => {
  const unit = await store.findUnit(unitId);
  return (unit?.logoKey ? await logos?.get(unit.logoKey) : null) ?? (await organizationLogo(logos));
};

/**
 * SVG and nothing else leaves here (AGENTS.md). The policy stops the picture from loading or
 * running anything if it is opened on its own, under the Organization's domain.
 */
const svg = (c: AppContext, body: string, filename: string) => {
  c.header("Content-Type", "image/svg+xml; charset=utf-8");
  c.header("Content-Disposition", `inline; filename="${filename}"`);
  c.header("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Cache-Control", "no-store");
  return c.body(body);
};

/** The Link a sample QR carries: an address, never one that opens. */
const SAMPLE_CODE = "example";
const SAMPLE_FILE = "qr-example.svg";

/** The uploaded file as bytes, once it has been checked to be a PNG or JPEG of an allowed size. */
const readLogo = async (c: AppContext, logos: LogoFiles | undefined): Promise<Uint8Array | Response> => {
  if (!logos) {
    return c.json({ error: "logos-unavailable" }, 503);
  }
  // Refused by its stated length first, so an oversized upload is not read just to be turned away.
  if (Number(c.req.header("content-length") ?? 0) > MAX_LOGO_BYTES) {
    return c.json({ error: "bad-logo", problem: "too-large" }, 422);
  }
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const problem = checkLogo(bytes);
  return problem ? c.json({ error: "bad-logo", problem }, 422) : bytes;
};

const registerQrRoutes = (app: Hono<AppEnv>, { store, logos }: AppDeps) => {
  /**
   * A Link's choice of logo without a file: `choice` (the Đơn vị's, or none) and/or `scale`, how
   * much of the logo box it fills. Giving up a file of its own removes the file.
   */
  const setLogoChoice = async (c: AppContext, link: LinkRecord) => {
    const { choice, scale } = (await readJson(c)) ?? {};
    const choiceValid = choice === undefined || choice === "inherit" || choice === "none";
    if (!choiceValid || (choice === undefined && scale === undefined)) {
      return c.json({ error: "bad-choice" }, 422);
    }
    if (scale !== undefined && !isLogoScale(scale)) {
      return c.json({ error: "bad-scale" }, 422);
    }
    if (scale !== undefined) {
      await store.setLinkLogoScale(link.id, scale);
    }
    if (choice !== undefined) {
      await store.setLinkLogo(link.id, choice, null);
      if (link.logoKey) {
        await logos?.delete(link.logoKey);
      }
    }
    return c.json({ logoChoice: choice ?? link.logoChoice, logoScale: scale ?? link.logoScale });
  };

  const origin = (c: AppContext) => new URL(c.req.url).origin;

  /** Stores a new file, points at it through `save`, and only then drops the one it replaces. */
  const replaceLogo = async (
    folder: string,
    bytes: Uint8Array,
    oldKey: string | null,
    save: (key: string) => Promise<void>
  ) => {
    const key = `${folder}/${newSecret()}`;
    await logos?.put(key, bytes);
    await save(key);
    if (oldKey) {
      await logos?.delete(oldKey);
    }
  };

  /**
   * A Link's QR. It carries the Link's own address and never the Đích, so the Đích can change.
   * `?style=` picks one of the fixed looks in `domain/qr-style.ts`; none means black on white.
   */
  app.get("/api/links/:code/qr", async (c) => {
    const reach = await reachLink(c, store);
    if (reach instanceof Response) {
      return reach;
    }
    const style = c.req.query("style") ?? DEFAULT_QR_STYLE;
    if (!isQrStyle(style)) {
      return c.json({ error: "bad-style" }, 422);
    }
    const { link } = reach;
    const picture = renderQrSvg(
      `${origin(c)}/${link.code}`,
      await logoOfLink(store, logos, link),
      style,
      link.logoScale,
      link.qrShape
    );
    const suffix = style === DEFAULT_QR_STYLE ? "" : `-${style}`;
    return svg(c, picture, `qr-${link.code}${suffix}.svg`);
  });

  /** How the Link's QR draws its modules, `{ "shape": "square" | "dots" }`, kept with the Link. */
  app.put("/api/links/:code/qr-shape", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    const shape = (await readJson(c))?.shape;
    if (!isQrShape(shape)) {
      return c.json({ error: "bad-shape" }, 422);
    }
    await store.setLinkQrShape(reach.link.id, shape);
    return c.json({ qrShape: shape });
  });

  /**
   * The Link's own choice of logo: a JSON `{ "choice": "inherit" | "none" }` and/or
   * `{ "scale": 40..100 }` - how much of the logo box the logo fills - or the bytes of a PNG or
   * JPEG for a logo of its own. Kept with the Link, so a later download is the same picture.
   */
  app.put("/api/links/:code/qr-logo", async (c) => {
    const reach = await reachLink(c, store, { peopleOnly: true });
    if (reach instanceof Response) {
      return reach;
    }
    const { link } = reach;
    if (c.req.header("content-type")?.startsWith("application/json")) {
      return setLogoChoice(c, link);
    }
    const bytes = await readLogo(c, logos);
    if (bytes instanceof Response) {
      return bytes;
    }
    await replaceLogo(`links/${link.id}`, bytes, link.logoKey, (key) => store.setLinkLogo(link.id, "custom", key));
    return c.json({ logoChoice: "custom", logoScale: link.logoScale });
  });

  // ── A Đơn vị's default ────────────────────────────────────────────────────
  /** Which logo the Đơn vị's QR show by default, and a sample QR to see it on. */
  app.get("/api/units/:unitId/qr-logo", async (c) => {
    const managed = await managedUnit(c, store);
    if (managed instanceof Response) {
      return managed;
    }
    const unit = await store.findUnit(managed.unitId);
    return c.json({ organization: Boolean(await logos?.get(SYSTEM_LOGO_KEY)), own: Boolean(unit?.logoKey) });
  });

  app.get("/api/units/:unitId/qr-preview", async (c) => {
    const managed = await managedUnit(c, store);
    if (managed instanceof Response) {
      return managed;
    }
    return svg(
      c,
      renderQrSvg(`${origin(c)}/${SAMPLE_CODE}`, await logoOfUnit(store, logos, managed.unitId)),
      SAMPLE_FILE
    );
  });

  app.put("/api/units/:unitId/qr-logo", async (c) => {
    const managed = await managedUnit(c, store);
    if (managed instanceof Response) {
      return managed;
    }
    const bytes = await readLogo(c, logos);
    if (bytes instanceof Response) {
      return bytes;
    }
    const unit = await store.findUnit(managed.unitId);
    await replaceLogo(`units/${managed.unitId}`, bytes, unit?.logoKey ?? null, (key) =>
      store.setUnitLogo(managed.unitId, key)
    );
    return c.body(null, 204);
  });

  /** Back to the Organization's logo. */
  app.delete("/api/units/:unitId/qr-logo", async (c) => {
    const managed = await managedUnit(c, store);
    if (managed instanceof Response) {
      return managed;
    }
    const unit = await store.findUnit(managed.unitId);
    await store.setUnitLogo(managed.unitId, null);
    if (unit?.logoKey) {
      await logos?.delete(unit.logoKey);
    }
    return c.body(null, 204);
  });

  // ── The Organization's, for the whole system ──────────────────────────────
  app.get("/api/admin/qr-logo", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    return c.json({ set: Boolean(await logos?.get(SYSTEM_LOGO_KEY)) });
  });

  app.get("/api/admin/qr-preview", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    return svg(c, renderQrSvg(`${origin(c)}/${SAMPLE_CODE}`, await organizationLogo(logos)), SAMPLE_FILE);
  });

  app.put("/api/admin/qr-logo", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    const bytes = await readLogo(c, logos);
    if (bytes instanceof Response) {
      return bytes;
    }
    await logos?.put(SYSTEM_LOGO_KEY, bytes);
    return c.body(null, 204);
  });

  app.delete("/api/admin/qr-logo", async (c) => {
    const admin = systemAdmin(c);
    if (admin instanceof Response) {
      return admin;
    }
    await logos?.delete(SYSTEM_LOGO_KEY);
    return c.body(null, 204);
  });
};

export { readLogo, registerQrRoutes, SYSTEM_LOGO_KEY };
