import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const PASSWORD = "mat-khau-du-dai";

/** Adds a member to a Đơn vị and signs them in. */
const join = async (
  admin: Awaited<ReturnType<typeof h.signedInAdmin>>,
  email: string,
  unitId: number,
  role?: string
) => {
  const added = await admin.post(`/api/units/${unitId}/members`, { email, role });
  const { setupUrl } = (await added.json()) as { setupUrl: string };
  const browser = h.client();
  await browser.setup(tokenOf(setupUrl), email, PASSWORD);
  await browser.login(email, PASSWORD);
  return browser;
};

describe("adding a Thành viên", () => {
  it("creates the Tài khoản and returns a one-time link to pass on", async () => {
    const admin = await h.signedInAdmin();
    const added = await admin.post("/api/units/1/members", { email: "Dong.Nghiep@ou.edu.vn" });
    const body = (await added.json()) as { email: string; role: string; setupUrl: string };

    expect(added.status).toBe(201);
    expect(body).toMatchObject({ email: "dong.nghiep@ou.edu.vn", role: "member" });

    const member = h.client();
    await member.setup(tokenOf(body.setupUrl), "dong.nghiep@ou.edu.vn", PASSWORD);
    const login = await member.login("dong.nghiep@ou.edu.vn", PASSWORD);
    expect(((await login.json()) as { units: unknown[] }).units).toEqual([
      { role: "member", unitId: 1, unitName: "Tạp chí Khoa học" }
    ]);
  });

  it("adds someone who already has a password to a second Đơn vị without a new link", async () => {
    const admin = await h.signedInAdmin();
    await join(admin, "hai-noi@ou.edu.vn", 1);

    const second = await admin.post("/api/units/2/members", { email: "hai-noi@ou.edu.vn" });
    expect(second.status).toBe(201);
    expect(((await second.json()) as { setupUrl: string | null }).setupUrl).toBeNull();
  });

  it("lists members without ever exposing a password hash", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/units/1/members", { email: "chua-dat@ou.edu.vn" });
    const listed = await admin.get("/api/units/1/members");
    const text = await listed.clone().text();

    expect(((await listed.json()) as { members: unknown[] }).members).toEqual([
      { email: "admin@ou.edu.vn", hasPassword: true, role: "manager" },
      { email: "chua-dat@ou.edu.vn", hasPassword: false, role: "member" }
    ]);
    expect(text).not.toContain("pbkdf2");
  });

  it("refuses an address outside the university, and a member added twice", async () => {
    const admin = await h.signedInAdmin();
    expect((await admin.post("/api/units/1/members", { email: "ai-do@gmail.com" })).status).toBe(422);
    await admin.post("/api/units/1/members", { email: "mot-lan@ou.edu.vn" });
    expect((await admin.post("/api/units/1/members", { email: "mot-lan@ou.edu.vn" })).status).toBe(409);
  });

  it("is for a Quản lý đơn vị of that Đơn vị only", async () => {
    const admin = await h.signedInAdmin();
    const member = await join(admin, "thanh-vien@ou.edu.vn", 1);
    const manager = await join(admin, "quan-ly@ou.edu.vn", 1, "manager");

    expect((await h.client().post("/api/units/1/members", { email: "x@ou.edu.vn" })).status).toBe(401);
    expect((await member.post("/api/units/1/members", { email: "x@ou.edu.vn" })).status).toBe(403);
    expect((await manager.post("/api/units/1/members", { email: "x@ou.edu.vn" })).status).toBe(201);
    // Managing one Đơn vị says nothing about another.
    expect((await manager.post("/api/units/2/members", { email: "y@ou.edu.vn" })).status).toBe(403);
    expect((await manager.post("/api/units/99/members", { email: "y@ou.edu.vn" })).status).toBe(404);
  });

  it("issues a fresh link for a forgotten password, which ends the old sessions", async () => {
    const admin = await h.signedInAdmin();
    const member = await join(admin, "quen@ou.edu.vn", 1);

    const reissued = await admin.post("/api/units/1/members/password-setup", { email: "quen@ou.edu.vn" });
    const { setupUrl } = (await reissued.json()) as { setupUrl: string };
    await h.client().setup(tokenOf(setupUrl), "quen@ou.edu.vn", "mat-khau-moi-tinh");

    expect((await member.get("/api/auth/me")).status).toBe(401);
    expect((await h.client().login("quen@ou.edu.vn", PASSWORD)).status).toBe(401);
    expect((await admin.post("/api/units/2/members/password-setup", { email: "quen@ou.edu.vn" })).status).toBe(404);
  });
});

describe("Khóa API", () => {
  const LINK = { name: "Thử", target: "https://ou.edu.vn/" };

  it("is shown once, works for its Đơn vị, and stops working when revoked", async () => {
    const admin = await h.signedInAdmin();
    const issued = await admin.post("/api/units/1/keys", { name: "CRM Tạp chí" });
    const { id, key } = (await issued.json()) as { id: number; key: string };

    expect(issued.status).toBe(201);
    expect(key.startsWith("oul_")).toBe(true);

    const app = h.client();
    expect((await app.post("/api/links", LINK, { headers: bearer(key) })).status).toBe(201);

    expect((await admin.delete(`/api/units/2/keys/${id}`)).status).toBe(404);
    expect((await admin.delete(`/api/units/1/keys/${id}`)).status).toBe(204);
    expect((await app.post("/api/links", LINK, { headers: bearer(key) })).status).toBe(401);
  });

  it("cannot manage members or issue keys - a leaked key must not mint its successor", async () => {
    const admin = await h.signedInAdmin();
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };
    const app = h.client();

    expect((await app.post("/api/units/1/keys", { name: "con" }, { headers: bearer(key) })).status).toBe(401);
    expect((await app.post("/api/units/1/members", { email: "x@ou.edu.vn" }, { headers: bearer(key) })).status).toBe(
      401
    );
  });

  it("is listed by name and state, never by value", async () => {
    const admin = await h.signedInAdmin();
    const first = (await (await admin.post("/api/units/1/keys", { name: "Cũ" })).json()) as { id: number; key: string };
    await admin.post("/api/units/1/keys", { name: "Mới" });
    await admin.delete(`/api/units/1/keys/${first.id}`);

    const listed = await admin.get("/api/units/1/keys");
    const text = await listed.clone().text();
    const { keys } = (await listed.json()) as { keys: { name: string; revokedAt: string | null }[] };

    expect(keys.map((key) => [key.name, key.revokedAt !== null])).toEqual([
      ["Mới", false],
      ["Cũ", true]
    ]);
    expect(text).not.toContain(first.key);
    expect((await h.client().get("/api/units/1/keys")).status).toBe(401);
  });

  it("is never stored as issued", async () => {
    const admin = await h.signedInAdmin();
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };
    const row = await h.db.prepare("SELECT key_hash FROM api_keys").first<{ key_hash: string }>();

    expect(row?.key_hash).not.toBe(key);
    expect(row?.key_hash).toHaveLength(64);
  });
});
