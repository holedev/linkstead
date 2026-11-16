import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { OpenableLink, Store } from "./store";

const PHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** An in-memory `Store`. That the app runs against it at all is ADR-0001's portability, tested. */
const setup = (rows: Record<string, OpenableLink>, options: { failVisits?: boolean } = {}) => {
  const visits: { linkId: number; day: string }[] = [];
  const lookups: string[] = [];
  const deferred: Promise<unknown>[] = [];

  const store: Store = {
    findLinkByCode: (code) => {
      lookups.push(code);
      return Promise.resolve(rows[code] ?? null);
    },
    recordVisit: (linkId, day) => {
      if (options.failVisits) {
        return Promise.reject(new Error("database is down"));
      }
      visits.push({ day, linkId });
      return Promise.resolve();
    }
  };

  const app = createApp({
    defer: (work) => {
      deferred.push(work);
    },
    now: () => new Date("2027-03-01T23:00:00Z"),
    store
  });

  const open = async (path: string, userAgent: string | null = PHONE) => {
    const response = await app.request(path, { headers: userAgent ? { "user-agent": userAgent } : {} });
    await Promise.all(deferred);
    return response;
  };

  return { lookups, open, visits };
};

const LINK: OpenableLink = { enabled: true, id: 7, target: "https://journalofscience.ou.edu.vn/cfp" };

describe("opening a Link", () => {
  it("sends the visitor to the Đích with a temporary, uncached redirect", async () => {
    const { open } = setup({ "cfp-2027": LINK });
    const response = await open("/cfp-2027");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(LINK.target);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("matches the code whatever case it was typed in", async () => {
    const { open } = setup({ "cfp-2027": LINK });
    expect((await open("/CFP-2027")).status).toBe(302);
  });

  it("counts one Lượt mở under the Vietnamese day", async () => {
    const { open, visits } = setup({ "cfp-2027": LINK });
    await open("/cfp-2027");
    expect(visits).toEqual([{ day: "2027-03-02", linkId: 7 }]);
  });

  it("redirects a preview fetcher but does not count it", async () => {
    const { open, visits } = setup({ "cfp-2027": LINK });
    const response = await open("/cfp-2027", "facebookexternalhit/1.1");

    expect(response.status).toBe(302);
    expect(visits).toEqual([]);
  });

  it("still redirects when the count cannot be written", async () => {
    const { open } = setup({ "cfp-2027": LINK }, { failVisits: true });
    expect((await open("/cfp-2027")).status).toBe(302);
  });
});

describe("what is not an open Link", () => {
  it("shows the notice for an unknown code, in both languages, and never redirects", async () => {
    const { open } = setup({});
    const response = await open("/khong-co");
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(body).toContain("không tồn tại");
    expect(body).toContain("does not exist");
  });

  it("shows a different notice for a Link bị tắt, and does not count the opening", async () => {
    const { open, visits } = setup({ "cfp-2027": { ...LINK, enabled: false } });
    const response = await open("/cfp-2027");

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("đã bị tắt");
    expect(visits).toEqual([]);
  });

  it("never asks the database about a malformed or system path", async () => {
    const { open, lookups } = setup({});

    expect((await open("/hội-thảo")).status).toBe(404);
    expect((await open("/app")).status).toBe(404);
    expect((await open("/a/b/c")).status).toBe(404);
    expect(lookups).toEqual([]);
  });
});

describe("health", () => {
  it("answers", async () => {
    const { open } = setup({});
    expect(await (await open("/api/health")).json()).toEqual({ ok: true });
  });
});
