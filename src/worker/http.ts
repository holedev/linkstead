import type { AppContext } from "./context";

/** The body as a plain object, or null when it is not JSON or not an object. Never throws. */
const readJson = async (c: AppContext): Promise<Record<string, unknown> | null> => {
  try {
    const body: unknown = await c.req.json();
    return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** A positive integer from a path or query string, or null. */
const positiveInt = (value: string | undefined): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export { positiveInt, readJson, text };
