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

export { isMachineAgent, isPreviewFetcher, visitDay };
