import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BOOTSTRAP_TOKEN, bearer, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const TARGET = "https://journalofscience.example.org/cfp";
const PASSWORD = "mat-khau-quan-tri";
const LINK_ROW =
  /^cfp-2027,https:\/\/go\.test\/cfp-2027,"Poster ""A3"", sảnh A",,https:\/\/journalofscience.example.org\/cfp,,Quản trị hệ thống đã tắt,,\d{4}-.*Z,1$/;

type Browser = ReturnType<typeof h.client>;

const member = async (admin: Browser, unitId: number, email: string) => {
  const added = await admin.post(`/api/units/${unitId}/members`, { email });
  const browser = h.client();
  const { setupUrl } = (await added.json()) as { setupUrl: string };
  await browser.setup(tokenOf(setupUrl), email, "mat-khau-du-dai");
  await browser.login(email, "mat-khau-du-dai");
  return browser;
};

describe("a Đơn vị's CSV", () => {
  it("lists its Links, one row each, readable by a spreadsheet", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: 'Poster "A3", sảnh A', target: TARGET, unitId: 1 });
    await admin.post("/api/links", { code: "cua-nxb", name: "Của NXB", target: TARGET, unitId: 2 });
    await h.client().get("/cfp-2027");
    await admin.post("/api/links/cfp-2027/disable");

    const response = await admin.get("/api/units/1/links.csv");
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="linkstead-unit-1-links.csv"');
    // `text()` drops the BOM, so the bytes are read to see it.
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect((await response.text()).split("\r\n")).toEqual([
      "Mã link,Link,Tên link,Nhóm,Đích,Ghi chú,Trạng thái,Lưu trữ,Ngày tạo,Lượt mở (ước tính)",
      expect.stringMatching(LINK_ROW),
      ""
    ]);
  });

  it("lists its Lượt mở per Link per day", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
    await admin.post("/api/links", { code: "bai-bao", name: "Bài báo", target: TARGET, unitId: 1 });
    const visitor = h.client();
    await visitor.get("/cfp-2027");
    await visitor.get("/cfp-2027");
    await visitor.get("/bai-bao");
    h.advance(24 * 60 * 60 * 1000);
    await visitor.get("/cfp-2027");

    expect((await (await admin.get("/api/units/1/visits.csv")).text()).split("\r\n")).toEqual([
      "Mã link,Ngày,Lượt mở (ước tính)",
      "bai-bao,2027-03-01,1",
      "cfp-2027,2027-03-01,2",
      "cfp-2027,2027-03-02,1",
      ""
    ]);
  });

  it("is for the Đơn vị's own members, not another's, not a Khóa API", async () => {
    const admin = await h.signedInAdmin();
    const publisher = await member(admin, 2, "nxb@example.org");
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };

    expect((await publisher.get("/api/units/2/links.csv")).status).toBe(200);
    expect((await publisher.get("/api/units/1/links.csv")).status).toBe(403);
    expect((await publisher.get("/api/units/1/visits.csv")).status).toBe(403);
    expect((await h.client().get("/api/units/1/links.csv", { headers: bearer(key) })).status).toBe(401);
    expect((await admin.get("/api/units/9/links.csv")).status).toBe(404);
  });
});

describe("the whole installation", () => {
  /** An installation with some of everything in it, and its export. */
  const used = async () => {
    const admin = await h.signedInAdmin();
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };
    await admin.post("/api/admin/units", { managerEmail: "khoa@example.org", name: "Khoa Luật" });
    await admin.post("/api/admin/reserved-codes", { code: "tuyensinh", note: "Phòng Đào tạo" });
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
    // A second apart, so the history has one order whichever table a line sits in.
    await h.client().put("/api/links/cfp-2027/target", { target: `${TARGET}-2027` }, { headers: bearer(key) });
    h.advance(1000);
    await admin.post("/api/admin/links/cfp-2027/move", { unitId: 3 });
    h.advance(1000);
    await admin.post("/api/links/cfp-2027/disable");
    h.advance(1000);
    await admin.post("/api/links/cfp-2027/enable");
    await h.client().get("/cfp-2027");
    const exported = await admin.get("/api/admin/export");
    return { admin, exported, key };
  };

  it("exports to a Quản trị hệ thống only, without sessions or one-time links", async () => {
    const { admin, exported } = await used();
    const manager = await member(admin, 1, "bien-tap@example.org");
    const snapshot = (await exported.json()) as { version: number; tables: Record<string, unknown[]> };

    expect(exported.headers.get("content-disposition")).toBe('attachment; filename="linkstead-2027-03-01.json"');
    expect(snapshot.version).toBe(1);
    expect(Object.keys(snapshot.tables).sort()).toEqual([
      "accounts",
      "api_keys",
      "daily_visit_sources",
      "daily_visits",
      "link_groups",
      "links",
      "memberships",
      "organization",
      "reserved_codes",
      "status_changes",
      "target_changes",
      "unit_changes",
      "units"
    ]);
    expect((await manager.get("/api/admin/export")).status).toBe(403);
    expect((await h.client().get("/api/admin/export")).status).toBe(401);
  });

  it("is taken in whole by a fresh installation, where everything works as before", async () => {
    const { exported, key } = await used();
    const snapshot = await exported.json();
    await h.reset();

    const imported = await h.client().post("/api/admin/import", snapshot, { headers: bearer(BOOTSTRAP_TOKEN) });
    expect(imported.status).toBe(204);

    // The same password signs in, the same key works, the Link opens and remembers its past.
    const admin = h.client();
    const login = await admin.login("admin@example.org", PASSWORD);
    expect(((await login.json()) as { units: { unitName: string }[] }).units.map((unit) => unit.unitName)).toEqual([
      "Journal & Press",
      "Accounting"
    ]);
    expect((await h.client().get("/api/links", { headers: bearer(key) })).status).toBe(200);
    expect((await h.client().get("/cfp-2027")).headers.get("location")).toBe(`${TARGET}-2027`);
    expect(await (await admin.get("/api/admin/links/cfp-2027")).json()).toMatchObject({
      history: [
        { enabled: true, kind: "status" },
        { bySystem: true, enabled: false, kind: "status" },
        { kind: "unit", newUnitName: "Khoa Luật", oldUnitName: "Journal & Press" },
        { by: { kind: "key", name: "CRM" }, kind: "target" }
      ],
      unitName: "Khoa Luật",
      visits: 2
    });
    expect(await (await admin.get("/api/admin/reserved-codes")).json()).toMatchObject({
      codes: [{ code: "tuyensinh", note: "Phòng Đào tạo" }]
    });

    // New rows carry on after the imported ones: no id, and so no Mã link's owner, is ever reused.
    const created = await admin.post("/api/admin/units", { managerEmail: "moi@example.org", name: "Khoa Mới" });
    expect(((await created.json()) as { id: number }).id).toBe(4);
  });

  it("refuses to import over an installation already in use, or without the deploy's secret", async () => {
    const { admin, exported } = await used();
    const snapshot = await exported.json();

    const over = await h.client().post("/api/admin/import", snapshot, { headers: bearer(BOOTSTRAP_TOKEN) });
    expect(over.status).toBe(409);
    expect(await over.json()).toEqual({ error: "not-empty" });
    expect((await admin.post("/api/admin/import", snapshot)).status).toBe(403);
    expect((await h.client().post("/api/admin/import", snapshot, { headers: bearer("sai") })).status).toBe(403);
  });

  it("keeps nothing of a snapshot it cannot read", async () => {
    const { exported } = await used();
    const snapshot = (await exported.json()) as { tables: Record<string, Record<string, unknown>[]> };
    await h.reset();
    const post = (body: unknown) => h.client().post("/api/admin/import", body, { headers: bearer(BOOTSTRAP_TOKEN) });

    expect((await post({ tables: {}, version: 2 })).status).toBe(422);
    expect((await post({ ...snapshot, tables: { ...snapshot.tables, links: undefined } })).status).toBe(422);
    // A Link pointing at a Đơn vị the snapshot does not hold fails part-way through.
    const broken = structuredClone(snapshot);
    for (const link of broken.tables.links ?? []) {
      link.unit_id = 99;
    }
    expect((await post(broken)).status).toBe(422);
    const left = await h.db
      .prepare("SELECT (SELECT count(*) FROM accounts) + (SELECT count(*) FROM links) AS total")
      .first<{ total: number }>();
    expect(left?.total).toBe(0);

    expect((await post(snapshot)).status).toBe(204);
  });
});
