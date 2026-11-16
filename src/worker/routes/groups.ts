import type { Hono } from "hono";
import type { AppContext, AppDeps, AppEnv } from "../context";
import { positiveInt, readJson, text } from "../http";
import type { Store } from "../store";

const MAX_NAME = 100;

/**
 * The Đơn vị in the path, if a Thành viên of it is asking. A Nhóm only sorts Links, so whoever may
 * change the Links may sort them; a Khóa API may not - it is not one of the API's six things.
 */
const memberUnit = async (c: AppContext, store: Store): Promise<number | Response> => {
  const actor = c.get("actor");
  if (actor?.kind !== "account") {
    return c.json({ error: "not-signed-in" }, 401);
  }
  const unitId = positiveInt(c.req.param("unitId"));
  if (!(unitId && (await store.unitExists(unitId)))) {
    return c.json({ error: "unknown-unit" }, 404);
  }
  return (await store.findRole(actor.accountId, unitId)) ? unitId : c.json({ error: "forbidden" }, 403);
};

const readName = async (c: AppContext): Promise<string | null> => {
  const name = text((await readJson(c))?.name);
  return name && name.length <= MAX_NAME ? name : null;
};

const registerGroupRoutes = (app: Hono<AppEnv>, { store }: AppDeps) => {
  app.get("/api/units/:unitId/groups", async (c) => {
    const unitId = await memberUnit(c, store);
    if (unitId instanceof Response) {
      return unitId;
    }
    return c.json({ groups: await store.listGroups(unitId) });
  });

  app.post("/api/units/:unitId/groups", async (c) => {
    const unitId = await memberUnit(c, store);
    if (unitId instanceof Response) {
      return unitId;
    }
    const name = await readName(c);
    if (!name) {
      return c.json({ error: "bad-name" }, 422);
    }
    const group = await store.createGroup(unitId, name);
    return group ? c.json({ ...group, linkCount: 0 }, 201) : c.json({ error: "group-name-taken" }, 409);
  });

  app.put("/api/units/:unitId/groups/:groupId", async (c) => {
    const unitId = await memberUnit(c, store);
    if (unitId instanceof Response) {
      return unitId;
    }
    const name = await readName(c);
    if (!name) {
      return c.json({ error: "bad-name" }, 422);
    }
    const groupId = positiveInt(c.req.param("groupId"));
    const outcome = groupId ? await store.renameGroup(unitId, groupId, name) : "unknown";
    if (outcome === "unknown") {
      return c.json({ error: "unknown-group" }, 404);
    }
    return outcome === "done" ? c.json({ id: groupId, name }) : c.json({ error: "group-name-taken" }, 409);
  });

  /** Removes a Nhóm. Its Links stay as they are, in no Nhóm: nothing printed carries a Nhóm. */
  app.delete("/api/units/:unitId/groups/:groupId", async (c) => {
    const unitId = await memberUnit(c, store);
    if (unitId instanceof Response) {
      return unitId;
    }
    const groupId = positiveInt(c.req.param("groupId"));
    if (!(groupId && (await store.deleteGroup(unitId, groupId)))) {
      return c.json({ error: "unknown-group" }, 404);
    }
    return c.body(null, 204);
  });
};

export { registerGroupRoutes };
