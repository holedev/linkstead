import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const OLD = "https://journalofscience.ou.edu.vn/cfp";
const NEW = "https://journalofscience.ou.edu.vn/cfp-2027";
const PASSWORD = "mat-khau-du-dai";

type Browser = ReturnType<typeof h.client>;

/** The administrator, with one Link of Đơn vị 1 behind the code `cfp-2027`. */
const withLink = async () => {
  const admin = await h.signedInAdmin();
  await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: OLD, unitId: 1 });
  return admin;
};

/** A Thành viên who is not a Quản trị hệ thống, signed in. */
const member = async (admin: Browser, unitId: number, email: string) => {
  const added = await admin.post(`/api/units/${unitId}/members`, { email });
  const browser = h.client();
  const { setupUrl } = (await added.json()) as { setupUrl: string };
  await browser.post("/api/auth/setup", { password: PASSWORD, token: tokenOf(setupUrl) });
  await browser.post("/api/auth/login", { email, password: PASSWORD });
  return browser;
};

const keyOf = async (admin: Browser, unitId: number, name: string) =>
  ((await (await admin.post(`/api/units/${unitId}/keys`, { name })).json()) as { key: string }).key;

const historyOf = async (browser: Browser) =>
  ((await (await browser.get("/api/links/cfp-2027/history")).json()) as { history: object[] }).history;

describe("changing a Đích", () => {
  it("sends the next visitor to the new Đích and records who changed it", async () => {
    const admin = await withLink();
    const changed = await admin.put("/api/links/CFP-2027/target", { expectedTarget: OLD, target: NEW });

    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ code: "cfp-2027", target: NEW });
    expect((await h.client().get("/cfp-2027")).headers.get("location")).toBe(NEW);
    expect(await historyOf(admin)).toEqual([
      {
        at: "2027-03-01T03:00:00.000Z",
        by: { email: "admin@ou.edu.vn", kind: "account" },
        kind: "target",
        newTarget: NEW,
        oldTarget: OLD
      }
    ]);
  });

  it("writes nothing when the Đích is no longer the one that was confirmed", async () => {
    const admin = await withLink();
    await admin.put("/api/links/cfp-2027/target", { target: NEW });

    const late = await admin.put("/api/links/cfp-2027/target", {
      expectedTarget: OLD,
      target: "https://ou.edu.vn/khac"
    });
    expect(late.status).toBe(409);
    expect(await late.json()).toEqual({ error: "target-changed", target: NEW });
    expect(await historyOf(admin)).toHaveLength(1);
  });

  it("refuses a bad Đích and one that changes nothing, and records neither", async () => {
    const admin = await withLink();
    const attempt = async (target: string) =>
      (await (await admin.put("/api/links/cfp-2027/target", { target })).json()) as object;

    expect(await attempt("http://ou.edu.vn/")).toEqual({ error: "bad-target", problem: "not-https" });
    expect(await attempt("https://go.test/khac")).toEqual({ error: "bad-target", problem: "points-at-self" });
    expect(await attempt(OLD)).toEqual({ error: "bad-target", problem: "unchanged" });
    expect(await historyOf(admin)).toEqual([]);
  });

  it("is logged under the Khóa API that made it, and a key cannot touch another Đơn vị's Link", async () => {
    const admin = await withLink();
    const own = await keyOf(admin, 1, "CRM của Tạp chí");
    const other = await keyOf(admin, 2, "NXB");
    const app = h.client();

    expect((await app.put("/api/links/cfp-2027/target", { target: NEW }, { headers: bearer(other) })).status).toBe(403);
    expect((await app.put("/api/links/cfp-2027/target", { target: NEW }, { headers: bearer(own) })).status).toBe(200);
    expect(await historyOf(admin)).toMatchObject([{ by: { kind: "key", name: "CRM của Tạp chí" }, newTarget: NEW }]);
  });

  it("is refused to a stranger, to another Đơn vị's member, and for an unknown Link", async () => {
    const admin = await withLink();
    const publisher = await member(admin, 2, "nxb@ou.edu.vn");

    expect((await h.client().put("/api/links/cfp-2027/target", { target: NEW })).status).toBe(401);
    expect((await publisher.put("/api/links/cfp-2027/target", { target: NEW })).status).toBe(403);
    expect((await publisher.get("/api/links/cfp-2027/history")).status).toBe(403);
    expect((await admin.put("/api/links/khong-co/target", { target: NEW })).status).toBe(404);
    expect((await h.client().get("/cfp-2027")).headers.get("location")).toBe(OLD);
  });

  it("keeps the history from a Khóa API: reading it is not one of the things the API does", async () => {
    const admin = await withLink();
    const key = await keyOf(admin, 1, "CRM");
    expect((await h.client().get("/api/links/cfp-2027/history", { headers: bearer(key) })).status).toBe(403);
  });
});

describe("rewording a Tên link", () => {
  it("changes the name and the note, and nothing else about the Link", async () => {
    const admin = await withLink();
    const editor = await member(admin, 1, "bien-tap@ou.edu.vn");

    const renamed = await editor.put("/api/links/CFP-2027/details", { name: " Poster, bản in A3 ", note: "Sảnh A" });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({
      code: "cfp-2027",
      name: "Poster, bản in A3",
      note: "Sảnh A",
      target: OLD
    });

    // A request without a note keeps it; an empty one clears it.
    await editor.put("/api/links/cfp-2027/details", { name: "Poster mới" });
    const listed = async () =>
      ((await (await editor.get("/api/links?unitId=1")).json()) as { links: object[] }).links[0];
    expect(await listed()).toMatchObject({ code: "cfp-2027", name: "Poster mới", note: "Sảnh A" });
    await editor.put("/api/links/cfp-2027/details", { name: "Poster mới", note: "" });
    expect(await listed()).toMatchObject({ name: "Poster mới", note: "" });

    expect((await h.client().get("/cfp-2027")).headers.get("location")).toBe(OLD);
    expect(await historyOf(editor)).toEqual([]);
  });

  it("requires a name, and keeps both within their lengths", async () => {
    const admin = await withLink();
    const attempt = async (body: object) =>
      (await (await admin.put("/api/links/cfp-2027/details", body)).json()) as object;

    expect(await attempt({ name: "  " })).toEqual({ error: "bad-name" });
    expect(await attempt({ name: "x".repeat(201) })).toEqual({ error: "bad-name" });
    expect(await attempt({ name: "Poster", note: "x".repeat(1001) })).toEqual({ error: "bad-note" });
  });

  it("is for the Đơn vị's own members: not another's, not a Khóa API, not an outside administrator", async () => {
    const admin = await withLink();
    const publisher = await member(admin, 2, "nxb@ou.edu.vn");
    const key = await keyOf(admin, 1, "CRM");
    const body = { name: "Đổi tên" };

    expect((await publisher.put("/api/links/cfp-2027/details", body)).status).toBe(403);
    expect((await h.client().put("/api/links/cfp-2027/details", body, { headers: bearer(key) })).status).toBe(403);
    expect((await h.client().put("/api/links/cfp-2027/details", body)).status).toBe(401);
    await h.db.prepare("DELETE FROM memberships WHERE account_id = 1").run();
    expect((await admin.put("/api/links/cfp-2027/details", body)).status).toBe(403);
    expect((await admin.put("/api/links/khong-co/details", body)).status).toBe(404);
  });
});

describe("switching a Link off and on", () => {
  it("lets a Thành viên switch their Đơn vị's Link off and back on, and records both", async () => {
    const admin = await withLink();
    const editor = await member(admin, 1, "bien-tap@ou.edu.vn");

    const off = await editor.post("/api/links/cfp-2027/disable");
    expect(await off.json()).toMatchObject({ disabledBySystem: false, enabled: false });
    expect(await (await h.client().get("/cfp-2027")).text()).toContain("đã bị tắt");

    h.advance(60_000);
    const on = await editor.post("/api/links/cfp-2027/enable");
    expect(await on.json()).toMatchObject({ enabled: true });
    expect((await h.client().get("/cfp-2027")).status).toBe(302);

    expect(await historyOf(editor)).toMatchObject([
      { by: { email: "bien-tap@ou.edu.vn" }, bySystem: false, enabled: true, kind: "status" },
      { by: { email: "bien-tap@ou.edu.vn" }, bySystem: false, enabled: false, kind: "status" }
    ]);
  });

  it("records nothing when the Link is already in that state", async () => {
    const admin = await withLink();
    const editor = await member(admin, 1, "bien-tap@ou.edu.vn");
    await editor.post("/api/links/cfp-2027/enable");
    await editor.post("/api/links/cfp-2027/disable");
    await editor.post("/api/links/cfp-2027/disable");
    expect(await historyOf(editor)).toHaveLength(1);
  });

  it("leaves a Link a Quản trị hệ thống switched off for them alone to switch back on", async () => {
    const admin = await withLink();
    const editor = await member(admin, 1, "bien-tap@ou.edu.vn");
    const key = await keyOf(admin, 1, "CRM");

    expect(await (await admin.post("/api/links/cfp-2027/disable")).json()).toMatchObject({ disabledBySystem: true });

    const refused = await editor.post("/api/links/cfp-2027/enable");
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "disabled-by-system" });
    expect((await h.client().post("/api/links/cfp-2027/enable", undefined, { headers: bearer(key) })).status).toBe(403);
    // Switching it off again as a member must not hand it back to the Đơn vị either.
    expect(await (await editor.post("/api/links/cfp-2027/disable")).json()).toMatchObject({ disabledBySystem: true });
    expect((await editor.post("/api/links/cfp-2027/enable")).status).toBe(403);

    expect((await admin.post("/api/links/cfp-2027/enable")).status).toBe(200);
    expect((await h.client().get("/cfp-2027")).status).toBe(302);
  });

  it("lets a Quản trị hệ thống take over a Link its Đơn vị had already switched off", async () => {
    const admin = await withLink();
    const editor = await member(admin, 1, "bien-tap@ou.edu.vn");
    await editor.post("/api/links/cfp-2027/disable");
    await admin.post("/api/links/cfp-2027/disable");
    expect((await editor.post("/api/links/cfp-2027/enable")).status).toBe(403);
  });

  it("lets a Quản trị hệ thống switch off a Link of a Đơn vị they do not belong to - and nothing more", async () => {
    const admin = await withLink();
    await h.db.prepare("DELETE FROM memberships WHERE unit_id = 1").run();

    expect((await admin.post("/api/links/cfp-2027/disable")).status).toBe(200);
    expect((await admin.put("/api/links/cfp-2027/target", { target: NEW })).status).toBe(403);
    expect((await admin.get("/api/links/cfp-2027/history")).status).toBe(403);
  });

  it("is refused to another Đơn vị's member and its Khóa API", async () => {
    const admin = await withLink();
    const publisher = await member(admin, 2, "nxb@ou.edu.vn");
    const key = await keyOf(admin, 2, "NXB");

    expect((await publisher.post("/api/links/cfp-2027/disable")).status).toBe(403);
    expect((await h.client().post("/api/links/cfp-2027/disable", undefined, { headers: bearer(key) })).status).toBe(
      403
    );
    expect((await h.client().get("/cfp-2027")).status).toBe(302);
  });
});

describe("reading Lượt mở", () => {
  it("answers per Vietnamese day with the total, to a member and to the Đơn vị's key", async () => {
    const admin = await withLink();
    const key = await keyOf(admin, 1, "CRM");
    const visitor = h.client();
    await visitor.get("/cfp-2027");
    await visitor.get("/cfp-2027");
    h.advance(15 * 60 * 60 * 1000);
    await visitor.get("/cfp-2027");

    const expected = {
      days: [
        { count: 2, day: "2027-03-01" },
        { count: 1, day: "2027-03-02" }
      ],
      total: 3
    };
    expect(await (await admin.get("/api/links/cfp-2027/visits")).json()).toEqual(expected);
    expect(await (await h.client().get("/api/links/cfp-2027/visits", { headers: bearer(key) })).json()).toEqual(
      expected
    );
  });

  it("shows each Link's total in the Đơn vị's list", async () => {
    const admin = await withLink();
    await admin.post("/api/links/cfp-2027/disable");
    await admin.post("/api/links", { code: "chua-mo", name: "Chưa mở", target: OLD, unitId: 1 });
    await h.db
      .prepare("INSERT INTO daily_visits (link_id, day, count) VALUES (1, '2027-02-01', 4), (1, '2027-02-02', 5)")
      .run();

    const { links } = (await (await admin.get("/api/links?unitId=1")).json()) as { links: object[] };
    expect(links).toMatchObject([
      { code: "chua-mo", visits: 0 },
      { code: "cfp-2027", disabledBySystem: true, enabled: false, visits: 9 }
    ]);
  });

  it("is refused to another Đơn vị", async () => {
    const admin = await withLink();
    const publisher = await member(admin, 2, "nxb@ou.edu.vn");
    expect((await publisher.get("/api/links/cfp-2027/visits")).status).toBe(403);
  });
});
