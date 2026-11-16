import { isFetchableTarget } from "../domain/preview";

/**
 * Reads a Đích's page so its preview tags can be passed on. Plain `fetch`, which Workers and Node
 * both have (ADR-0001). Redirects are followed by hand so each hop is checked like the first, the
 * wait is short - a preview fetcher is waiting - and only the start of the page is read, where
 * the tags are.
 */

const TIMEOUT_MS = 3000;
const MAX_BYTES = 256 * 1024;
const MAX_HOPS = 4;

type FetchedPage = { html: string; url: string };

/** The first `MAX_BYTES` of a body, without waiting for the rest. */
const readStart = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text;
};

const fetchPage = async (start: string): Promise<FetchedPage | null> => {
  let url = start;
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      if (!isFetchableTarget(url)) {
        return null;
      }
      const response = await fetch(url, {
        headers: { accept: "text/html", "user-agent": "OU-Link-Preview/1.0" },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      const next = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && next) {
        await response.body?.cancel();
        url = new URL(next, url).href;
        continue;
      }
      if (!(response.ok && (response.headers.get("content-type") ?? "").includes("html"))) {
        await response.body?.cancel();
        return null;
      }
      return { html: await readStart(response), url };
    }
  } catch {
    // An unreachable or slow Đích only costs the preview its tags, never the Link anything else.
  }
  return null;
};

export { type FetchedPage, fetchPage };
