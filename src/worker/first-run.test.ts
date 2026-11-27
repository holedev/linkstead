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
    expect(await (await h.client().get("/api/bootstrap")).json()).toEqual({ needed: true, secretSet: true });
    await h.signedInAdmin();
    expect(await (await h.client().get("/api/bootstrap")).json()).toEqual({ needed: false, secretSet: true });
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
});
