import { describe, expect, it } from "vitest";
import { googleSafeBrowsing } from "./safety";

const answering = (status: number, body: unknown, seen: { url?: string; body?: unknown } = {}) =>
  ((url: string, init?: RequestInit) => {
    seen.url = url;
    seen.body = JSON.parse(String(init?.body));
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as typeof fetch;

describe("Google Safe Browsing", () => {
  it("asks about every address at once and answers the listed ones", async () => {
    const seen: { url?: string; body?: unknown } = {};
    const check = googleSafeBrowsing(
      "khoa",
      answering(200, { matches: [{ threat: { url: "https://xau.example/" } }] }, seen)
    );

    expect(await check(["https://tot.example/", "https://xau.example/"])).toEqual(new Set(["https://xau.example/"]));
    expect(seen.url).toBe("https://safebrowsing.googleapis.com/v4/threatMatches:find?key=khoa");
    expect(seen.body).toMatchObject({
      threatInfo: { threatEntries: [{ url: "https://tot.example/" }, { url: "https://xau.example/" }] }
    });
  });

  it("answers nothing listed for an empty answer, and null when it cannot ask", async () => {
    expect(await googleSafeBrowsing("khoa", answering(200, {}))(["https://tot.example/"])).toEqual(new Set());
    expect(await googleSafeBrowsing("khoa", answering(403, {}))(["https://tot.example/"])).toBeNull();
    const broken = (() => Promise.reject(new Error("offline"))) as typeof fetch;
    expect(await googleSafeBrowsing("khoa", broken)(["https://tot.example/"])).toBeNull();
  });
});
