import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BOOTSTRAP_TOKEN, bearer, passwordKey, startHarness } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const EMAIL = "first@example.org";
const PASSWORD = "mot-mat-khau-du-dai";

describe("the first-run screen", () => {
  it("is offered while there is no System Administrator, and closes once there is one", async () => {
    expect(await (await h.client().get("/api/bootstrap")).json()).toEqual({
      hasUnits: true,
      needed: true,
      secretSet: true
    });
    await h.signedInAdmin();
    expect(await (await h.client().get("/api/bootstrap")).json()).toEqual({
      hasUnits: true,
      needed: false,
      secretSet: true
    });
  });

  it("sets the first administrator's password and signs them in at once", async () => {
    const browser = h.client();
    const created = await browser.post(
      "/api/bootstrap",
      { email: EMAIL, name: "First University", passwordKey: await passwordKey(EMAIL, PASSWORD) },
      { headers: bearer(BOOTSTRAP_TOKEN) }
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ email: EMAIL, isSystemAdmin: true });

    // Signed in by that answer: no one-time link to open first.
    expect(await (await browser.get("/api/auth/me")).json()).toMatchObject({ email: EMAIL, isSystemAdmin: true });
    // And the password works from another browser.
    expect((await h.client().login(EMAIL, PASSWORD)).status).toBe(200);
    expect(await (await h.client().get("/api/organization")).json()).toMatchObject({ name: "First University" });
  });

  it("asks for the deploy secret, so whoever reaches a fresh installation first cannot take it", async () => {
    const attempt = await h
      .client()
      .post(
        "/api/bootstrap",
        { email: EMAIL, passwordKey: await passwordKey(EMAIL, PASSWORD) },
        { headers: bearer("a-guess") }
      );
    expect(attempt.status).toBe(403);
    expect(await (await h.client().get("/api/bootstrap")).json()).toMatchObject({ needed: true });
  });

  it("refuses a password the browser did not stretch, and creates nothing", async () => {
    const attempt = await h
      .client()
      .post("/api/bootstrap", { email: EMAIL, passwordKey: PASSWORD }, { headers: bearer(BOOTSTRAP_TOKEN) });
    expect(await attempt.json()).toEqual({ error: "bad-password-key" });
    expect(await (await h.client().get("/api/bootstrap")).json()).toMatchObject({ needed: true });
  });

  describe("on an installation with no Unit yet", () => {
    beforeEach(() => h.run("DELETE FROM units"));

    const bootstrap = async (body: Record<string, unknown>) => {
      const browser = h.client();
      const created = await browser.post(
        "/api/bootstrap",
        { email: EMAIL, name: "First University", passwordKey: await passwordKey(EMAIL, PASSWORD), ...body },
        { headers: bearer(BOOTSTRAP_TOKEN) }
      );
      return { browser, created };
    };

    it("says so, so the screen asks what the first Unit is called", async () => {
      expect(await (await h.client().get("/api/bootstrap")).json()).toMatchObject({ hasUnits: false });
    });

    it("creates the first Unit under the name given, managed by the first administrator", async () => {
      const { browser, created } = await bootstrap({ unitName: "  Office of Communications " });
      expect(created.status).toBe(201);
      expect(await created.json()).toMatchObject({
        units: [{ role: "manager", unitName: "Office of Communications" }]
      });
      expect(await (await browser.get("/api/auth/me")).json()).toMatchObject({
        units: [{ role: "manager", unitName: "Office of Communications" }]
      });
    });

    it("names it after the Organization when no name is given, as from a script", async () => {
      const { created } = await bootstrap({});
      expect(await created.json()).toMatchObject({ units: [{ role: "manager", unitName: "First University" }] });
    });

    it("refuses a name too long for a Unit, and creates nothing", async () => {
      const { created } = await bootstrap({ unitName: "x".repeat(101) });
      expect(await created.json()).toEqual({ error: "bad-name" });
      expect(await (await h.client().get("/api/bootstrap")).json()).toMatchObject({ hasUnits: false, needed: true });
    });
  });

  it("creates no Unit when there is one already, and makes the administrator manager of each", async () => {
    const created = await h
      .client()
      .post(
        "/api/bootstrap",
        { email: EMAIL, passwordKey: await passwordKey(EMAIL, PASSWORD), unitName: "Ignored" },
        { headers: bearer(BOOTSTRAP_TOKEN) }
      );
    const { units } = (await created.json()) as { units: { unitName: string }[] };
    expect(units.map((unit) => unit.unitName)).not.toContain("Ignored");
    expect(units).toHaveLength(2);
  });
});
