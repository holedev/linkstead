import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BOOTSTRAP_TOKEN, bearer, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const TARGET = "https://journalofscience.ou.edu.vn/cfp";
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Three logos told apart by their last byte: the university's, a Đơn vị's, a Link's own. */
const png = (mark: number) => new Uint8Array([...PNG_HEAD, 0, 0, 0, mark]);
const UNIVERSITY = png(1);
const UNIT = png(2);
const OWN = png(3);
const dataOf = (bytes: Uint8Array) => `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

type Browser = ReturnType<typeof h.client>;

const withLink = async () => {
  const admin = await h.signedInAdmin();
  await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
  return admin;
};

const member = async (admin: Browser, unitId: number, email: string) => {
  const added = await admin.post(`/api/units/${unitId}/members`, { email });
  const browser = h.client();
  const { setupUrl } = (await added.json()) as { setupUrl: string };
  await browser.setup(tokenOf(setupUrl), email, "mat-khau-du-dai");
  await browser.login(email, "mat-khau-du-dai");
  return browser;
};

const qrOf = async (browser: Browser, code = "cfp-2027") => (await browser.get(`/api/links/${code}/qr`)).text();

describe("a Link's QR", () => {
  it("is an SVG that can load and run nothing, for a member and for the Đơn vị's Khóa API", async () => {
    const admin = await withLink();
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };

    const response = await admin.get("/api/links/CFP-2027/qr");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const picture = await response.text();
    expect(picture.startsWith("<svg ")).toBe(true);
    expect(picture).not.toContain("<image");
    expect(await (await h.client().get("/api/links/cfp-2027/qr", { headers: bearer(key) })).text()).toBe(picture);
  });

  it("carries the Link and not the Đích, so it is the same picture after the Đích changes", async () => {
    const admin = await withLink();
    const before = await qrOf(admin);
    await admin.put("/api/links/cfp-2027/target", { target: "https://ou.edu.vn/noi-khac" });
    expect(await qrOf(admin)).toBe(before);

    // A Link with the same Đích and another code is another picture.
    await admin.post("/api/links", { code: "cfp-2028", name: "Khác", target: TARGET, unitId: 1 });
    expect(await qrOf(admin, "cfp-2028")).not.toBe(before);
  });

  it("is refused to another Đơn vị, to its key and to a stranger", async () => {
    const admin = await withLink();
    const publisher = await member(admin, 2, "nxb@ou.edu.vn");
    const { key } = (await (await admin.post("/api/units/2/keys", { name: "NXB" })).json()) as { key: string };

    expect((await publisher.get("/api/links/cfp-2027/qr")).status).toBe(403);
    expect((await h.client().get("/api/links/cfp-2027/qr", { headers: bearer(key) })).status).toBe(403);
    expect((await h.client().get("/api/links/cfp-2027/qr")).status).toBe(401);
    expect((await admin.get("/api/links/khong-co/qr")).status).toBe(404);
  });
});

describe("the look of a Link's QR", () => {
  it("is black on white unless another of the fixed looks is asked for, by a member or a key", async () => {
    const admin = await withLink();
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };

    expect(await qrOf(admin)).toContain('<path fill="#000"');
    const inverted = await admin.get("/api/links/cfp-2027/qr?style=light-on-dark");
    expect(inverted.headers.get("content-disposition")).toBe('inline; filename="qr-cfp-2027-light-on-dark.svg"');
    const picture = await inverted.text();
    expect(picture).toContain('fill="#000"/><path fill="#fff"');
    const clear = await h.client().get("/api/links/cfp-2027/qr?style=dark-on-clear", { headers: bearer(key) });
    expect(clear.status).toBe(200);
    expect(await clear.text()).not.toContain("<rect width=");
  });

  it("refuses a look it does not know rather than guessing one", async () => {
    const admin = await withLink();
    const refused = await admin.get("/api/links/cfp-2027/qr?style=hot-pink");
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "bad-style" });
  });
});

describe("the logo on a QR", () => {
  it("is chosen at three levels, the lower winning", async () => {
    const admin = await withLink();
    expect(await qrOf(admin)).not.toContain("<image");

    expect((await admin.upload("/api/admin/qr-logo", UNIVERSITY)).status).toBe(204);
    expect(await qrOf(admin)).toContain(dataOf(UNIVERSITY));

    expect((await admin.upload("/api/units/1/qr-logo", UNIT)).status).toBe(204);
    expect(await qrOf(admin)).toContain(dataOf(UNIT));

    expect(await (await admin.upload("/api/links/cfp-2027/qr-logo", OWN)).json()).toEqual({ logoChoice: "custom" });
    expect(await qrOf(admin)).toContain(dataOf(OWN));

    expect((await admin.put("/api/links/cfp-2027/qr-logo", { choice: "none" })).status).toBe(200);
    expect(await qrOf(admin)).not.toContain("<image");

    await admin.put("/api/links/cfp-2027/qr-logo", { choice: "inherit" });
    expect(await qrOf(admin)).toContain(dataOf(UNIT));

    expect((await admin.delete("/api/units/1/qr-logo")).status).toBe(204);
    expect(await qrOf(admin)).toContain(dataOf(UNIVERSITY));

    expect((await admin.delete("/api/admin/qr-logo")).status).toBe(204);
    expect(await qrOf(admin)).not.toContain("<image");
  });

  it("keeps a Link's own choice whatever its Đơn vị or the university changes later", async () => {
    const admin = await withLink();
    await admin.upload("/api/links/cfp-2027/qr-logo", OWN);
    const printed = await qrOf(admin);

    await admin.upload("/api/admin/qr-logo", UNIVERSITY);
    await admin.upload("/api/units/1/qr-logo", UNIT);
    expect(await qrOf(admin)).toBe(printed);
    expect(await (await admin.get("/api/links?unitId=1")).json()).toMatchObject({ links: [{ logoChoice: "custom" }] });
  });

  it("leaves no file behind when a logo is replaced or given up", async () => {
    const admin = await withLink();
    await admin.upload("/api/links/cfp-2027/qr-logo", OWN);
    await admin.upload("/api/links/cfp-2027/qr-logo", png(4));
    await admin.upload("/api/units/1/qr-logo", UNIT);
    await admin.upload("/api/units/1/qr-logo", png(5));
    expect(h.logoFiles.size).toBe(2);

    await admin.put("/api/links/cfp-2027/qr-logo", { choice: "none" });
    await admin.delete("/api/units/1/qr-logo");
    expect(h.logoFiles.size).toBe(0);
  });

  it("is PNG or JPEG by its bytes - never SVG, whatever the upload claims to be", async () => {
    const admin = await withLink();
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const tooBig = new Uint8Array(256 * 1024 + 1);
    tooBig.set(PNG_HEAD);
    const attempt = async (path: string, bytes: Uint8Array) =>
      (await (await admin.upload(path, bytes)).json()) as object;

    for (const path of ["/api/links/cfp-2027/qr-logo", "/api/units/1/qr-logo", "/api/admin/qr-logo"]) {
      expect(await attempt(path, svg)).toEqual({ error: "bad-logo", problem: "not-png-or-jpeg" });
      expect(await attempt(path, tooBig)).toEqual({ error: "bad-logo", problem: "too-large" });
      expect(await attempt(path, new Uint8Array())).toEqual({ error: "bad-logo", problem: "empty" });
    }
    expect(h.logoFiles.size).toBe(0);
    expect(await qrOf(admin)).not.toContain("<image");
    expect((await admin.put("/api/links/cfp-2027/qr-logo", { choice: "custom" })).status).toBe(422);
  });

  it("is each level's own to set: a member for a Link, a Quản lý đơn vị for the Đơn vị, an administrator for all", async () => {
    const admin = await withLink();
    const editor = await member(admin, 1, "bien-tap@ou.edu.vn");
    const publisher = await member(admin, 2, "nxb@ou.edu.vn");
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };

    expect((await editor.upload("/api/links/cfp-2027/qr-logo", OWN)).status).toBe(200);
    expect((await editor.upload("/api/units/1/qr-logo", UNIT)).status).toBe(403);
    expect((await editor.upload("/api/admin/qr-logo", UNIVERSITY)).status).toBe(403);
    expect((await editor.get("/api/units/1/qr-preview")).status).toBe(403);
    expect((await publisher.upload("/api/links/cfp-2027/qr-logo", OWN)).status).toBe(403);
    // Choosing a logo is not one of the things the API does.
    expect((await h.client().upload("/api/links/cfp-2027/qr-logo", OWN, { headers: bearer(key) })).status).toBe(403);
  });

  it("shows a manager and an administrator what their logo looks like on a sample QR", async () => {
    const admin = await withLink();
    await admin.upload("/api/admin/qr-logo", UNIVERSITY);
    expect(await (await admin.get("/api/units/1/qr-logo")).json()).toEqual({ own: false, university: true });
    expect(await (await admin.get("/api/units/1/qr-preview")).text()).toContain(dataOf(UNIVERSITY));

    await admin.upload("/api/units/1/qr-logo", UNIT);
    expect(await (await admin.get("/api/units/1/qr-logo")).json()).toEqual({ own: true, university: true });
    expect(await (await admin.get("/api/units/1/qr-preview")).text()).toContain(dataOf(UNIT));
    expect(await (await admin.get("/api/admin/qr-preview")).text()).toContain(dataOf(UNIVERSITY));
    expect(await (await admin.get("/api/admin/qr-logo")).json()).toEqual({ set: true });
  });

  it("travels with the export, so an imported installation gives the same pictures", async () => {
    const admin = await withLink();
    await admin.upload("/api/admin/qr-logo", UNIVERSITY);
    await admin.upload("/api/units/2/qr-logo", UNIT);
    await admin.upload("/api/links/cfp-2027/qr-logo", OWN);
    await admin.post("/api/links", { code: "cua-nxb", name: "NXB", target: TARGET, unitId: 2 });
    const before = [await qrOf(admin), await qrOf(admin, "cua-nxb")];
    const snapshot = (await (await admin.get("/api/admin/export")).json()) as { logos: Record<string, string> };
    expect(Object.keys(snapshot.logos)).toHaveLength(3);

    await h.reset();
    // A file that is not a picture, or aimed outside the logo folders, is not taken in.
    snapshot.logos["links/1/khong-phai-anh"] = Buffer.from("<svg/>").toString("base64");
    snapshot.logos["../ngoai"] = Buffer.from(OWN).toString("base64");
    const imported = await h.client().post("/api/admin/import", snapshot, { headers: bearer(BOOTSTRAP_TOKEN) });
    expect(imported.status).toBe(204);
    expect(h.logoFiles.size).toBe(3);

    const again = h.client();
    await again.login("admin@ou.edu.vn", "mat-khau-quan-tri");
    expect([await qrOf(again), await qrOf(again, "cua-nxb")]).toEqual(before);
    expect(before[0]).toContain(dataOf(OWN));
  });
});
