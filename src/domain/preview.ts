/**
 * What a chat app or social site shows when a Link is pasted into it (CONTEXT.md: the Link stays
 * the address; this is only how it looks). Their fetchers read Open Graph tags from the page they
 * are given, and not all of them follow a redirect to read the Đích's, so a fetcher is answered
 * with a small page carrying the tags itself. People are still redirected (`worker/app.tsx`).
 *
 * The Tên link is never shown here: it is the Đơn vị's own note on what the Link is for.
 */

/** Whose fetch is a preview, not a person: these are answered with tags, not a redirect. */
const PREVIEW_FETCHER =
  /facebookexternalhit|facebot|zalo|twitterbot|slackbot|linkedinbot|discordbot|telegrambot|whatsapp|skypeuripreview|viber|pinterest|redditbot|embedly|googlebot|bingbot|applebot|iframely|preview/i;

const isPreviewFetcher = (userAgent: string | null | undefined): boolean =>
  Boolean(userAgent && PREVIEW_FETCHER.test(userAgent));

type Preview = { title: string; description: string; image: string };

const EMPTY: Preview = { description: "", image: "", title: "" };

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 500;

const ENTITIES: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;

const decodeEntities = (text: string): string =>
  text.replace(ENTITY, (whole, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }
    if (name.startsWith("#")) {
      return String.fromCodePoint(Number(name.slice(1)));
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });

const SPACES = /\s+/g;
const clean = (text: string, max: number): string => decodeEntities(text).replace(SPACES, " ").trim().slice(0, max);

const META_TAG = /<meta\b[^>]*>/gi;
const ATTRIBUTE = /([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const TITLE_TAG = /<title[^>]*>([\s\S]*?)<\/title>/i;

/** Every `<meta>` with a name or property, as key → content. The first of a key wins. */
const metaTags = (html: string): Map<string, string> => {
  const found = new Map<string, string>();
  for (const [tag] of html.matchAll(META_TAG)) {
    const attributes = new Map<string, string>();
    for (const [, key = "", a, b, c] of tag.matchAll(ATTRIBUTE)) {
      attributes.set(key.toLowerCase(), a ?? b ?? c ?? "");
    }
    const key = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase();
    const content = attributes.get("content");
    if (key && content !== undefined && !found.has(key)) {
      found.set(key, content);
    }
  }
  return found;
};

/** An image address as the page gave it, made absolute against the page, and only if https. */
const absoluteImage = (raw: string, pageUrl: string): string => {
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(decodeEntities(raw.trim()), pageUrl);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};

/**
 * The title, description and image a page describes itself with: its Open Graph tags, then its
 * Twitter ones, then its plain `<title>` and description. Missing parts are empty.
 */
const readPreview = (html: string, pageUrl: string): Preview => {
  const tags = metaTags(html);
  const first = (...keys: string[]) => keys.map((key) => tags.get(key) ?? "").find(Boolean) ?? "";
  return {
    description: clean(first("og:description", "twitter:description", "description"), MAX_DESCRIPTION),
    image: absoluteImage(first("og:image", "og:image:url", "og:image:secure_url", "twitter:image"), pageUrl),
    title: clean(first("og:title", "twitter:title") || (html.match(TITLE_TAG)?.[1] ?? ""), MAX_TITLE)
  };
};

/** Each part the Link sets itself wins over what the Đích says. */
const mergePreview = (own: Preview, fromTarget: Preview | null): Preview => ({
  description: own.description || fromTarget?.description || "",
  image: own.image || fromTarget?.image || "",
  title: own.title || fromTarget?.title || ""
});

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Whether the server may fetch an address to read its tags. Only https, and never a bare IP or a
 * name that only means something inside a network: once this runs on the university's own
 * servers, a Đích must not become a way to make them read their neighbours (ADR-0001).
 */
const isFetchableTarget = (raw: string): boolean => {
  if (!URL.canParse(raw)) {
    return false;
  }
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) {
    return false;
  }
  if (IPV4.test(host) || host.startsWith("[") || !host.includes(".")) {
    return false;
  }
  return !(
    host === "localhost" ||
    [".localhost", ".local", ".internal", ".lan", ".home.arpa"].some((end) => host.endsWith(end))
  );
};

const escapeHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * The page a preview fetcher is given. It carries the tags, names the Link as the canonical
 * address, and still sends on anyone who lands on it - an app's own browser can look like its
 * fetcher.
 */
const renderPreviewPage = ({
  linkUrl,
  target,
  preview,
  siteName
}: {
  linkUrl: string;
  target: string;
  preview: Preview;
  siteName: string;
}): string => {
  const title = preview.title || new URL(target).hostname;
  const tags: [string, string, string][] = [
    ["property", "og:type", "website"],
    ["property", "og:site_name", siteName],
    ["property", "og:url", linkUrl],
    ["property", "og:title", title],
    ["name", "twitter:card", preview.image ? "summary_large_image" : "summary"],
    ["name", "twitter:title", title]
  ];
  if (preview.description) {
    tags.push(
      ["property", "og:description", preview.description],
      ["name", "description", preview.description],
      ["name", "twitter:description", preview.description]
    );
  }
  if (preview.image) {
    tags.push(["property", "og:image", preview.image], ["name", "twitter:image", preview.image]);
  }
  const meta = tags.map(([kind, key, value]) => `<meta ${kind}="${key}" content="${escapeHtml(value)}">`).join("");
  const to = escapeHtml(target);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${meta}<link rel="canonical" href="${escapeHtml(linkUrl)}"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${to}"></head><body><p><a href="${to}">${escapeHtml(title)}</a></p></body></html>`;
};

export {
  EMPTY as EMPTY_PREVIEW,
  isFetchableTarget,
  isPreviewFetcher,
  MAX_DESCRIPTION as MAX_PREVIEW_DESCRIPTION,
  MAX_TITLE as MAX_PREVIEW_TITLE,
  mergePreview,
  type Preview,
  readPreview,
  renderPreviewPage
};
