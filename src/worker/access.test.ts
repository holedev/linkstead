import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, startHarness } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const TARGET = "https://journalofscience.ou.edu.vn/phan-bien";
const DAY = 24 * 60 * 60 * 1000;

const withLink = async () => {
  const admin = await h.signedInAdmin();
  await admin.post("/api/links", { code: "phan-bien", name: "Bài gửi phản biện", target: TARGET, unitId: 1 });
  return admin;
};

const visitsOf = async () =>
  (await h.db.prepare("SELECT coalesce(sum(count), 0) AS total FROM daily_visits").first<{ total: number }>())?.total;

describe("a Link with a password", () => {
  it("asks for it, says nothing of the Đích, and sends the visitor on once it is given", async () => {
    const admin = await withLink();
    const set = await admin.put("/api/links/phan-bien/access", { password: "hoi-dong" });
    expect(await set.json()).toMatchObject({ hasPassword: true });
    expect(JSON.stringify(await (await admin.get("/api/links?unitId=1")).json())).not.toContain("pbkdf2");

    const visitor = h.client();
    const asked = await visitor.get("/phan-bien");
    const page = await asked.text();
    expect(asked.status).toBe(200);
    expect(asked.headers.get("location")).toBeNull();
    expect(page).toContain("cần mật khẩu");
    expect(page).not.toContain("journalofscience");

    const wrong = await visitor.postForm("/phan-bien", { password: "doan-thu" });
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain("Mật khẩu không đúng");
    expect(await visitsOf()).toBe(0);

    const right = await visitor.postForm("/phan-bien", { password: "hoi-dong" });
    expect(right.status).toBe(303);
    expect(right.headers.get("location")).toBe(TARGET);
    expect(await visitsOf()).toBe(1);
  });

  it("gives a preview fetcher the password page too, never the Đích's title", async () => {
    const admin = await withLink();
    h.pages.set(TARGET, "<title>Bài báo bí mật</title>");
    await admin.put("/api/links/phan-bien/access", { password: "hoi-dong" });

    const page = await (
      await h.client().get("/phan-bien", { headers: { "user-agent": "facebookexternalhit/1.1" } })
    ).text();
    expect(page).toContain("cần mật khẩu");
    expect(page).not.toContain("Bài báo bí mật");
  });

  it("shows a chat app its Đơn vị's own words, or the locked ones, and never reads the Đích", async () => {
    const admin = await withLink();
    h.pages.set(
      TARGET,
      '<title>Bài báo bí mật</title><meta property="og:image" content="https://anh.example/bi-mat.png">'
    );
    await admin.put("/api/links/phan-bien/access", { password: "hoi-dong" });
    const fetcher = { headers: { "user-agent": "facebookexternalhit/1.1" } };

    const locked = await (await h.client().get("/phan-bien", fetcher)).text();
    expect(locked).toContain('<meta content="Liên kết cần mật khẩu" property="og:title"/>');
    expect(locked).not.toContain("bi-mat.png");
    expect(await (await admin.get("/api/links/phan-bien/preview")).json()).toMatchObject({ fromTarget: null });

    await admin.put("/api/links/phan-bien/preview", { description: "", image: "", title: "Tài liệu cho hội đồng" });
    expect(await (await h.client().get("/phan-bien", fetcher)).text()).toContain(
      '<meta content="Tài liệu cho hội đồng" property="og:title"/>'
    );
  });

  it("makes a guesser wait after ten wrong tries in a minute", async () => {
    const admin = await withLink();
    await admin.put("/api/links/phan-bien/access", { password: "hoi-dong" });
    const visitor = h.client();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await visitor.postForm("/phan-bien", { password: `sai-${attempt}` });
    }

    expect((await visitor.postForm("/phan-bien", { password: "hoi-dong" })).status).toBe(429);
    h.advance(60_000);
    expect((await visitor.postForm("/phan-bien", { password: "hoi-dong" })).status).toBe(303);
  });

  it("is removed with null, after which the Link simply redirects", async () => {
    const admin = await withLink();
    await admin.put("/api/links/phan-bien/access", { password: "hoi-dong" });
    expect(await (await admin.put("/api/links/phan-bien/access", { password: null })).json()).toMatchObject({
      hasPassword: false
    });
    expect((await h.client().get("/phan-bien")).status).toBe(302);
  });

  it("must be 4 to 100 characters, and is set by people only", async () => {
    const admin = await withLink();
    expect(await (await admin.put("/api/links/phan-bien/access", { password: "abc" })).json()).toEqual({
      error: "bad-password",
      problem: "too-short"
    });
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };
    expect(
      (await h.client().put("/api/links/phan-bien/access", { password: "hoi-dong" }, { headers: bearer(key) })).status
    ).toBe(403);
  });
});

describe("a Link with an expiry", () => {
  it("opens until then, shows the expired notice after, and can be given longer", async () => {
    const admin = await withLink();
    const until = new Date(Date.parse("2027-03-01T03:00:00Z") + 2 * DAY).toISOString();
    expect(await (await admin.put("/api/links/phan-bien/access", { expiresAt: until })).json()).toMatchObject({
      expiresAt: until
    });

    expect((await h.client().get("/phan-bien")).status).toBe(302);
    h.advance(2 * DAY);
    const expired = await h.client().get("/phan-bien");
    expect(expired.status).toBe(404);
    expect(await expired.text()).toContain("đã hết hạn");
    expect(await visitsOf()).toBe(1);

    await admin.login("admin@ou.edu.vn", "mat-khau-quan-tri");
    await admin.put("/api/links/phan-bien/access", { expiresAt: null });
    expect((await h.client().get("/phan-bien")).status).toBe(302);
  });

  it("must be a moment still to come, and keeps the code taken after it", async () => {
    const admin = await withLink();
    expect(
      await (await admin.put("/api/links/phan-bien/access", { expiresAt: "2027-02-01T00:00:00Z" })).json()
    ).toEqual({
      error: "bad-expiry",
      problem: "in-the-past"
    });
    expect(await (await admin.put("/api/links/phan-bien/access", { expiresAt: "ngày mai" })).json()).toEqual({
      error: "bad-expiry",
      problem: "not-a-date"
    });

    await admin.put("/api/links/phan-bien/access", { expiresAt: "2027-03-01T04:00:00Z" });
    h.advance(DAY);
    await admin.login("admin@ou.edu.vn", "mat-khau-quan-tri");
    const again = await admin.post("/api/links", { code: "phan-bien", name: "Mới", target: TARGET, unitId: 1 });
    expect(again.status).toBe(409);
  });
});

describe("a Link's QR shape", () => {
  it("is kept with the Link, so every download is drawn the same way", async () => {
    const admin = await withLink();
    expect(await (await admin.get("/api/links/phan-bien/qr")).text()).toContain("crispEdges");

    expect(await (await admin.put("/api/links/phan-bien/qr-shape", { shape: "dots" })).json()).toEqual({
      qrShape: "dots"
    });
    expect(await (await admin.get("/api/links/phan-bien/qr")).text()).toContain('fill-rule="evenodd"');
    expect(await (await admin.get("/api/links?unitId=1")).json()).toMatchObject({ links: [{ qrShape: "dots" }] });
    expect((await admin.put("/api/links/phan-bien/qr-shape", { shape: "stars" })).status).toBe(422);
  });
});
