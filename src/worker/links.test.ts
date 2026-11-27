import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, ORIGIN, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const TARGET = "https://journalofscience.example.org/cfp";
const GENERATED = /^[a-km-np-z2-9]{6}$/;

const visits = async () =>
  (
    await h.db
      .prepare("SELECT link_id, day, count FROM daily_visits")
      .all<{ link_id: number; day: string; count: number }>()
  ).results;

describe("creating a Link", () => {
  it("takes a chosen Mã link and answers with the address to print", async () => {
    const admin = await h.signedInAdmin();
    const created = await admin.post("/api/links", {
      code: "CFP-2027",
      name: "Poster hội thảo, bản in A3",
      note: "Dán ở sảnh A",
      target: TARGET,
      unitId: 1
    });

    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      code: "cfp-2027",
      enabled: true,
      name: "Poster hội thảo, bản in A3",
      note: "Dán ở sảnh A",
      target: TARGET,
      unitId: 1,
      url: `${ORIGIN}/cfp-2027`
    });
  });

  it("generates a six-character code when none is chosen", async () => {
    const admin = await h.signedInAdmin();
    const created = await admin.post("/api/links", { name: "Không mã", target: TARGET, unitId: 1 });
    expect(((await created.json()) as { code: string }).code).toMatch(GENERATED);
  });

  it("never gives a taken code to a second Link, whatever its case or Đơn vị", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Một", target: TARGET, unitId: 1 });

    const again = await admin.post("/api/links", { code: "Cfp-2027", name: "Hai", target: TARGET, unitId: 2 });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "code-taken" });
  });

  it("keeps the code taken after the Link is switched off", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Một", target: TARGET, unitId: 1 });
    await h.db.prepare("UPDATE links SET enabled = 0").run();

    expect((await admin.post("/api/links", { code: "cfp-2027", name: "Hai", target: TARGET, unitId: 1 })).status).toBe(
      409
    );
  });

  it("refuses a malformed code and a reserved one, saying which", async () => {
    const admin = await h.signedInAdmin();
    await h.db.prepare("INSERT INTO reserved_codes (code) VALUES ('tuyensinh')").run();
    const attempt = async (code: string) =>
      (await (await admin.post("/api/links", { code, name: "Thử", target: TARGET, unitId: 1 })).json()) as object;

    expect(await attempt("hội-thảo")).toEqual({ error: "bad-code", problem: "bad-characters" });
    expect(await attempt("ab")).toEqual({ error: "bad-code", problem: "too-short" });
    expect(await attempt("api")).toEqual({ error: "bad-code", problem: "reserved" });
    expect(await attempt("TuyenSinh")).toEqual({ error: "bad-code", problem: "reserved" });
  });

  it("refuses a Đích that is not https or points back at this system", async () => {
    const admin = await h.signedInAdmin();
    const attempt = async (target: string) =>
      (await (await admin.post("/api/links", { name: "Thử", target, unitId: 1 })).json()) as object;

    expect(await attempt("http://example.org/")).toEqual({ error: "bad-target", problem: "not-https" });
    expect(await attempt(`${ORIGIN}/khac`)).toEqual({ error: "bad-target", problem: "points-at-self" });
    expect(await attempt("example.org")).toEqual({ error: "bad-target", problem: "not-a-url" });
  });

  it("requires a Tên link", async () => {
    const admin = await h.signedInAdmin();
    expect((await admin.post("/api/links", { name: "  ", target: TARGET, unitId: 1 })).status).toBe(422);
  });

  it("is refused to someone not signed in, and to a member of another Đơn vị", async () => {
    const admin = await h.signedInAdmin();
    const added = await admin.post("/api/units/2/members", { email: "nxb@example.org" });
    const publisher = h.client();
    const { setupUrl } = (await added.json()) as { setupUrl: string };
    await publisher.setup(tokenOf(setupUrl), "nxb@example.org", "mat-khau-du-dai");
    await publisher.login("nxb@example.org", "mat-khau-du-dai");

    expect((await h.client().post("/api/links", { name: "Thử", target: TARGET, unitId: 1 })).status).toBe(401);
    expect((await publisher.post("/api/links", { name: "Thử", target: TARGET, unitId: 1 })).status).toBe(403);
    expect((await publisher.post("/api/links", { name: "Thử", target: TARGET })).status).toBe(422);
    expect((await publisher.post("/api/links", { name: "Thử", target: TARGET, unitId: 2 })).status).toBe(201);
  });
});

describe("reading one Link", () => {
  it("answers a member of its Đơn vị, whatever the case of the code", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });

    const read = await admin.get("/api/links/CFP-2027");
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
    expect((await admin.get("/api/links/khong-co")).status).toBe(404);
  });

  it("is refused to a stranger, a member of another Đơn vị and every Khóa API", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
    const added = await admin.post("/api/units/2/members", { email: "nxb@example.org" });
    const publisher = h.client();
    const { setupUrl } = (await added.json()) as { setupUrl: string };
    await publisher.setup(tokenOf(setupUrl), "nxb@example.org", "mat-khau-du-dai");
    await publisher.login("nxb@example.org", "mat-khau-du-dai");
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };

    expect((await h.client().get("/api/links/cfp-2027")).status).toBe(401);
    expect((await publisher.get("/api/links/cfp-2027")).status).toBe(403);
    // The API reads a Đơn vị's Links as a list and nothing else (AGENTS.md).
    expect((await h.client().get("/api/links/cfp-2027", { headers: bearer(key) })).status).toBe(403);
  });
});

describe("a Khóa API and Links", () => {
  it("creates in its own Đơn vị whatever the request names, and lists only that Đơn vị", async () => {
    const admin = await h.signedInAdmin();
    const { key } = (await (await admin.post("/api/units/2/keys", { name: "NXB" })).json()) as { key: string };
    await admin.post("/api/links", { code: "cua-tap-chi", name: "Tạp chí", target: TARGET, unitId: 1 });

    const app = h.client();
    const created = await app.post(
      "/api/links",
      { code: "cua-nxb", name: "NXB", target: TARGET, unitId: 1 },
      { headers: bearer(key) }
    );
    expect(((await created.json()) as { unitId: number }).unitId).toBe(2);

    const listed = (await (await app.get("/api/links?unitId=1", { headers: bearer(key) })).json()) as {
      links: { code: string }[];
    };
    expect(listed.links.map((link) => link.code)).toEqual(["cua-nxb"]);
  });

  it("records which key created the Link", async () => {
    const admin = await h.signedInAdmin();
    const { id, key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as {
      id: number;
      key: string;
    };
    await h.client().post("/api/links", { code: "tu-crm", name: "CRM", target: TARGET }, { headers: bearer(key) });

    const row = await h.db
      .prepare("SELECT created_by_api_key_id AS k, created_by_account_id AS a FROM links")
      .first<{ k: number | null; a: number | null }>();
    expect(row).toEqual({ a: null, k: id });
  });
});

describe("opening a Link", () => {
  const create = async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
  };

  it("sends the visitor to the Đích with a temporary, uncached redirect, whatever the case typed", async () => {
    await create();
    const response = await h.client().get("/CFP-2027");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(TARGET);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("counts Lượt mở per Vietnamese day, adding to the same row", async () => {
    await create();
    const visitor = h.client();
    await visitor.get("/cfp-2027");
    await visitor.get("/cfp-2027");
    // 03:00 UTC is 10:00 in Vietnam; fifteen hours on is 01:00 the next Vietnamese day.
    h.advance(15 * 60 * 60 * 1000);
    await visitor.get("/cfp-2027");

    expect(await visits()).toEqual([
      { count: 2, day: "2027-03-01", link_id: 1 },
      { count: 1, day: "2027-03-02", link_id: 1 }
    ]);
  });

  it("answers a preview fetcher with the preview page, and does not count it", async () => {
    await create();
    const response = await h.client().get("/cfp-2027", { headers: { "user-agent": "facebookexternalhit/1.1" } });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<meta property="og:url"');
    expect(await visits()).toEqual([]);
  });

  it("shows the notice for an unknown code, in both languages, and never redirects", async () => {
    const response = await h.client().get("/khong-co");
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(body).toContain("không tồn tại");
    expect(body).toContain("does not exist");
  });

  it("says on the notice which address was opened, as text, and offers the introduction", async () => {
    const body = await (await h.client().get("/h%E1%BB%99i-th%E1%BA%A3o%3Cb%3E")).text();

    expect(body).toContain("/hội-thảo&lt;b&gt;");
    expect(body).not.toContain("hội-thảo<b>");
    expect(body).toContain('href="/"');
  });

  it("introduces the Organization's links at the bare domain, with the way in for staff", async () => {
    const response = await h.client().get("/");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("<title>Example University</title>");
    expect(body).toContain("--org:#114fa0");
    expect(body).toContain('href="/app"');
    expect(body).not.toContain('name="robots"');
  });

  it("speaks the Organization's language on a notice, with English beneath only when that is another", async () => {
    const vietnamese = await (await h.client().get("/khong-co")).text();
    expect(vietnamese).toContain('<html lang="vi">');
    expect(vietnamese).toContain("Không tìm thấy liên kết");
    expect(vietnamese).toContain("Link not found");

    const admin = await h.signedInAdmin();
    await admin.put("/api/admin/settings", { language: "en" });
    const english = await (await h.client().get("/khong-co")).text();
    expect(english).toContain('<html lang="en">');
    expect(english).toContain("Link not found");
    expect(english).not.toContain("Không tìm thấy");
    expect(english).not.toContain('class="en" lang="en"');
  });

  it("shows a different notice for a Link bị tắt, and does not count the opening", async () => {
    await create();
    await h.db.prepare("UPDATE links SET enabled = 0").run();
    const response = await h.client().get("/cfp-2027");

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("đã bị tắt");
    expect(await visits()).toEqual([]);
  });

  it("serves the UI under /app, unframeable and without leaking the address as a referrer", async () => {
    const response = await h.client().get("/app/setup?token=bi-mat");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>ui</title>");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect((await h.client().get("/app")).status).toBe(200);
  });

  it("answers the notice for malformed and system paths, and JSON for an unknown API path", async () => {
    const visitor = h.client();
    expect((await visitor.get("/hội-thảo")).status).toBe(404);
    expect((await visitor.get("/admin")).status).toBe(404);
    expect((await visitor.get("/a/b/c")).status).toBe(404);
    expect(await (await visitor.get("/api/khong-co")).json()).toEqual({ error: "not-found" });
    expect(await (await visitor.get("/api/health")).json()).toEqual({ ok: true });
  });
});
