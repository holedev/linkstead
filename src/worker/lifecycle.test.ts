import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recheckTargets } from "./safety";
import { bearer, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const TARGET = "https://journalofscience.ou.edu.vn/cfp";
const PHISHING = "https://dang-nhap-ou.example/login";
const PASSWORD = "mat-khau-du-dai";

type Browser = ReturnType<typeof h.client>;

/** The administrator - a Quản lý đơn vị of Đơn vị 1 too - with the Link `cfp-2027`. */
const withLink = async () => {
  const admin = await h.signedInAdmin();
  await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
  return admin;
};

const member = async (admin: Browser, unitId: number, email: string) => {
  const added = await admin.post(`/api/units/${unitId}/members`, { email });
  const browser = h.client();
  const { setupUrl } = (await added.json()) as { setupUrl: string };
  await browser.setup(tokenOf(setupUrl), email, PASSWORD);
  await browser.login(email, PASSWORD);
  return browser;
};

const codesOf = async (browser: Browser) =>
  ((await (await browser.get("/api/links?unitId=1")).json()) as { links: { code: string }[] }).links.map(
    (link) => link.code
  );

describe("archiving a Link", () => {
  it("puts it away and back for any Thành viên, while it keeps opening and counting", async () => {
    const admin = await withLink();
    const thanh = await member(admin, 1, "thanh@ou.edu.vn");

    const archived = await thanh.post("/api/links/cfp-2027/archive");
    expect(await archived.json()).toMatchObject({ archived: true, enabled: true });
    expect((await h.client().get("/cfp-2027")).headers.get("location")).toBe(TARGET);
    expect(await (await thanh.get("/api/links?unitId=1")).json()).toMatchObject({ links: [{ archived: true }] });

    expect(await (await thanh.post("/api/links/cfp-2027/unarchive")).json()).toMatchObject({ archived: false });
  });

  it("is not one of the API's six things", async () => {
    const admin = await withLink();
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };
    expect((await h.client().post("/api/links/cfp-2027/archive", undefined, { headers: bearer(key) })).status).toBe(
      403
    );
  });
});

describe("deleting a Link", () => {
  it("takes the Mã link typed back, then the Link opens nowhere and is listed nowhere", async () => {
    const admin = await withLink();

    expect((await admin.delete("/api/links/cfp-2027", { body: { confirmCode: "cfp" } })).status).toBe(422);
    expect((await admin.delete("/api/links/cfp-2027", { body: { confirmCode: "CFP-2027" } })).status).toBe(204);

    const opened = await h.client().get("/cfp-2027");
    expect(opened.status).toBe(410);
    expect(opened.headers.get("location")).toBeNull();
    expect(await opened.text()).toContain("đã bị xóa");
    expect(await codesOf(admin)).toEqual([]);
    expect((await admin.get("/api/links/cfp-2027/visits")).status).toBe(404);
    expect((await admin.get("/api/links/cfp-2027/qr")).status).toBe(404);
    expect((await admin.delete("/api/links/cfp-2027", { body: { confirmCode: "cfp-2027" } })).status).toBe(404);
  });

  it("never gives its Mã link out again", async () => {
    const admin = await withLink();
    await admin.delete("/api/links/cfp-2027", { body: { confirmCode: "cfp-2027" } });

    const again = await admin.post("/api/links", { code: "cfp-2027", name: "Mới", target: TARGET, unitId: 1 });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "code-taken" });
    expect((await admin.post("/api/admin/reserved-codes", { code: "cfp-2027" })).status).toBe(409);
  });

  it("is for a Quản lý đơn vị or a Quản trị hệ thống - not a plain Thành viên, not a key", async () => {
    const admin = await withLink();
    const thanh = await member(admin, 1, "thanh@ou.edu.vn");
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };
    const body = { confirmCode: "cfp-2027" };

    expect((await thanh.delete("/api/links/cfp-2027", { body })).status).toBe(403);
    expect((await h.client().delete("/api/links/cfp-2027", { body, headers: bearer(key) })).status).toBe(403);
    await admin.put("/api/units/1/members/thanh@ou.edu.vn", { role: "manager" });
    expect((await thanh.delete("/api/links/cfp-2027", { body })).status).toBe(204);
  });

  it("stays visible to a Quản trị hệ thống's lookup, with who deleted it", async () => {
    const admin = await withLink();
    await admin.delete("/api/links/cfp-2027", { body: { confirmCode: "cfp-2027" } });

    const found = (await (await admin.get("/api/admin/links/cfp-2027")).json()) as {
      deletedAt: string;
      history: object[];
    };
    expect(found.deletedAt).toBe("2027-03-01T03:00:00.000Z");
    expect(found.history[0]).toEqual({
      at: "2027-03-01T03:00:00.000Z",
      by: { email: "admin@ou.edu.vn", kind: "account" },
      kind: "deleted"
    });
    expect((await admin.post("/api/admin/links/cfp-2027/move", { unitId: 2 })).status).toBe(404);
  });
});

describe("an unsafe Đích", () => {
  it("is refused on its way in, when created or changed to", async () => {
    const admin = await withLink();
    h.unsafe.add(PHISHING);

    const created = await admin.post("/api/links", { name: "Lừa", target: PHISHING, unitId: 1 });
    expect(created.status).toBe(422);
    expect(await created.json()).toEqual({ error: "bad-target", problem: "unsafe" });
    const changed = await admin.put("/api/links/cfp-2027/target", { target: PHISHING });
    expect(await changed.json()).toEqual({ error: "bad-target", problem: "unsafe" });
  });

  it("found by the daily check, warns visitors instead of sending them, until the Đích changes", async () => {
    const admin = await withLink();
    h.unsafe.add(TARGET);

    expect(await recheckTargets(h.store, h.checkSafety, new Date("2027-03-02T00:00:00Z"))).toBe(1);
    const opened = await h.client().get("/cfp-2027");
    expect(opened.status).toBe(200);
    expect(opened.headers.get("location")).toBeNull();
    const page = await opened.text();
    expect(page).toContain("không an toàn");
    expect(page).toContain(`href="${TARGET}"`);
    expect(await (await admin.get("/api/links?unitId=1")).json()).toMatchObject({
      links: [{ unsafeSince: "2027-03-02T00:00:00.000Z" }]
    });

    await admin.put("/api/links/cfp-2027/target", { target: `${TARGET}-moi` });
    expect((await h.client().get("/cfp-2027")).status).toBe(302);
  });

  it("is cleared by a later check that no longer lists it", async () => {
    await withLink();
    h.unsafe.add(TARGET);
    await recheckTargets(h.store, h.checkSafety, new Date("2027-03-02T00:00:00Z"));
    h.unsafe.clear();

    expect(await recheckTargets(h.store, h.checkSafety, new Date("2027-03-03T00:00:00Z"))).toBe(0);
    expect((await h.client().get("/cfp-2027")).status).toBe(302);
  });

  it("is left as it was when the list cannot be reached", async () => {
    await withLink();
    h.unsafe.add(TARGET);
    await recheckTargets(h.store, h.checkSafety, new Date("2027-03-02T00:00:00Z"));

    expect(await recheckTargets(h.store, () => Promise.resolve(null), new Date("2027-03-03T00:00:00Z"))).toBe(1);
    expect((await h.client().get("/cfp-2027")).status).toBe(200);
  });
});

describe("a Đơn vị's Lượt mở at a glance", () => {
  it("adds up its Links per day, names the most opened, and says where they came from", async () => {
    const admin = await withLink();
    await admin.post("/api/links", { code: "so-3", name: "Số 3", target: TARGET, unitId: 1 });
    const visitor = h.client();
    const zalo = { headers: { "cf-ipcountry": "VN", referer: "https://zalo.me/" } };
    await visitor.get("/cfp-2027", zalo);
    await visitor.get("/so-3", zalo);
    await visitor.get("/so-3", { headers: { "cf-ipcountry": "JP" } });
    h.advance(40 * 24 * 60 * 60 * 1000);
    await visitor.get("/so-3");
    // Forty days on, the session has long expired.
    await admin.login("admin@ou.edu.vn", "mat-khau-quan-tri");

    const all = await (await admin.get("/api/units/1/visits")).json();
    expect(all).toMatchObject({
      countries: [
        { count: 2, value: "VN" },
        { count: 1, value: "" },
        { count: 1, value: "JP" }
      ],
      days: [
        { count: 3, day: "2027-03-01" },
        { count: 1, day: "2027-04-10" }
      ],
      referrers: [
        { count: 2, value: "" },
        { count: 2, value: "zalo.me" }
      ],
      since: null,
      topLinks: [
        { code: "so-3", count: 3, name: "Số 3" },
        { code: "cfp-2027", count: 1, name: "Poster" }
      ],
      total: 4
    });

    const month = (await (await admin.get("/api/units/1/visits?days=30")).json()) as object;
    expect(month).toMatchObject({
      since: "2027-03-12",
      today: "2027-04-10",
      topLinks: [{ code: "so-3", count: 1 }],
      total: 1
    });
  });

  it("leaves out deleted Links, and is for the Đơn vị's own Thành viên", async () => {
    const admin = await withLink();
    await h.client().get("/cfp-2027");
    await admin.delete("/api/links/cfp-2027", { body: { confirmCode: "cfp-2027" } });

    expect(await (await admin.get("/api/units/1/visits")).json()).toMatchObject({ topLinks: [], total: 0 });
    const outsider = await member(admin, 2, "khac@ou.edu.vn");
    expect((await outsider.get("/api/units/1/visits")).status).toBe(403);
  });

  it("downloads where Lượt mở came from as CSV", async () => {
    const admin = await withLink();
    await h.client().get("/cfp-2027", { headers: { "cf-ipcountry": "VN" } });

    const csv = await (await admin.get("/api/units/1/visit-sources.csv")).text();
    expect(csv.split("\r\n")).toEqual([
      "Mã link,Ngày,Loại,Giá trị,Lượt mở (ước tính)",
      "cfp-2027,2027-03-01,Quốc gia,VN,1",
      "cfp-2027,2027-03-01,Nguồn giới thiệu,Không rõ,1",
      ""
    ]);
  });
});
