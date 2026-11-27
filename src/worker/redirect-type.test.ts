import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, startHarness } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const TARGET = "https://journalofscience.example.org/cfp";

type Browser = Awaited<ReturnType<typeof h.signedInAdmin>>;

const create = async (browser: Browser, body: Record<string, unknown> = {}) =>
  browser.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1, ...body });

describe("the Redirect Type of a Link", () => {
  it("is 302 unless chosen, and every type is sent uncached", async () => {
    const admin = await h.signedInAdmin();
    expect(await (await create(admin)).json()).toMatchObject({ redirectType: 302 });
    expect((await h.client().get("/cfp-2027")).status).toBe(302);

    for (const type of [301, 307, 308]) {
      expect((await admin.put("/api/links/cfp-2027/redirect", { redirectType: type })).status).toBe(200);
      const opened = await h.client().get("/cfp-2027");
      expect(opened.status).toBe(type);
      expect(opened.headers.get("location")).toBe(TARGET);
      expect(opened.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("is chosen when the Link is created, by a person or by an API Key", async () => {
    const admin = await h.signedInAdmin();
    expect(await (await create(admin, { redirectType: 301 })).json()).toMatchObject({ redirectType: 301 });
    expect((await h.client().get("/cfp-2027")).status).toBe(301);

    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };
    const byKey = await h
      .client()
      .post("/api/links", { code: "tu-crm", name: "CRM", redirectType: 308, target: TARGET }, { headers: bearer(key) });
    expect(await byKey.json()).toMatchObject({ redirectType: 308 });
  });

  it("refuses any other status, on creating and on changing", async () => {
    const admin = await h.signedInAdmin();
    for (const redirectType of [200, 303, 404, "301", null]) {
      expect(await (await create(admin, { redirectType })).json()).toEqual({ error: "bad-redirect" });
    }
    await create(admin);
    const refused = await admin.put("/api/links/cfp-2027/redirect", { redirectType: 303 });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "bad-redirect" });
  });

  it("records each change with who made it, and nothing when the type stays", async () => {
    const admin = await h.signedInAdmin();
    await create(admin);
    await admin.put("/api/links/cfp-2027/redirect", { redirectType: 301 });
    await admin.put("/api/links/cfp-2027/redirect", { redirectType: 301 });
    await admin.put("/api/links/cfp-2027/redirect", { redirectType: 302 });

    const { history } = (await (await admin.get("/api/links/cfp-2027/history")).json()) as { history: object[] };
    expect(history).toEqual([
      expect.objectContaining({
        by: { email: "admin@example.org", kind: "account" },
        kind: "redirect",
        newType: 302,
        oldType: 301
      }),
      expect.objectContaining({ kind: "redirect", newType: 301, oldType: 302 })
    ]);
  });

  it("is changed by people only: an API Key chooses it at creation and that is all", async () => {
    const admin = await h.signedInAdmin();
    await create(admin);
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };

    const refused = await h
      .client()
      .put("/api/links/cfp-2027/redirect", { redirectType: 301 }, { headers: bearer(key) });
    expect(refused.status).toBe(403);
    expect((await h.client().get("/cfp-2027")).status).toBe(302);
  });

  it("does not apply after the password form, which always answers 303", async () => {
    const admin = await h.signedInAdmin();
    await create(admin, { redirectType: 308 });
    await admin.put("/api/links/cfp-2027/access", { password: "hoi-dong" });

    const right = await h.client().postForm("/cfp-2027", { password: "hoi-dong" });
    expect(right.status).toBe(303);
    expect(right.headers.get("location")).toBe(TARGET);
  });

  it("travels with the export, and an export made before it existed still imports as 302", async () => {
    const admin = await h.signedInAdmin();
    await create(admin, { redirectType: 301 });
    await admin.put("/api/links/cfp-2027/redirect", { redirectType: 307 });
    const snapshot = (await (await admin.get("/api/admin/export")).json()) as {
      tables: Record<string, Record<string, unknown>[]>;
    };
    expect(snapshot.tables.redirect_changes).toHaveLength(1);

    // As an export made before Redirect Types: no column, no table.
    const { redirect_changes: _changes, links = [], ...otherTables } = snapshot.tables;
    const older = {
      ...snapshot,
      tables: { ...otherTables, links: links.map(({ redirect_type: _type, ...row }) => row) }
    };

    for (const [taken, expected] of [
      [snapshot, 307],
      [older, 302]
    ] as const) {
      await h.reset();
      const imported = await h
        .client()
        .post("/api/admin/import", taken, { headers: bearer("bootstrap-secret-for-tests") });
      expect(imported.status).toBe(204);
      expect((await h.client().get("/cfp-2027")).status).toBe(expected);
    }
  });
});
