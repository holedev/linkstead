import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const TARGET = "https://journalofscience.example.org/cfp";
const FACEBOOK = { "user-agent": "facebookexternalhit/1.1" };
const ZALO = { "user-agent": "Zalo" };
const TARGET_PAGE = `<html><head><title>CFP</title>
  <meta property="og:title" content="Kêu gọi bài viết 2027">
  <meta property="og:description" content="Hạn nộp 30/6/2027">
  <meta property="og:image" content="https://journalofscience.example.org/bia.jpg">
</head></html>`;

const withLink = async () => {
  const admin = await h.signedInAdmin();
  await admin.post("/api/links", { code: "cfp-2027", name: "Poster sảnh A, nội bộ", target: TARGET, unitId: 1 });
  return admin;
};

const visits = async () => (await h.db.prepare("SELECT count(*) AS n FROM daily_visits").first<{ n: number }>())?.n;

describe("a Link pasted into a chat or a post", () => {
  it("shows the Target's own title, description and image, and is not counted", async () => {
    await withLink();
    h.pages.set(TARGET, TARGET_PAGE);
    const response = await h.client().get("/cfp-2027", { headers: FACEBOOK });
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(page).toContain('<meta property="og:title" content="Kêu gọi bài viết 2027">');
    expect(page).toContain('<meta property="og:description" content="Hạn nộp 30/6/2027">');
    expect(page).toContain('<meta property="og:image" content="https://journalofscience.example.org/bia.jpg">');
    expect(page).toContain('<meta property="og:url" content="https://go.test/cfp-2027">');
    // The Link Name is the Unit's own note, never shown to the world.
    expect(page).not.toContain("Poster sảnh A");
    expect(await visits()).toBe(0);
  });

  it("follows the new Target as soon as it is changed", async () => {
    const admin = await withLink();
    const NEW = "https://journalofscience.example.org/so-moi";
    h.pages.set(TARGET, TARGET_PAGE);
    h.pages.set(
      NEW,
      '<meta property="og:title" content="Số mới"><meta property="og:image" content="https://a.vn/moi.jpg">'
    );
    expect(await (await h.client().get("/cfp-2027", { headers: ZALO })).text()).toContain(
      'content="Kêu gọi bài viết 2027"'
    );

    await admin.put("/api/links/cfp-2027/target", { target: NEW });
    const page = await (await h.client().get("/cfp-2027", { headers: ZALO })).text();
    expect(page).toContain('<meta property="og:title" content="Số mới">');
    expect(page).toContain('<meta property="og:image" content="https://a.vn/moi.jpg">');
    expect(page).not.toContain("Kêu gọi bài viết 2027");
  });

  it("drops a preview set by hand when the Target changes, if asked to", async () => {
    const admin = await withLink();
    const NEW = "https://journalofscience.example.org/so-moi";
    h.pages.set(NEW, '<meta property="og:title" content="Số mới">');
    await admin.put("/api/links/cfp-2027/preview", { description: "Cho trang cũ", title: "Tiêu đề cũ" });

    // Not asked: the preview set by hand stays.
    await admin.put("/api/links/cfp-2027/target", { target: NEW });
    expect(await (await h.client().get("/cfp-2027", { headers: ZALO })).text()).toContain('content="Tiêu đề cũ"');

    const changed = await admin.put("/api/links/cfp-2027/target", { resetPreview: true, target: TARGET });
    expect(await changed.json()).toMatchObject({ preview: { description: "", image: "", title: "" }, target: TARGET });
    h.pages.set(TARGET, TARGET_PAGE);
    const page = await (await h.client().get("/cfp-2027", { headers: ZALO })).text();
    expect(page).toContain('<meta property="og:title" content="Kêu gọi bài viết 2027">');
    expect(page).not.toContain("Tiêu đề cũ");
  });

  it("redirects and counts a person opening the Link inside Zalo, rather than showing them the preview", async () => {
    await withLink();
    const inZalo =
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 Zalo android/12100";
    const response = await h.client().get("/cfp-2027", { headers: { "user-agent": inZalo } });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(TARGET);
    expect(await visits()).toBe(1);
  });

  it("still redirects a person, temporarily", async () => {
    await withLink();
    h.pages.set(TARGET, TARGET_PAGE);
    const response = await h.client().get("/cfp-2027");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(TARGET);
    // A query added to make a chat app read the Link afresh changes nothing about where it leads.
    const busted = await h.client().get("/cfp-2027?v=2");
    expect(busted.status).toBe(302);
    expect(busted.headers.get("location")).toBe(TARGET);
  });

  it("uses what the Link sets itself, part by part, over the Target's", async () => {
    const admin = await withLink();
    h.pages.set(TARGET, TARGET_PAGE);
    const set = await admin.put("/api/links/cfp-2027/preview", {
      description: "",
      image: "https://example.org/poster.png",
      title: "Hội thảo khoa học 2027"
    });
    expect(await set.json()).toMatchObject({
      preview: { description: "", image: "https://example.org/poster.png", title: "Hội thảo khoa học 2027" }
    });

    const page = await (await h.client().get("/cfp-2027", { headers: ZALO })).text();
    expect(page).toContain('content="Hội thảo khoa học 2027"');
    expect(page).toContain('<meta property="og:description" content="Hạn nộp 30/6/2027">');
    expect(page).toContain('<meta property="og:image" content="https://example.org/poster.png">');
  });

  it("falls back to the Target's host when its page cannot be read and nothing was set", async () => {
    await withLink();
    const page = await (await h.client().get("/cfp-2027", { headers: FACEBOOK })).text();
    expect(page).toContain('<meta property="og:title" content="journalofscience.example.org">');
  });

  it("shows the notice, not a preview, for a Disabled Link or one that does not exist", async () => {
    const admin = await withLink();
    await admin.post("/api/links/cfp-2027/disable");
    expect((await h.client().get("/cfp-2027", { headers: FACEBOOK })).status).toBe(404);
    expect((await h.client().get("/khong-co", { headers: FACEBOOK })).status).toBe(404);
  });
});

describe("setting a Link's preview", () => {
  it("shows a member what the Target says and what the Link sets", async () => {
    const admin = await withLink();
    h.pages.set(TARGET, TARGET_PAGE);
    expect(await (await admin.get("/api/links/cfp-2027/preview")).json()).toEqual({
      fromTarget: {
        description: "Hạn nộp 30/6/2027",
        image: "https://journalofscience.example.org/bia.jpg",
        title: "Kêu gọi bài viết 2027"
      },
      own: { description: "", image: "", title: "" }
    });
  });

  it("refuses an image that is not https, and text that is too long", async () => {
    const admin = await withLink();
    const attempt = async (body: object) =>
      (await (await admin.put("/api/links/cfp-2027/preview", body)).json()) as object;
    expect(await attempt({ image: "http://example.org/a.png" })).toEqual({
      error: "bad-preview",
      problem: "image-not-https"
    });
    expect(await attempt({ title: "x".repeat(201) })).toEqual({ error: "bad-preview", problem: "title-too-long" });
    expect(await attempt({ description: "x".repeat(501) })).toEqual({
      error: "bad-preview",
      problem: "description-too-long"
    });
  });

  it("is for the Unit's own members: not another's, not an API Key", async () => {
    const admin = await withLink();
    const added = await admin.post("/api/units/2/members", { email: "khac@example.org" });
    const other = h.client();
    await other.setup(
      tokenOf(((await added.json()) as { setupUrl: string }).setupUrl),
      "khac@example.org",
      "mat-khau-du-dai"
    );
    await other.login("khac@example.org", "mat-khau-du-dai");
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };

    expect((await other.put("/api/links/cfp-2027/preview", { title: "x" })).status).toBe(403);
    expect((await h.client().put("/api/links/cfp-2027/preview", { title: "x" }, { headers: bearer(key) })).status).toBe(
      403
    );
    expect((await h.client().get("/api/links/cfp-2027/preview", { headers: bearer(key) })).status).toBe(403);
  });
});

describe("robots", () => {
  it("are kept out of the UI and the API, and the UI says so too", async () => {
    expect(await (await h.client().get("/robots.txt")).text()).toBe("User-agent: *\nDisallow: /app\nDisallow: /api\n");
    expect((await h.client().get("/app")).headers.get("x-robots-tag")).toBe("noindex");
  });
});
