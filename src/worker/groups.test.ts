import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const TARGET = "https://journalofscience.example.org/cfp";
const GROUPED_ROW = /^cfp-2027,https:\/\/go\.test\/cfp-2027,Poster,Hội thảo,/;

type Browser = ReturnType<typeof h.client>;
type Group = { id: number; name: string; linkCount: number };

const member = async (admin: Browser, unitId: number, email: string) => {
  const added = await admin.post(`/api/units/${unitId}/members`, { email });
  const browser = h.client();
  await browser.setup(tokenOf(((await added.json()) as { setupUrl: string }).setupUrl), email, "mat-khau-du-dai");
  await browser.login(email, "mat-khau-du-dai");
  return browser;
};

const groupsOf = async (browser: Browser, unitId: number) =>
  ((await (await browser.get(`/api/units/${unitId}/groups`)).json()) as { groups: Group[] }).groups;

const newGroup = async (browser: Browser, unitId: number, name: string) =>
  (await (await browser.post(`/api/units/${unitId}/groups`, { name })).json()) as Group;

const linksOf = async (browser: Browser, unitId: number) =>
  (
    (await (await browser.get(`/api/links?unitId=${unitId}`)).json()) as {
      links: { code: string; groupId: number | null }[];
    }
  ).links;

describe("a Group", () => {
  it("is made, renamed and listed by a Member, with how many Links it holds", async () => {
    const admin = await h.signedInAdmin();
    const editor = await member(admin, 1, "bien-tap@example.org");
    const conference = await newGroup(editor, 1, "Hội thảo 2027");
    await newGroup(editor, 1, "Bài báo");
    await editor.post("/api/links", {
      code: "cfp-2027",
      groupId: conference.id,
      name: "Poster",
      target: TARGET,
      unitId: 1
    });

    expect(await groupsOf(editor, 1)).toMatchObject([
      { linkCount: 0, name: "Bài báo" },
      { id: conference.id, linkCount: 1, name: "Hội thảo 2027" }
    ]);
    const renamed = await editor.put(`/api/units/1/groups/${conference.id}`, { name: "Hội thảo quốc tế 2027" });
    expect(await renamed.json()).toEqual({ id: conference.id, name: "Hội thảo quốc tế 2027" });
  });

  it("has a name its Unit uses once, which another Unit may use too", async () => {
    const admin = await h.signedInAdmin();
    await newGroup(admin, 1, "Hội thảo");
    const again = await admin.post("/api/units/1/groups", { name: "Hội thảo" });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "group-name-taken" });
    expect((await admin.post("/api/units/2/groups", { name: "Hội thảo" })).status).toBe(201);
    expect((await admin.post("/api/units/1/groups", { name: "  " })).status).toBe(422);
    const other = await newGroup(admin, 1, "Khác");
    expect((await admin.put(`/api/units/1/groups/${other.id}`, { name: "Hội thảo" })).status).toBe(409);
  });

  it("goes when deleted, leaving its Links where they were, in no Group", async () => {
    const admin = await h.signedInAdmin();
    const group = await newGroup(admin, 1, "Tạm");
    await admin.post("/api/links", { code: "cfp-2027", groupId: group.id, name: "Poster", target: TARGET, unitId: 1 });

    expect((await admin.delete(`/api/units/1/groups/${group.id}`)).status).toBe(204);
    expect(await groupsOf(admin, 1)).toEqual([]);
    expect(await linksOf(admin, 1)).toMatchObject([{ code: "cfp-2027", groupId: null }]);
    expect((await h.client().get("/cfp-2027")).headers.get("location")).toBe(TARGET);
    expect((await admin.delete(`/api/units/1/groups/${group.id}`)).status).toBe(404);
  });

  it("is a Member's to manage: not another Unit's, not an API Key's", async () => {
    const admin = await h.signedInAdmin();
    const group = await newGroup(admin, 1, "Hội thảo");
    const outsider = await member(admin, 2, "khac@example.org");
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };

    expect((await outsider.get("/api/units/1/groups")).status).toBe(403);
    expect((await outsider.post("/api/units/1/groups", { name: "Của tôi" })).status).toBe(403);
    expect((await outsider.delete(`/api/units/1/groups/${group.id}`)).status).toBe(403);
    // Another Unit's Group id, asked for through one's own Unit, is not found.
    expect((await outsider.delete(`/api/units/2/groups/${group.id}`)).status).toBe(404);
    expect((await h.client().get("/api/units/1/groups", { headers: bearer(key) })).status).toBe(401);
  });
});

describe("sorting a Link into a Group", () => {
  it("moves it between its own Unit's Group and out of any", async () => {
    const admin = await h.signedInAdmin();
    const a = await newGroup(admin, 1, "A");
    const b = await newGroup(admin, 1, "B");
    await admin.post("/api/links", { code: "cfp-2027", groupId: a.id, name: "Poster", target: TARGET, unitId: 1 });

    expect(await (await admin.put("/api/links/cfp-2027/group", { groupId: b.id })).json()).toMatchObject({
      groupId: b.id
    });
    expect(await (await admin.put("/api/links/cfp-2027/group", { groupId: null })).json()).toMatchObject({
      groupId: null
    });
  });

  it("refuses a Group of another Unit, when creating as when sorting", async () => {
    const admin = await h.signedInAdmin();
    const theirs = await newGroup(admin, 2, "Của đơn vị khác");
    const create = await admin.post("/api/links", { groupId: theirs.id, name: "Poster", target: TARGET, unitId: 1 });
    expect(create.status).toBe(422);
    expect(await create.json()).toEqual({ error: "unknown-group" });

    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
    expect((await admin.put("/api/links/cfp-2027/group", { groupId: theirs.id })).status).toBe(422);
    expect((await admin.put("/api/links/cfp-2027/group", { groupId: "x" })).status).toBe(422);
    expect((await admin.put("/api/links/cfp-2027/group", {})).status).toBe(422);
  });

  it("takes a Group from an API Key creating a Link, but leaves sorting to people", async () => {
    const admin = await h.signedInAdmin();
    const group = await newGroup(admin, 1, "Từ CRM");
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };
    const app = h.client();

    const created = await app.post(
      "/api/links",
      { groupId: group.id, name: "CRM", target: TARGET },
      { headers: bearer(key) }
    );
    expect(await created.json()).toMatchObject({ groupId: group.id });
    const { code } = (await linksOf(admin, 1))[0] ?? { code: "" };
    expect((await app.put(`/api/links/${code}/group`, { groupId: null }, { headers: bearer(key) })).status).toBe(403);
  });

  it("is left behind when the Link moves to another Unit", async () => {
    const admin = await h.signedInAdmin();
    const group = await newGroup(admin, 1, "Hội thảo");
    await admin.post("/api/links", { code: "cfp-2027", groupId: group.id, name: "Poster", target: TARGET, unitId: 1 });

    await admin.post("/api/admin/links/cfp-2027/move", { unitId: 2 });
    expect(await linksOf(admin, 2)).toMatchObject([{ code: "cfp-2027", groupId: null }]);
    expect(await groupsOf(admin, 1)).toMatchObject([{ linkCount: 0, name: "Hội thảo" }]);
  });

  it("shows in the Unit's CSV", async () => {
    const admin = await h.signedInAdmin();
    const group = await newGroup(admin, 1, "Hội thảo");
    await admin.post("/api/links", { code: "cfp-2027", groupId: group.id, name: "Poster", target: TARGET, unitId: 1 });
    const rows = (await (await admin.get("/api/units/1/links.csv")).text()).split("\r\n");
    expect(rows[1]).toMatch(GROUPED_ROW);
  });
});

describe("a Group when Unit merge", () => {
  it("joins the other's Group of the same name, and moves across otherwise", async () => {
    const admin = await h.signedInAdmin();
    const kept = await newGroup(admin, 1, "Hội thảo");
    const same = await newGroup(admin, 2, "Hội thảo");
    const own = await newGroup(admin, 2, "Sách");
    await admin.post("/api/links", { code: "mot", groupId: kept.id, name: "1", target: TARGET, unitId: 1 });
    await admin.post("/api/links", { code: "hai", groupId: same.id, name: "2", target: TARGET, unitId: 2 });
    await admin.post("/api/links", { code: "sach", groupId: own.id, name: "3", target: TARGET, unitId: 2 });

    await admin.post("/api/admin/units/2/merge", { intoUnitId: 1 });
    expect(await groupsOf(admin, 1)).toEqual([
      { id: kept.id, linkCount: 2, name: "Hội thảo" },
      { id: own.id, linkCount: 1, name: "Sách" }
    ]);
    const byCode = Object.fromEntries((await linksOf(admin, 1)).map((link) => [link.code, link.groupId]));
    expect(byCode).toEqual({ hai: kept.id, mot: kept.id, sach: own.id });
  });
});
