/**
 * What the request handling needs from storage, and nothing about where storage lives.
 *
 * This seam is ADR-0001 in code: the app is written against `Store`, the Cloudflare adapter
 * (`store-d1.ts`) is one implementation of it, and moving to the university's servers means
 * writing another - not touching the handlers.
 */

type OpenableLink = {
  id: number;
  target: string;
  enabled: boolean;
};

type Store = {
  /** The Link behind a normalised Mã link, or null when there is none. */
  findLinkByCode: (code: string) => Promise<OpenableLink | null>;
  /** Adds one Lượt mở to a Link's count for a day (`yyyy-mm-dd`). */
  recordVisit: (linkId: number, day: string) => Promise<void>;
};

export type { OpenableLink, Store };
