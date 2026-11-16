/** What counts as a Lượt mở, and which day it belongs to (CONTEXT.md). */

/**
 * Fetchers that open a Link to build a preview, and crawlers. Never complete - which is why the
 * UI calls the count an estimate - but without it a Link pasted into one Zalo group shows dozens
 * of openings before anybody has tapped it.
 */
const MACHINE_AGENT =
  /zalo|facebookexternalhit|facebot|whatsapp|telegrambot|twitterbot|slackbot|linkedinbot|discordbot|skypeuripreview|bot\b|crawler|spider|preview/i;

/** A request with no user agent at all is a script, not a person holding a phone. */
const isMachineAgent = (userAgent: string | null | undefined): boolean => !userAgent || MACHINE_AGENT.test(userAgent);

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * The day a Lượt mở is counted under, as `yyyy-mm-dd` in Vietnam time. The university reads these
 * numbers by its own calendar; a UTC day would file an 06:00 scan under yesterday.
 */
const visitDay = (at: Date): string => new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

export { isMachineAgent, visitDay };
