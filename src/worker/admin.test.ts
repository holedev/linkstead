import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, FIRST_UNIT, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const TARGET = "https://example.org/tuyen-sinh";
const PASSWORD = "mat-khau-du-dai";

type Browser = ReturnType<typeof h.client>;

/** Uses a one-time link and signs in. */
const signIn = async (email: string, setupUrl: string) => {
  const browser = h.client();
  await browser.setup(tokenOf(setupUrl), email, PASSWORD);
  await browser.login(email, PASSWORD);
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

describe("Unit, as a System Administrator", () => {
  it("creates a Unit with its first Unit Manager, who can then work in it", async () => {
    const admin = await h.signedInAdmin();
    const created = await admin.post("/api/admin/units", { managerEmail: "Khoa.CNTT@example.org", name: "Khoa CNTT" });
    const body = (await created.json()) as { id: number; setupUrl: string };

    expect(created.status).toBe(201);
    expect(body).toMatchObject({ id: 3, managerEmail: "khoa.cntt@example.org", name: "Khoa CNTT" });

    const manager = await signIn("khoa.cntt@example.org", body.setupUrl);
    expect((await manager.post("/api/links", { name: "Thử", target: TARGET, unitId: 3 })).status).toBe(201);
    expect((await manager.post("/api/units/3/members", { email: "gv@example.org" })).status).toBe(201);
  });

  it("refuses a name already used and a manager outside the Organization", async () => {
    const admin = await h.signedInAdmin();
    const attempt = async (body: object) => (await (await admin.post("/api/admin/units", body)).json()) as object;

    expect(await attempt({ managerEmail: "a@example.org", name: "Accounting" })).toEqual({ error: "unit-name-taken" });
    expect(await attempt({ managerEmail: "a@gmail.com", name: "Khoa Luật" })).toEqual({
      error: "email-not-allowed"
    });
    expect(await attempt({ managerEmail: "a@example.org", name: " " })).toEqual({ error: "bad-name" });
  });

  it("lists each Unit with its Links counted and its managers named", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "mot-link", name: "Một", target: TARGET, unitId: 2 });

    expect(await (await admin.get("/api/admin/units")).json()).toEqual({
      units: [
        { id: 1, linkCount: 0, managers: ["admin@example.org"], name: "Journal & Press" },
        { id: 2, linkCount: 1, managers: ["admin@example.org"], name: "Accounting" }
      ]
    });
  });

  it("will not dissolve a Unit that still owns a Link", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "con-link", name: "Còn", target: TARGET, unitId: 2 });

    const refused = await admin.delete("/api/admin/units/2");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "unit-owns-links" });
    expect(await codesOf(admin, 2)).toEqual(["con-link"]);
  });

  it("dissolves an empty Unit: its members leave and its API Key stops working", async () => {
    const admin = await h.signedInAdmin();
    const publisher = await member(admin, 2, "nxb@example.org");
    const { key } = (await (await admin.post("/api/units/2/keys", { name: "NXB" })).json()) as { key: string };

    expect((await admin.delete("/api/admin/units/2")).status).toBe(204);

    expect(((await (await publisher.get("/api/auth/me")).json()) as { units: unknown[] }).units).toEqual([]);
    expect((await h.client().get("/api/links", { headers: bearer(key) })).status).toBe(401);
    expect((await admin.post("/api/links", { name: "Thử", target: TARGET, unitId: 2 })).status).toBe(403);
    expect((await admin.delete("/api/admin/units/2")).status).toBe(404);
    expect(((await (await admin.get("/api/admin/units")).json()) as { units: unknown[] }).units).toHaveLength(1);
  });

  it("is closed to a Unit Manager, to an API Key and to a stranger", async () => {
    const admin = await h.signedInAdmin();
    const manager = await member(admin, 1, "quan-ly@example.org", "manager");
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };

    expect((await manager.get("/api/admin/units")).status).toBe(403);
    expect((await manager.post("/api/admin/reserved-codes", { code: "tuyensinh" })).status).toBe(403);
    expect((await manager.delete("/api/admin/units/2")).status).toBe(403);
    expect((await h.client().get("/api/admin/units", { headers: bearer(key) })).status).toBe(401);
    expect((await h.client().get("/api/admin/units")).status).toBe(401);
  });
});

describe("a second System Administrator", () => {
  it("is named by an existing one, sets a password, and can then do what an administrator does", async () => {
    const admin = await h.signedInAdmin();
    const granted = await admin.post("/api/admin/admins", { email: "Phong.CNTT@example.org" });
    const body = (await granted.json()) as { email: string; setupUrl: string };

    expect(granted.status).toBe(201);
    expect(body.email).toBe("phong.cntt@example.org");
    expect(await (await admin.get("/api/admin/admins")).json()).toEqual({
      admins: [
        { email: "admin@example.org", hasPassword: true },
        { email: "phong.cntt@example.org", hasPassword: false }
      ]
    });

    const second = await signIn("phong.cntt@example.org", body.setupUrl);
    const me = (await (await second.get("/api/auth/me")).json()) as { isSystemAdmin: boolean; units: unknown[] };
    // The role is not membership: they are in no Unit.
    expect(me).toMatchObject({ isSystemAdmin: true, units: [] });
    expect((await second.post("/api/admin/reserved-codes", { code: "tuyensinh" })).status).toBe(201);
    expect((await second.post("/api/links", { name: "Thử", target: TARGET, unitId: 1 })).status).toBe(403);
  });

  it("can be someone who already has an account, with no new link to pass on", async () => {
    const admin = await h.signedInAdmin();
    const editor = await member(admin, 1, "bien-tap@example.org");
    expect((await editor.get("/api/admin/units")).status).toBe(403);

    const granted = await admin.post("/api/admin/admins", { email: "bien-tap@example.org" });
    expect(await granted.json()).toEqual({ email: "bien-tap@example.org", setupUrl: null });
    // No signing in again: the role is read on every request.
    expect((await editor.get("/api/admin/units")).status).toBe(200);

    const again = await admin.post("/api/admin/admins", { email: "bien-tap@example.org" });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "already-admin" });
    expect((await admin.post("/api/admin/admins", { email: "ai-do@gmail.com" })).status).toBe(422);
  });

  it("loses the role at once when it is taken away, and keeps the account and its Unit", async () => {
    const admin = await h.signedInAdmin();
    const editor = await member(admin, 1, "bien-tap@example.org");
    await admin.post("/api/admin/admins", { email: "bien-tap@example.org" });

    expect((await admin.delete("/api/admin/admins/Bien-Tap@example.org")).status).toBe(204);
    expect((await editor.get("/api/admin/units")).status).toBe(403);
    expect((await editor.get("/api/links?unitId=1")).status).toBe(200);
    expect((await admin.delete("/api/admin/admins/bien-tap@example.org")).status).toBe(404);
    expect((await admin.delete("/api/admin/admins/khong-co@example.org")).status).toBe(404);
  });

  it("never leaves the system without one, so the first-administrator door stays shut", async () => {
    const admin = await h.signedInAdmin();
    const last = await admin.delete("/api/admin/admins/admin@example.org");
    expect(last.status).toBe(409);
    expect(await last.json()).toEqual({ error: "last-admin" });

    // With a second one, the first may step down - and then the second is the last.
    const editor = await member(admin, 1, "bien-tap@example.org");
    await admin.post("/api/admin/admins", { email: "bien-tap@example.org" });
    expect((await admin.delete("/api/admin/admins/admin@example.org")).status).toBe(204);
    expect((await admin.get("/api/admin/admins")).status).toBe(403);
    expect((await editor.delete("/api/admin/admins/bien-tap@example.org")).status).toBe(409);

    const reopened = await h
      .client()
      .post("/api/bootstrap", { email: "ke-la@example.org" }, { headers: bearer("bootstrap-secret-for-tests") });
    expect(reopened.status).toBe(409);
  });

  it("is closed to a Unit Manager, to an API Key and to a stranger", async () => {
    const admin = await h.signedInAdmin();
    const manager = await member(admin, 1, "quan-ly@example.org", "manager");
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };
    const body = { email: "quan-ly@example.org" };

    expect((await manager.post("/api/admin/admins", body)).status).toBe(403);
    expect((await manager.get("/api/admin/admins")).status).toBe(403);
    expect((await manager.delete("/api/admin/admins/admin@example.org")).status).toBe(403);
    expect((await h.client().post("/api/admin/admins", body, { headers: bearer(key) })).status).toBe(401);
    expect((await h.client().post("/api/admin/admins", body)).status).toBe(401);
  });
});

describe("Reserved Code", () => {
  it("holds a code back from everyone, until a System Administrator hands it out", async () => {
    const admin = await h.signedInAdmin();
    const manager = await member(admin, 2, "nxb@example.org", "manager");
    await h.db.prepare("DELETE FROM memberships WHERE account_id = 1").run();

    expect((await admin.post("/api/admin/reserved-codes", { code: "TuyenSinh", note: "Phòng Đào tạo" })).status).toBe(
      201
    );
    expect(await (await admin.get("/api/admin/reserved-codes")).json()).toMatchObject({
      codes: [{ code: "tuyensinh", note: "Phòng Đào tạo" }]
    });
    const taken = await manager.post("/api/links", { code: "tuyensinh", name: "Thử", target: TARGET, unitId: 2 });
    expect(await taken.json()).toEqual({ error: "bad-code", problem: "reserved" });

    // Handed out to a Unit the administrator does not belong to.
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

describe("a Link of any Unit", () => {
  it("is found by its code with the Unit that owns it", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 2 });
    await h.db.prepare("DELETE FROM memberships WHERE account_id = 1").run();

    expect(await (await admin.get("/api/admin/links/CFP-2027")).json()).toMatchObject({
      code: "cfp-2027",
      history: [],
      unitId: 2,
      unitName: "Accounting"
    });
    expect((await admin.get("/api/admin/links/khong-co")).status).toBe(404);
  });

  it("moves to another Unit with its address, Target and Visits unchanged, and says so in its history", async () => {
    const admin = await h.signedInAdmin();
    const editor = await member(admin, 1, "bien-tap@example.org");
    const publisher = await member(admin, 2, "nxb@example.org");
    await editor.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
    await h.client().get("/cfp-2027");

    const moved = await admin.post("/api/admin/links/cfp-2027/move", { unitId: 2 });
    expect(await moved.json()).toMatchObject({ code: "cfp-2027", unitId: 2, unitName: "Accounting", visits: 1 });

    expect((await h.client().get("/cfp-2027")).headers.get("location")).toBe(TARGET);
    expect(await codesOf(editor, 1)).toEqual([]);
    expect(await codesOf(publisher, 2)).toEqual(["cfp-2027"]);
    expect((await editor.put("/api/links/cfp-2027/target", { target: "https://example.org/khac" })).status).toBe(403);
    expect(await (await publisher.get("/api/links/cfp-2027/history")).json()).toEqual({
      history: [
        {
          at: "2027-03-01T03:00:00.000Z",
          by: { email: "admin@example.org", kind: "account" },
          kind: "unit",
          newUnitName: "Accounting",
          oldUnitName: "Journal & Press"
        }
      ]
    });
  });

  it("does not move to the Unit it is in, to an unknown one, or to a dissolved one", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
    await admin.delete("/api/admin/units/2");
    const attempt = async (unitId: number) =>
      (await (await admin.post("/api/admin/links/cfp-2027/move", { unitId })).json()) as object;

    expect(await attempt(1)).toEqual({ error: "same-unit" });
    expect(await attempt(2)).toEqual({ error: "unknown-unit" });
    expect(await attempt(9)).toEqual({ error: "unknown-unit" });
  });

  it("lets a Unit be dissolved once its last Link has moved away", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 2 });
    await admin.post("/api/admin/links/cfp-2027/move", { unitId: 1 });

    expect((await admin.delete("/api/admin/units/2")).status).toBe(204);
    expect((await h.client().get("/cfp-2027")).status).toBe(302);
    expect(await (await admin.get("/api/links/cfp-2027/history")).json()).toMatchObject({
      history: [{ newUnitName: "Journal & Press", oldUnitName: "Accounting" }]
    });
  });
});

describe("merging one Unit into another", () => {
  it("moves its Links, API Key and members across, then dissolves it", async () => {
    const admin = await h.signedInAdmin();
    const accountant = await member(admin, 2, "ke-toan@example.org");
    await admin.post("/api/units/1/members", { email: "ca-hai@example.org" });
    await admin.post("/api/units/2/members", { email: "ca-hai@example.org", role: "manager" });
    const { key } = (await (await admin.post("/api/units/2/keys", { name: "Kế toán" })).json()) as { key: string };
    await admin.post("/api/links", { code: "cua-tap-chi", name: "Tạp chí", target: TARGET, unitId: 1 });
    await admin.post("/api/links", { code: "cua-ke-toan", name: "Kế toán", target: TARGET, unitId: 2 });

    const merged = await admin.post("/api/admin/units/2/merge", { intoUnitId: 1 });
    expect(await merged.json()).toEqual({
      from: "Accounting",
      into: { id: 1, name: FIRST_UNIT },
      moved: { keys: 1, links: 1, members: 3 }
    });

    // One Unit left, holding both Links; every address still opens.
    expect(((await (await admin.get("/api/admin/units")).json()) as { units: { id: number }[] }).units).toMatchObject([
      { id: 1, linkCount: 2 }
    ]);
    expect(await codesOf(admin, 1)).toEqual(["cua-ke-toan", "cua-tap-chi"]);
    expect((await h.client().get("/cua-ke-toan")).headers.get("location")).toBe(TARGET);
    expect(await (await admin.get("/api/links/cua-ke-toan/history")).json()).toMatchObject({
      history: [
        {
          by: { email: "admin@example.org", kind: "account" },
          kind: "unit",
          newUnitName: FIRST_UNIT,
          oldUnitName: "Accounting"
        }
      ]
    });

    // The key works on, now for the Unit it was merged into; members of either belong to it,
    // keeping the higher of two roles.
    const viaKey = (await (await h.client().get("/api/links", { headers: bearer(key) })).json()) as {
      links: object[];
    };
    expect(viaKey.links).toHaveLength(2);
    expect(await (await admin.get("/api/units/1/members")).json()).toMatchObject({
      members: [
        { email: "admin@example.org", role: "manager" },
        { email: "ca-hai@example.org", role: "manager" },
        { email: "ke-toan@example.org", role: "member" }
      ]
    });
    expect((await accountant.get("/api/links?unitId=1")).status).toBe(200);
    expect((await accountant.get("/api/links?unitId=2")).status).toBe(403);
  });

  it("refuses the same Unit, an unknown or dissolved one, and anyone but a System Administrator", async () => {
    const admin = await h.signedInAdmin();
    const manager = await member(admin, 2, "quan-ly@example.org", "manager");
    const merge = async (from: number, intoUnitId: number) =>
      (await admin.post(`/api/admin/units/${from}/merge`, { intoUnitId })).status;

    expect(await merge(2, 2)).toBe(422);
    expect(await merge(2, 9)).toBe(404);
    expect(await merge(9, 1)).toBe(404);
    expect((await manager.post("/api/admin/units/2/merge", { intoUnitId: 1 })).status).toBe(403);

    expect(await merge(2, 1)).toBe(200);
    expect(await merge(1, 2)).toBe(404);
    expect(await merge(2, 1)).toBe(404);
  });
});

describe("changing who belongs to a Unit", () => {
  it("is open to a System Administrator for any Unit, one they do not belong to included", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/admin/units", { managerEmail: "truong-khoa@example.org", name: "Khoa Luật" });
    const roles = async () =>
      ((await (await admin.get("/api/units/3/members")).json()) as { members: { email: string; role: string }[] })
        .members;
    expect(await roles()).toMatchObject([{ email: "truong-khoa@example.org", role: "manager" }]);

    const added = await admin.post("/api/units/3/members", { email: "giang-vien@example.org" });
    expect(added.status).toBe(201);
    expect(((await added.json()) as { setupUrl: string | null }).setupUrl).toContain("/app/setup?token=");
    expect((await admin.put("/api/units/3/members/giang-vien@example.org", { role: "manager" })).status).toBe(204);
    expect((await admin.delete("/api/units/3/members/truong-khoa@example.org")).status).toBe(204);
    expect((await admin.post("/api/units/3/members/password-setup", { email: "giang-vien@example.org" })).status).toBe(
      201
    );
    // Still never without a Unit Manager, whoever asks.
    expect((await admin.delete("/api/units/3/members/giang-vien@example.org")).status).toBe(409);
    expect(await roles()).toEqual([{ email: "giang-vien@example.org", hasPassword: false, role: "manager" }]);

    // Managing a Unit's members does not make the administrator one of them.
    const me = (await (await admin.get("/api/auth/me")).json()) as { units: { unitId: number }[] };
    expect(me.units.map((unit) => unit.unitId)).not.toContain(3);
  });

  it("removes a Member, who keeps their Account but loses the Unit's Links", async () => {
    const admin = await h.signedInAdmin();
    const editor = await member(admin, 1, "bien-tap@example.org");

    expect((await admin.delete("/api/units/1/members/Bien-Tap@example.org")).status).toBe(204);
    expect((await editor.get("/api/links?unitId=1")).status).toBe(403);
    expect(((await (await editor.get("/api/auth/me")).json()) as { email: string }).email).toBe("bien-tap@example.org");
    expect((await admin.delete("/api/units/1/members/bien-tap@example.org")).status).toBe(404);
  });

  it("promotes and demotes, but never leaves a Unit without a Unit Manager", async () => {
    const admin = await h.signedInAdmin();
    const editor = await member(admin, 1, "bien-tap@example.org");

    const last = await admin.put("/api/units/1/members/admin@example.org", { role: "member" });
    expect(last.status).toBe(409);
    expect(await last.json()).toEqual({ error: "last-manager" });
    expect((await admin.delete("/api/units/1/members/admin@example.org")).status).toBe(409);

    expect((await editor.post("/api/units/1/keys", { name: "Thử" })).status).toBe(403);
    expect((await admin.put("/api/units/1/members/bien-tap@example.org", { role: "manager" })).status).toBe(204);
    expect((await editor.post("/api/units/1/keys", { name: "Thử" })).status).toBe(201);

    // With two managers, either may now step down - here the newer removes the first.
    expect((await editor.delete("/api/units/1/members/admin@example.org")).status).toBe(204);
    expect((await editor.put("/api/units/1/members/bien-tap@example.org", { role: "member" })).status).toBe(409);
  });

  it("is a Unit Manager's to do, not a Member's", async () => {
    const admin = await h.signedInAdmin();
    const editor = await member(admin, 1, "bien-tap@example.org");
    await member(admin, 1, "khac@example.org");

    expect((await editor.delete("/api/units/1/members/khac@example.org")).status).toBe(403);
    expect((await editor.put("/api/units/1/members/khac@example.org", { role: "manager" })).status).toBe(403);
    expect((await admin.put("/api/units/1/members/khac@example.org", { role: "chu" })).status).toBe(422);
  });
});

describe("the rate limit of an API Key", () => {
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
