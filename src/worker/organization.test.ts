import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BOOTSTRAP_TOKEN, bearer, ORGANIZATION, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const PASSWORD = "mat-khau-du-dai";
const TARGET = "https://example.org/cfp";
const UI_LOGO_URL = /^\/api\/organization\/logo\?v=[\w-]+$/;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 7]);

type Browser = ReturnType<typeof h.client>;

const organizationOf = async (browser: Browser = h.client()) =>
  (await (await browser.get("/api/organization")).json()) as Record<string, unknown>;

const memberOf = async (admin: Browser, email: string) => {
  const added = await admin.post("/api/units/1/members", { email });
  const { setupUrl } = (await added.json()) as { setupUrl: string };
  const browser = h.client();
  await browser.setup(tokenOf(setupUrl), email, PASSWORD);
  await browser.login(email, PASSWORD);
  return browser;
};

describe("the Organization", () => {
  it("tells anyone what its pages need, before anyone signs in", async () => {
    expect(await organizationOf()).toEqual({ ...ORGANIZATION, uiLogo: null });
  });

  it("is set by a System Administrator, a part at a time", async () => {
    const admin = await h.signedInAdmin();
    const saved = await admin.put("/api/admin/settings", { language: "en", name: "Another University" });
    expect(saved.status).toBe(200);
    expect(await organizationOf()).toEqual({
      ...ORGANIZATION,
      language: "en",
      name: "Another University",
      uiLogo: null
    });
  });

  it("is set by nobody else, and never through an API Key", async () => {
    const admin = await h.signedInAdmin();
    const member = await memberOf(admin, "member@example.org");
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };

    expect((await member.put("/api/admin/settings", { name: "Mine" })).status).toBe(403);
    expect((await h.client().put("/api/admin/settings", { name: "Mine" }, { headers: bearer(key) })).status).toBe(401);
    expect((await h.client().put("/api/admin/settings", { name: "Mine" })).status).toBe(401);
    expect((await organizationOf()).name).toBe(ORGANIZATION.name);
  });

  it("refuses settings it cannot keep, and keeps the ones it had", async () => {
    const admin = await h.signedInAdmin();
    const attempt = async (body: unknown) => (await (await admin.put("/api/admin/settings", body)).json()) as object;
    expect(await attempt({ timeZone: "Mars/Olympus" })).toEqual({ error: "bad-time-zone" });
    expect(await attempt({ brandColor: "#ffff00" })).toEqual({ error: "bad-brand-color" });
    expect(await attempt({ emailDomains: ["not a domain"] })).toEqual({ error: "bad-email-domains" });
    expect(await attempt({ language: "fr" })).toEqual({ error: "bad-language" });
    expect(await organizationOf()).toEqual({ ...ORGANIZATION, uiLogo: null });
  });
});

describe("the Organization's email domains", () => {
  it("decide whose address may become an Account", async () => {
    const admin = await h.signedInAdmin();
    const refused = await admin.post("/api/units/1/members", { email: "someone@gmail.com" });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "email-not-allowed" });
    expect((await admin.post("/api/admin/admins", { email: "someone@gmail.com" })).status).toBe(422);

    await admin.put("/api/admin/settings", { emailDomains: [] });
    expect((await admin.post("/api/units/1/members", { email: "someone@gmail.com" })).status).toBe(201);
  });

  it("never sign out an Account their change leaves outside", async () => {
    const admin = await h.signedInAdmin();
    await admin.put("/api/admin/settings", { emailDomains: ["example.edu"] });
    expect((await admin.get("/api/auth/me")).status).toBe(200);
  });
});

describe("the Organization's time zone", () => {
  it("is the calendar a Visit is counted by, from the change on", async () => {
    const admin = await h.signedInAdmin();
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: TARGET, unitId: 1 });
    const visitor = h.client();
    // 20:00 UTC on 1 March is already 2 March in Ho Chi Minh City.
    h.advance(17 * 60 * 60 * 1000);
    await visitor.get("/cfp-2027");
    await admin.put("/api/admin/settings", { timeZone: "UTC" });
    await visitor.get("/cfp-2027");

    const visits = (await (await admin.get("/api/links/cfp-2027/visits")).json()) as { days: unknown[] };
    expect(visits.days).toEqual([
      { count: 1, day: "2027-03-01" },
      { count: 1, day: "2027-03-02" }
    ]);
  });
});

describe("the UI's logo", () => {
  it("is a PNG or JPEG a System Administrator uploads, served as it was checked", async () => {
    const admin = await h.signedInAdmin();
    expect((await h.client().get("/api/organization/logo")).status).toBe(404);

    const uploaded = await admin.upload("/api/admin/ui-logo", PNG);
    expect(uploaded.status).toBe(200);
    const { uiLogo } = await organizationOf();
    expect(uiLogo).toMatch(UI_LOGO_URL);

    const served = await h.client().get(uiLogo as string);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);

    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    expect(await (await admin.upload("/api/admin/ui-logo", svg)).json()).toEqual({
      error: "bad-logo",
      problem: "not-png-or-jpeg"
    });
  });

  it("is a different file from the QR's, and goes when it is removed", async () => {
    const admin = await h.signedInAdmin();
    await admin.upload("/api/admin/ui-logo", PNG);
    expect(await (await admin.get("/api/admin/qr-logo")).json()).toEqual({ set: false });

    expect((await admin.delete("/api/admin/ui-logo")).status).toBe(200);
    expect((await organizationOf()).uiLogo).toBeNull();
    expect(h.logoFiles.size).toBe(0);
  });
});

describe("a fresh installation", () => {
  it("is given its first settings with its first System Administrator", async () => {
    await h.run("DELETE FROM organization");
    expect((await organizationOf()).name).toBe("linkstead");

    const created = await h.client().post(
      "/api/bootstrap",
      {
        email: "first@example.edu",
        emailDomains: ["example.edu"],
        language: "vi",
        name: "Example College",
        timeZone: "Europe/Berlin"
      },
      { headers: bearer(BOOTSTRAP_TOKEN) }
    );
    expect(created.status).toBe(201);
    expect(await organizationOf()).toMatchObject({
      emailDomains: ["example.edu"],
      language: "vi",
      name: "Example College",
      timeZone: "Europe/Berlin"
    });
  });

  it("checks the first email against the domains it is given, and saves nothing it refuses", async () => {
    const attempt = await h
      .client()
      .post(
        "/api/bootstrap",
        { email: "first@example.org", emailDomains: ["example.edu"] },
        { headers: bearer(BOOTSTRAP_TOKEN) }
      );
    expect(await attempt.json()).toEqual({ error: "email-not-allowed" });
    expect(await organizationOf()).toEqual({ ...ORGANIZATION, uiLogo: null });
  });

  it("takes the Organization and its UI logo from an export", async () => {
    const admin = await h.signedInAdmin();
    await admin.put("/api/admin/settings", { name: "Moved University" });
    await admin.upload("/api/admin/ui-logo", PNG);
    const snapshot = await (await admin.get("/api/admin/export")).json();

    await h.reset();
    await h.run("DELETE FROM organization");
    await h.run("DELETE FROM units");
    const imported = await h.client().post("/api/admin/import", snapshot, { headers: bearer(BOOTSTRAP_TOKEN) });
    expect(imported.status).toBe(204);

    const organization = await organizationOf();
    expect(organization.name).toBe("Moved University");
    const served = await h.client().get(organization.uiLogo as string);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);
  });
});
