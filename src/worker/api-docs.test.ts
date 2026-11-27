import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, ORIGIN, startHarness } from "./test-harness";

let h: Awaited<ReturnType<typeof startHarness>>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.dispose());
beforeEach(() => h.reset());

type Document = {
  openapi: string;
  servers: { url: string }[];
  paths: Record<string, Record<string, { operationId: string; responses: Record<string, unknown> }>>;
};

const documentOf = async () => (await (await h.client().get("/api/openapi.json")).json()) as Document;

const operations = (document: Document) =>
  Object.entries(document.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({ method: method.toUpperCase(), operation, path }))
  );

describe("the API's description", () => {
  it("is public OpenAPI 3.1, pointing at the installation that serves it", async () => {
    const document = await documentOf();
    expect(document.openapi).toBe("3.1.0");
    expect(document.servers).toEqual([{ description: "Bản đang chạy", url: ORIGIN }]);
  });

  it("describes exactly the six things a Khóa API does, and nothing else", async () => {
    const ids = operations(await documentOf())
      .map(({ operation }) => operation.operationId)
      .sort();
    expect(ids).toEqual([
      "changeTarget",
      "createLink",
      "disableLink",
      "enableLink",
      "linkQr",
      "linkVisits",
      "listLinks"
    ]);
  });

  it("names only routes that answer a Khóa API, and the answers it documents", async () => {
    const admin = await h.signedInAdmin();
    const { key } = (await (await admin.post("/api/units/1/keys", { name: "CRM" })).json()) as { key: string };
    await admin.post("/api/links", { code: "cfp-2027", name: "Poster", target: "https://example.org/a", unitId: 1 });
    const bodies: Record<string, unknown> = {
      changeTarget: { target: "https://example.org/b" },
      createLink: { name: "Mới", target: "https://example.org/c" }
    };

    for (const { method, operation, path } of operations(await documentOf())) {
      const url = path.replace("{code}", "cfp-2027");
      const body = bodies[operation.operationId];
      const response =
        method === "GET"
          ? await h.client().get(url, { headers: bearer(key) })
          : await (method === "PUT" ? h.client().put : h.client().post)(url, body ?? {}, { headers: bearer(key) });
      expect([operation.operationId, Object.hasOwn(operation.responses, String(response.status))]).toEqual([
        operation.operationId,
        true
      ]);
    }
  });
});
