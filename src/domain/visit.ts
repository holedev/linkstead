/** What counts as a Lượt mở, and which day it belongs to (CONTEXT.md). */

/**
 * Fetchers that open a Link to build a preview, and crawlers, by the names they give themselves.
 * Never complete - which is why the UI calls the count an estimate - but without it a Link pasted
 * into one Zalo group shows dozens of openings before anybody has tapped it.
 */
const NAMED_FETCHER =
  /facebookexternalhit|facebot|twitterbot|slackbot|linkedinbot|discordbot|telegrambot|whatsapp|skypeuripreview|viber|pinterest|redditbot|embedly|googlebot|bingbot|applebot|iframely|bot\b|crawler|spider|preview/i;

/**
 * Apps whose own browser carries the app's name as well as their fetcher does. Zalo's browser is
 * where most Links are opened, so telling the two apart matters: the browser is a web view, and a
 * web view says so (`AppleWebKit`, `Gecko/`); the fetcher does not.
 */
const APP_NAME = /zalo/i;
const BROWSER_ENGINE = /AppleWebKit|Gecko\//i;

/** Whether a request is a machine reading the Link for a preview, not a person opening it. */
const isPreviewFetcher = (userAgent: string | null | undefined): boolean =>
  Boolean(
    userAgent && (NAMED_FETCHER.test(userAgent) || (APP_NAME.test(userAgent) && !BROWSER_ENGINE.test(userAgent)))
  );

/** A request with no user agent at all is a script, not a person holding a phone. */
const isMachineAgent = (userAgent: string | null | undefined): boolean => !userAgent || isPreviewFetcher(userAgent);

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * The day a Lượt mở is counted under, as `yyyy-mm-dd` in Vietnam time. The university reads these
 * numbers by its own calendar; a UTC day would file an 06:00 scan under yesterday.
 */
const visitDay = (at: Date): string => new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/**
 * The country a Lượt mở came from, as the network in front of the system reports it - two capital
 * letters - or "" when it does not, or reports a placeholder (`XX` unknown, `T1` Tor). Read from a
 * header, so a server without such a network simply counts every opening as unknown.
 */
const COUNTRY = /^[A-Z]{2}$/;
const NOT_A_COUNTRY = new Set(["XX", "T1"]);

const visitCountry = (header: string | null | undefined): string => {
  const code = (header ?? "").trim().toUpperCase();
  return COUNTRY.test(code) && !NOT_A_COUNTRY.has(code) ? code : "";
};

/**
 * Sites that send their visitors on through a host of their own, folded into the site people
 * know. Anything else keeps its own host.
 */
const SITE_ALIASES: Record<string, string> = {
  "l.facebook.com": "facebook.com",
  "l.instagram.com": "instagram.com",
  "l.messenger.com": "messenger.com",
  "lm.facebook.com": "facebook.com",
  "m.facebook.com": "facebook.com",
  "mobile.facebook.com": "facebook.com",
  "t.co": "x.com",
  "web.facebook.com": "facebook.com"
};

const WWW = /^www\./;

/**
 * The site a Lượt mở came from: the host of the `Referer`, without `www.`, or "" when there is
 * none - a scanned QR, a typed address and most chat apps send nothing. Only the host is kept: the
 * rest of the address can name a person or a private page. `ownHost` is this system: a Link opened
 * from its own pages did not come from anywhere else.
 */
const referrerSite = (referer: string | null | undefined, ownHost: string): string => {
  if (!(referer && URL.canParse(referer))) {
    return "";
  }
  const url = new URL(referer);
  // An Android app that opened the Link names itself as `android-app://<package>/`.
  if (url.protocol === "android-app:") {
    return url.hostname.toLowerCase();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "";
  }
  const host = url.hostname.toLowerCase().replace(WWW, "");
  if (host === ownHost.toLowerCase().replace(WWW, "")) {
    return "";
  }
  return SITE_ALIASES[host] ?? host;
};

export { isMachineAgent, isPreviewFetcher, referrerSite, visitCountry, visitDay };
