import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, FIRST_UNIT, startHarness } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const TARGET = "https://journalofscience.ou.edu.vn/cfp";

const unitsNow = async () =>
  (await h.db.prepare("SELECT id, name, dissolved_at IS NOT NULL AS gone FROM units ORDER BY id").all()).results;

/** An installation as it was before the merge: the two Đơn vị the seed made, and nothing else. */
const asSeeded = async () => {
  await h.run("DELETE FROM units");
  await h.run("DELETE FROM sqlite_sequence");
  await h.runMigration("seed_first_units");
};

describe("Tạp chí Khoa học & Nhà xuất bản is one Đơn vị", () => {
  it("is the only Đơn vị of a fresh installation", async () => {
    await asSeeded();
    await h.runMigration("merge_first_units");
    expect(await unitsNow()).toEqual([{ gone: 0, id: 1, name: FIRST_UNIT }]);
  });

  it("takes in the Links, Khóa API and members of an installation already in use", async () => {
    await asSeeded();
    const admin = await h.signedInAdmin();
    const { key } = (await (await admin.post("/api/units/2/keys", { name: "NXB" })).json()) as { key: string };
    await admin.post("/api/units/2/members", { email: "chi-o-nxb@ou.edu.vn" });
    await admin.post("/api/units/1/members", { email: "ca-hai@ou.edu.vn" });
    await admin.post("/api/units/2/members", { email: "ca-hai@ou.edu.vn", role: "manager" });
    await admin.post("/api/links", { code: "cua-tap-chi", name: "Tạp chí", target: TARGET, unitId: 1 });
    await admin.post("/api/links", { code: "cua-nxb", name: "NXB", target: TARGET, unitId: 2 });

    await h.runMigration("merge_first_units");

    // The second Đơn vị is kept, dissolved, because a Link's history now names it.
    expect(await unitsNow()).toEqual([
      { gone: 0, id: 1, name: FIRST_UNIT },
      { gone: 1, id: 2, name: "Nhà xuất bản" }
    ]);
    const me = (await (await admin.get("/api/auth/me")).json()) as { units: object[] };
    expect(me.units).toEqual([{ role: "manager", unitId: 1, unitName: FIRST_UNIT }]);

    const links = (await (await admin.get("/api/links?unitId=1")).json()) as { links: { code: string }[] };
    expect(links.links.map((link) => link.code)).toEqual(["cua-nxb", "cua-tap-chi"]);
    expect((await h.client().get("/cua-nxb")).headers.get("location")).toBe(TARGET);
    expect(await (await admin.get("/api/links/cua-nxb/history")).json()).toMatchObject({
      history: [{ by: null, kind: "unit", newUnitName: FIRST_UNIT, oldUnitName: "Nhà xuất bản" }]
    });

    // The key still works, now for the one Đơn vị; members of either are members of it.
    const viaKey = (await (await h.client().get("/api/links", { headers: bearer(key) })).json()) as {
      links: object[];
    };
    expect(viaKey.links).toHaveLength(2);
    expect(await (await admin.get("/api/units/1/members")).json()).toMatchObject({
      members: [
        { email: "admin@ou.edu.vn", role: "manager" },
        { email: "ca-hai@ou.edu.vn", role: "manager" },
        { email: "chi-o-nxb@ou.edu.vn", role: "member" }
      ]
    });
  });

  it("changes nothing where the two were already renamed or dissolved", async () => {
    await asSeeded();
    await h.run("UPDATE units SET name = 'Tên khác' WHERE id = 2");
    await h.runMigration("merge_first_units");
    expect(await unitsNow()).toEqual([
      { gone: 0, id: 1, name: "Tạp chí Khoa học" },
      { gone: 0, id: 2, name: "Tên khác" }
    ]);
  });
});
