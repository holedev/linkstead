import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const TARGET = "https://ou.edu.vn/tuyen-sinh";
const PASSWORD = "mat-khau-du-dai";

type Browser = ReturnType<typeof h.client>;

/** Uses a one-time link and signs in. */
const signIn = async (email: string, setupUrl: string) => {
  const browser = h.client();
  await browser.post("/api/auth/setup", { password: PASSWORD, token: tokenOf(setupUrl) });
  await browser.post("/api/auth/login", { email, password: PASSWORD });
  return browser;
};

const member = async (admin: Browser, unitId: number, email: string, role = "member") => {
  const added = await admin.post(`/api/units/${unitId}/members`, { email, role });
  return signIn(email, ((await added.json()) as { setupUrl: string }).setupUrl);
};

const codesOf = async (browser: Browser, unitId: number) =>
  ((await (await browser.get(`/api/links?unitId=${unitId}`)).json()) as { links: { code: string }[] }).links.map(
    (link) => link.code
  );

describe("Đơn vị, as a Quản trị hệ thống", () => {
  it("creates a Đơn vị with its first Quản lý đơn vị, who can then work in it", async () => {
    const admin = await h.signedInAdmin();
    const created = await admin.post("/api/admin/units", { managerEmail: "Khoa.CNTT@ou.edu.vn", name: "Khoa CNTT" });
    const body = (await created.json()) as { id: number; setupUrl: string };

    expect(created.status).toBe(201);
    expect(body).toMatchObject({ id: 3, managerEmail: "khoa.cntt@ou.edu.vn", name: "Khoa CNTT" });

    const manager = await signIn("khoa.cntt@ou.edu.vn", body.setupUrl);
    expect((await manager.post("/api/links", { name: "Thử", target: TARGET, unitId: 3 })).status).toBe(201);
    expect((await manager.post("/api/units/3/members", { email: "gv@ou.edu.vn" })).status).toBe(201);
  });

  it("refuses a name already used and a manager outside the university", async () => {
    const admin = await h.signedInAdmin();
    const attempt = async (body: object) => (await (await admin.post("/api/admin/units", body)).json()) as object;

    expect(await attempt({ managerEmail: "a@ou.edu.vn", name: "Nhà xuất bản" })).toEqual({ error: "unit-name-taken" });
    expect(await attempt({ managerEmail: "a@gmail.com", name: "Khoa Luật" })).toEqual({
      error: "not-university-email"
    });
    expect(await attempt({ managerEmail: "a@ou.edu.vn", name: " " })).toEqual({ error: "bad-name" });
  });

  it("lists each Đơn vị with its Links counted and its managers named", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "mot-link", name: "Một", target: TARGET, unitId: 2 });

    expect(await (await admin.get("/api/admin/units")).json()).toEqual({
      units: [
        { id: 1, linkCount: 0, managers: ["admin@ou.edu.vn"], name: "Tạp chí Khoa học" },
        { id: 2, linkCount: 1, managers: ["admin@ou.edu.vn"], name: "Nhà xuất bản" }
      ]
    });
  });

  it("will not dissolve a Đơn vị that still owns a Link", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "con-link", name: "Còn", target: TARGET, unitId: 2 });

    const refused = await admin.delete("/api/admin/units/2");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "unit-owns-links" });
    expect(await codesOf(admin, 2)).toEqual(["con-link"]);
  });

  it("dissolves an empty Đơn vị: its members leave and its Khóa API stops working", async () => {
    const admin = await h.signedInAdmin();
    const publisher = await member(admin, 2, "nxb@ou.edu.vn");
    const { key } = (await (await admin.post("/api/units/2/keys", { name: "NXB" })).json()) as { key: string };

    expect((await admin.delete("/api/admin/units/2")).status).toBe(204);

    expect(((await (await publisher.get("/api/auth/me")).json()) as { units: unknown[] }).units).toEqual([]);
    expect((await h.client().get("/api/links", { headers: bearer(key) })).status).toBe(401);
    expect((await admin.post("/api/links", { name: "Thử", target: TARGET, unitId: 2 })).status).toBe(403);
    expect((await admin.delete("/api/admin/units/2")).status).toBe(404);
    expect(((await (await admin.get("/api/admin/units")).json()) as { units: unknown[] }).units).toHaveLength(1);
  });

  it("is closed to a Quản lý đơn vị, to a Khóa API and to a stranger", async () => {
    const admin = await h.signedInAdmin();
    const manager = await member(admin, 1, "quan-ly@ou.edu.vn", "manager");
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };

    expect((await manager.get("/api/admin/units")).status).toBe(403);
    expect((await manager.post("/api/admin/reserved-codes", { code: "tuyensinh" })).status).toBe(403);
    expect((await manager.delete("/api/admin/units/2")).status).toBe(403);
    expect((await h.client().get("/api/admin/units", { headers: bearer(key) })).status).toBe(401);
    expect((await h.client().get("/api/admin/units")).status).toBe(401);
  });
});

describe("Mã dành riêng", () => {
  it("holds a code back from everyone, until a Quản trị hệ thống hands it out", async () => {
    const admin = await h.signedInAdmin();
    const manager = await member(admin, 2, "nxb@ou.edu.vn", "manager");
    await h.db.prepare("DELETE FROM memberships WHERE account_id = 1").run();

    expect((await admin.post("/api/admin/reserved-codes", { code: "TuyenSinh", note: "Phòng Đào tạo" })).status).toBe(
      201
    );
    expect(await (await admin.get("/api/admin/reserved-codes")).json()).toMatchObject({
      codes: [{ code: "tuyensinh", note: "Phòng Đào tạo" }]
    });
    const taken = await manager.post("/api/links", { code: "tuyensinh", name: "Thử", target: TARGET, unitId: 2 });
    expect(await taken.json()).toEqual({ error: "bad-code", problem: "reserved" });

    // Handed out to a Đơn vị the administrator does not belong to.
    const handed = await admin.post("/api/admin/links", {
      code: "tuyensinh",
      name: "Trang tuyển sinh",
      target: TARGET,
      unitId: 2
    });
    expect(handed.status).toBe(201);
    expect(await codesOf(manager, 2)).toEqual(["tuyensinh"]);
    expect((await h.client().get("/tuyensinh")).headers.get("location")).toBe(TARGET);
  });

  it("never hands out one of the system's own paths", async () => {
    const admin = await h.signedInAdmin();
    const attempt = await admin.post("/api/admin/links", { code: "api", name: "Thử", target: TARGET, unitId: 1 });
    expect(await attempt.json()).toEqual({ error: "bad-code", problem: "reserved" });
  });

  it("refuses to reserve a malformed code, a system path, a Link's code or one reserved already", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "da-dung", name: "Một", target: TARGET, unitId: 1 });
    await admin.post("/api/admin/reserved-codes", { code: "khoa-luat" });
    const attempt = async (code: string) =>
      (await (await admin.post("/api/admin/reserved-codes", { code })).json()) as object;

    expect(await attempt("ab")).toEqual({ error: "bad-code", problem: "too-short" });
    expect(await attempt("app")).toEqual({ error: "bad-code", problem: "reserved" });
    expect(await attempt("da-dung")).toEqual({ error: "code-taken" });
    expect(await attempt("khoa-luat")).toEqual({ error: "already-reserved" });
  });

  it("frees a code again", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/admin/reserved-codes", { code: "khoa-luat" });

    expect((await admin.delete("/api/admin/reserved-codes/Khoa-Luat")).status).toBe(204);
    expect((await admin.delete("/api/admin/reserved-codes/khoa-luat")).status).toBe(404);
    expect((await admin.post("/api/links", { code: "khoa-luat", name: "Một", target: TARGET, unitId: 1 })).status).toBe(
      201
    );
  });
});

describe("a Link of any Đơn vị", () => {
  it("is found by its code with the Đơn vị that owns it", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 2 });
    await h.db.prepare("DELETE FROM memberships WHERE account_id = 1").run();

    expect(await (await admin.get("/api/admin/links/CFP-2027")).json()).toMatchObject({
      code: "cfp-2027",
      history: [],
      unitId: 2,
      unitName: "Nhà xuất bản"
    });
    expect((await admin.get("/api/admin/links/khong-co")).status).toBe(404);
  });

  it("moves to another Đơn vị with its address, Đích and Lượt mở unchanged, and says so in its history", async () => {
    const admin = await h.signedInAdmin();
    const editor = await member(admin, 1, "bien-tap@ou.edu.vn");
    const publisher = await member(admin, 2, "nxb@ou.edu.vn");
    await editor.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
    await h.client().get("/cfp-2027");

    const moved = await admin.post("/api/admin/links/cfp-2027/move", { unitId: 2 });
    expect(await moved.json()).toMatchObject({ code: "cfp-2027", unitId: 2, unitName: "Nhà xuất bản", visits: 1 });

    expect((await h.client().get("/cfp-2027")).headers.get("location")).toBe(TARGET);
    expect(await codesOf(editor, 1)).toEqual([]);
    expect(await codesOf(publisher, 2)).toEqual(["cfp-2027"]);
    expect((await editor.put("/api/links/cfp-2027/target", { target: "https://ou.edu.vn/khac" })).status).toBe(403);
    expect(await (await publisher.get("/api/links/cfp-2027/history")).json()).toEqual({
      history: [
        {
          at: "2027-03-01T03:00:00.000Z",
          by: { email: "admin@ou.edu.vn", kind: "account" },
          kind: "unit",
          newUnitName: "Nhà xuất bản",
          oldUnitName: "Tạp chí Khoa học"
        }
      ]
    });
  });

  it("does not move to the Đơn vị it is in, to an unknown one, or to a dissolved one", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
    await admin.delete("/api/admin/units/2");
    const attempt = async (unitId: number) =>
      (await (await admin.post("/api/admin/links/cfp-2027/move", { unitId })).json()) as object;

    expect(await attempt(1)).toEqual({ error: "same-unit" });
    expect(await attempt(2)).toEqual({ error: "unknown-unit" });
    expect(await attempt(9)).toEqual({ error: "unknown-unit" });
  });

  it("lets a Đơn vị be dissolved once its last Link has moved away", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 2 });
    await admin.post("/api/admin/links/cfp-2027/move", { unitId: 1 });

    expect((await admin.delete("/api/admin/units/2")).status).toBe(204);
    expect((await h.client().get("/cfp-2027")).status).toBe(302);
    expect(await (await admin.get("/api/links/cfp-2027/history")).json()).toMatchObject({
      history: [{ newUnitName: "Tạp chí Khoa học", oldUnitName: "Nhà xuất bản" }]
    });
  });
});

describe("changing who belongs to a Đơn vị", () => {
  it("removes a Thành viên, who keeps their Tài khoản but loses the Đơn vị's Links", async () => {
    const admin = await h.signedInAdmin();
    const editor = await member(admin, 1, "bien-tap@ou.edu.vn");

    expect((await admin.delete("/api/units/1/members/Bien-Tap@ou.edu.vn")).status).toBe(204);
    expect((await editor.get("/api/links?unitId=1")).status).toBe(403);
    expect(((await (await editor.get("/api/auth/me")).json()) as { email: string }).email).toBe("bien-tap@ou.edu.vn");
    expect((await admin.delete("/api/units/1/members/bien-tap@ou.edu.vn")).status).toBe(404);
  });

  it("promotes and demotes, but never leaves a Đơn vị without a Quản lý đơn vị", async () => {
    const admin = await h.signedInAdmin();
    const editor = await member(admin, 1, "bien-tap@ou.edu.vn");

    const last = await admin.put("/api/units/1/members/admin@ou.edu.vn", { role: "member" });
    expect(last.status).toBe(409);
    expect(await last.json()).toEqual({ error: "last-manager" });
    expect((await admin.delete("/api/units/1/members/admin@ou.edu.vn")).status).toBe(409);

    expect((await editor.post("/api/units/1/keys", { name: "Thử" })).status).toBe(403);
    expect((await admin.put("/api/units/1/members/bien-tap@ou.edu.vn", { role: "manager" })).status).toBe(204);
    expect((await editor.post("/api/units/1/keys", { name: "Thử" })).status).toBe(201);

    // With two managers, either may now step down - here the newer removes the first.
    expect((await editor.delete("/api/units/1/members/admin@ou.edu.vn")).status).toBe(204);
    expect((await editor.put("/api/units/1/members/bien-tap@ou.edu.vn", { role: "member" })).status).toBe(409);
  });

  it("is a Quản lý đơn vị's to do, not a Thành viên's", async () => {
    const admin = await h.signedInAdmin();
    const editor = await member(admin, 1, "bien-tap@ou.edu.vn");
    await member(admin, 1, "khac@ou.edu.vn");

    expect((await editor.delete("/api/units/1/members/khac@ou.edu.vn")).status).toBe(403);
    expect((await editor.put("/api/units/1/members/khac@ou.edu.vn", { role: "manager" })).status).toBe(403);
    expect((await admin.put("/api/units/1/members/khac@ou.edu.vn", { role: "chu" })).status).toBe(422);
  });
});

describe("the rate limit of a Khóa API", () => {
  it("refuses a key past its calls for the minute, and lets it through again the next minute", async () => {
    const admin = await h.signedInAdmin();
    const { id, key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as {
      id: number;
      key: string;
    };
    const { key: other } = (await (await admin.post("/api/units/2/keys", { name: "NXB" })).json()) as { key: string };
    const minute = Math.floor(new Date("2027-03-01T03:00:00Z").getTime() / 60_000);
    await h.db
      .prepare("INSERT INTO api_key_usage (api_key_id, minute, count) VALUES (?, ?, 119)")
      .bind(id, minute)
      .run();
    const app = h.client();

    expect((await app.get("/api/links", { headers: bearer(key) })).status).toBe(200);
    const refused = await app.get("/api/links", { headers: bearer(key) });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: "rate-limited" });
    expect(refused.headers.get("retry-after")).toBe("60");

    // Another key, and a person, are not held back by it.
    expect((await app.get("/api/links", { headers: bearer(other) })).status).toBe(200);
    expect((await admin.get("/api/links?unitId=1")).status).toBe(200);

    h.advance(60_000);
    expect((await app.get("/api/links", { headers: bearer(key) })).status).toBe(200);
    const rows = await h.db.prepare("SELECT minute, count FROM api_key_usage WHERE api_key_id = ?").bind(id).all();
    expect(rows.results).toEqual([{ count: 1, minute: minute + 1 }]);
  });
});
