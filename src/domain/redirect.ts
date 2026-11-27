/**
 * The Redirect Type a Link answers with when it sends its visitor on (ADR-0009). 302 unless its
 * Unit chose otherwise. Every one is sent with `Cache-Control: no-store`, so a browser that follows
 * the standard asks again on the next opening and a changed Target still reaches it - but a
 * permanent one tells search engines, and some apps, that the address has moved for good.
 */

/** In the order the UI offers them: the temporary ones first, the default first of all. */
const REDIRECT_TYPES = [302, 307, 301, 308] as const;

type RedirectType = (typeof REDIRECT_TYPES)[number];

const DEFAULT_REDIRECT_TYPE: RedirectType = 302;

const isRedirectType = (value: unknown): value is RedirectType => REDIRECT_TYPES.includes(value as RedirectType);

/** Whether it says the address has moved for good: what a search engine or an app may remember. */
const isPermanent = (type: RedirectType): boolean => type === 301 || type === 308;

export { DEFAULT_REDIRECT_TYPE, isPermanent, isRedirectType, REDIRECT_TYPES, type RedirectType };
