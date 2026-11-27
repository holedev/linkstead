import type { LinkToCheck, Store } from "./store";

/**
 * Whether a Đích is safe to send people to. A Link under the university's domain that leads to a
 * phishing page borrows the university's name, so a Đích is checked on its way in, and every Đích
 * is checked again each day - a domain can change hands long after its Link was printed.
 */

/**
 * Looks addresses up and answers the ones listed as unsafe, or null when the lookup could not be
 * made. Null lets the work go on: an unreachable list must not stop a Đơn vị changing its Đích.
 */
type SafetyCheck = (urls: readonly string[]) => Promise<ReadonlySet<string> | null>;

/** Google's limit for one lookup. */
const LOOKUP_SIZE = 500;
const TIMEOUT_MS = 5000;

const THREAT_TYPES = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"];

type LookupAnswer = { matches?: { threat?: { url?: unknown } }[] };

/**
 * Google Safe Browsing's Lookup API (v4), with a key from Google Cloud. Plain `fetch`, so it runs
 * wherever the Worker is moved to (ADR-0001). The key is a setting, never written into the code.
 */
const googleSafeBrowsing =
  (apiKey: string, fetcher: typeof fetch = fetch): SafetyCheck =>
  async (urls) => {
    if (urls.length === 0) {
      return new Set();
    }
    try {
      const response = await fetcher(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`, {
        body: JSON.stringify({
          client: { clientId: "linkstead", clientVersion: "1" },
          threatInfo: {
            platformTypes: ["ANY_PLATFORM"],
            threatEntries: urls.map((url) => ({ url })),
            threatEntryTypes: ["URL"],
            threatTypes: THREAT_TYPES
          }
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!response.ok) {
        return null;
      }
      const answer = (await response.json()) as LookupAnswer;
      const listed = (answer.matches ?? []).map((match) => match.threat?.url);
      return new Set(listed.filter((url): url is string => typeof url === "string"));
    } catch {
      return null;
    }
  };

/** Whether a single Đích is listed. Unknown - no check set up, or none possible - counts as not. */
const isListedUnsafe = async (check: SafetyCheck | undefined, target: string): Promise<boolean> =>
  (await check?.([target]))?.has(target) ?? false;

/**
 * The daily check: looks every Link's Đích up again, marks the ones newly listed and clears the
 * ones no longer listed. A lookup that fails leaves its Links as they were. Answers how many
 * Links are marked unsafe once it is done.
 */
const recheckTargets = async (store: Store, check: SafetyCheck, at: Date): Promise<number> => {
  const all = await store.listLinksToCheck();
  let unsafe = 0;
  for (let start = 0; start < all.length; start += LOOKUP_SIZE) {
    const chunk: LinkToCheck[] = all.slice(start, start + LOOKUP_SIZE);
    const listed = await check([...new Set(chunk.map((link) => link.target))]);
    for (const link of chunk) {
      const isUnsafe = listed ? listed.has(link.target) : link.unsafeSince !== null;
      if (listed && isUnsafe !== (link.unsafeSince !== null)) {
        await store.setLinkUnsafe(link.id, isUnsafe ? at : null);
      }
      unsafe += isUnsafe ? 1 : 0;
    }
  }
  return unsafe;
};

export { googleSafeBrowsing, isListedUnsafe, LOOKUP_SIZE, recheckTargets, type SafetyCheck };
