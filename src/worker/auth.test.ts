import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BOOTSTRAP_TOKEN, bearer, ORIGIN, passwordKey, startHarness, tokenOf } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const PASSWORD = "mat-khau-du-dai";

describe("the first Quản trị hệ thống", () => {
  it("is created once, by whoever holds the deploy secret", async () => {
    const anyone = h.client();

    expect((await anyone.post("/api/bootstrap", { email: "a@ou.edu.vn" })).status).toBe(403);
    expect((await anyone.post("/api/bootstrap", { email: "a@ou.edu.vn" }, { headers: bearer("wrong") })).status).toBe(
      403
    );

    const created = await anyone.post("/api/bootstrap", { email: "A@ou.edu.vn" }, { headers: bearer(BOOTSTRAP_TOKEN) });
    expect(created.status).toBe(201);
    expect(((await created.json()) as { setupUrl: string }).setupUrl).toContain(`${ORIGIN}/app/setup?token=`);

    // The door shuts for good once one exists - the secret alone no longer makes administrators.
    const again = await anyone.post("/api/bootstrap", { email: "b@ou.edu.vn" }, { headers: bearer(BOOTSTRAP_TOKEN) });
    expect(again.status).toBe(409);
  });

  it("must have a university address", async () => {
    const response = await h
      .client()
      .post("/api/bootstrap", { email: "a@gmail.com" }, { headers: bearer(BOOTSTRAP_TOKEN) });
    expect(response.status).toBe(422);
  });

  it("manages both Đơn vị the trial starts with", async () => {
    const admin = await h.signedInAdmin();
    const me = (await (await admin.get("/api/auth/me")).json()) as { isSystemAdmin: boolean; units: unknown[] };

    expect(me.isSystemAdmin).toBe(true);
    expect(me.units).toEqual([
      { role: "manager", unitId: 1, unitName: "Tạp chí Khoa học" },
      { role: "manager", unitId: 2, unitName: "Nhà xuất bản" }
    ]);
  });
});

describe("the one-time password link", () => {
  const issue = async () => {
    const created = await h
      .client()
      .post("/api/bootstrap", { email: "a@ou.edu.vn" }, { headers: bearer(BOOTSTRAP_TOKEN) });
    return tokenOf(((await created.json()) as { setupUrl: string }).setupUrl);
  };

  it("sets a password from the browser's stretched value, and works once", async () => {
    const token = await issue();
    const browser = h.client();
    // A raw password is refused: the server only ever takes what the browser stretched.
    const raw = await browser.post("/api/auth/setup", { passwordKey: PASSWORD, token });
    expect(raw.status).toBe(422);
    expect(await raw.json()).toEqual({ error: "bad-password-key" });
    expect((await browser.post("/api/auth/setup", { password: PASSWORD, token })).status).toBe(422);

    expect((await browser.setup(token, "a@ou.edu.vn", PASSWORD)).status).toBe(204);
    expect((await browser.setup(token, "a@ou.edu.vn", "mot-mat-khau-khac")).status).toBe(400);
    expect((await browser.login("a@ou.edu.vn", PASSWORD)).status).toBe(200);
  });

  it("tells the holder of a live link whose password it sets, and nobody else", async () => {
    const token = await issue();
    const browser = h.client();
    expect(await (await browser.post("/api/auth/setup/account", { token })).json()).toEqual({ email: "a@ou.edu.vn" });
    expect((await browser.post("/api/auth/setup/account", { token: "khong-co" })).status).toBe(400);
    expect((await browser.post("/api/auth/setup/account", {})).status).toBe(400);

    await browser.setup(token, "a@ou.edu.vn", PASSWORD);
    expect((await browser.post("/api/auth/setup/account", { token })).status).toBe(400);
  });

  it("stores neither the password nor what the browser sent", async () => {
    const token = await issue();
    await h.client().setup(token, "a@ou.edu.vn", PASSWORD);
    const row = await h.db.prepare("SELECT password_hash AS hash FROM accounts").first<{ hash: string }>();

    expect(row?.hash.startsWith("stretched-hmac-sha256$")).toBe(true);
    expect(row?.hash).not.toContain(PASSWORD);
    expect(row?.hash).not.toContain(await passwordKey("a@ou.edu.vn", PASSWORD));
  });

  it("expires after seven days", async () => {
    const token = await issue();
    h.advance(7 * DAY);
    expect((await h.client().setup(token, "a@ou.edu.vn", PASSWORD)).status).toBe(400);
  });

  it("refuses a token nobody issued", async () => {
    expect((await h.client().setup("khong-co", "a@ou.edu.vn", PASSWORD)).status).toBe(400);
    expect(
      (await h.client().post("/api/auth/setup", { passwordKey: await passwordKey("a@ou.edu.vn", PASSWORD) })).status
    ).toBe(400);
  });
});

describe("signing in", () => {
  it("answers a wrong password and an unknown address identically", async () => {
    await h.signedInAdmin("a@ou.edu.vn", PASSWORD);
    const browser = h.client();

    const wrong = await browser.login("a@ou.edu.vn", "sai-mat-khau-roi");
    const unknown = await browser.login("khong-ai@ou.edu.vn", PASSWORD);

    expect([wrong.status, await wrong.text()]).toEqual([unknown.status, await unknown.text()]);
    expect(wrong.status).toBe(401);
  });

  it("keeps a session in an http-only cookie, and ends it on sign-out", async () => {
    const admin = await h.signedInAdmin("a@ou.edu.vn", PASSWORD);
    expect((await admin.get("/api/auth/me")).status).toBe(200);

    const login = await h.client().login("a@ou.edu.vn", PASSWORD);
    const cookie = login.headers.getSetCookie()[0] ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");

    expect((await admin.post("/api/auth/logout")).status).toBe(204);
    expect((await admin.get("/api/auth/me")).status).toBe(401);
  });

  it("ends a session after seven days", async () => {
    const admin = await h.signedInAdmin("a@ou.edu.vn", PASSWORD);
    h.advance(7 * DAY);
    expect((await admin.get("/api/auth/me")).status).toBe(401);
  });

  it("locks the account for fifteen minutes after five wrong passwords", async () => {
    await h.signedInAdmin("a@ou.edu.vn", PASSWORD);
    const attacker = h.client();
    for (let i = 0; i < 5; i += 1) {
      expect(
        (await attacker.post("/api/auth/login", { email: "a@ou.edu.vn", password: `doan-lan-thu-${i}` })).status
      ).toBe(401);
    }

    // Locked means locked: the right password does not get through either.
    expect((await attacker.login("a@ou.edu.vn", PASSWORD)).status).toBe(429);

    h.advance(15 * MINUTE);
    expect((await attacker.login("a@ou.edu.vn", PASSWORD)).status).toBe(200);
  });

  it("forgets earlier wrong passwords once the right one is given", async () => {
    await h.signedInAdmin("a@ou.edu.vn", PASSWORD);
    const browser = h.client();
    for (let round = 0; round < 3; round += 1) {
      for (let i = 0; i < 4; i += 1) {
        await browser.login("a@ou.edu.vn", "sai-mat-khau-roi");
      }
      expect((await browser.login("a@ou.edu.vn", PASSWORD)).status).toBe(200);
    }
  });

  it("refuses a write another site made the browser send", async () => {
    const admin = await h.signedInAdmin("a@ou.edu.vn", PASSWORD);
    const forged = await admin.post("/api/auth/logout", undefined, { headers: { origin: "https://evil.example" } });

    expect(forged.status).toBe(403);
    expect((await admin.get("/api/auth/me")).status).toBe(200);
  });
});
