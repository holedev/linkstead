import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { dailyVisits, links } from "../db/schema";
import type { Store } from "./store";

/** The Cloudflare D1 implementation of `Store`. The only file here that knows about D1. */
const createD1Store = (database: D1Database): Store => {
  const db = drizzle(database);

  return {
    findLinkByCode: async (code) => {
      const row = await db
        .select({ enabled: links.enabled, id: links.id, target: links.target })
        .from(links)
        .where(eq(links.code, code))
        .get();
      return row ?? null;
    },

    recordVisit: async (linkId, day) => {
      await db
        .insert(dailyVisits)
        .values({ count: 1, day, linkId })
        .onConflictDoUpdate({
          set: { count: sql`${dailyVisits.count} + 1` },
          target: [dailyVisits.linkId, dailyVisits.day]
        });
    }
  };
};

export { createD1Store };
