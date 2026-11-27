/** The rules of a Target (CONTEXT.md): any `https` address that does not point back at this system. */

const MAX_LENGTH = 2048;

type TargetProblem = "not-a-url" | "not-https" | "points-at-self" | "too-long";

/**
 * Why an address cannot be a Target, or null when it can.
 *
 * `ownHosts` are the hostnames this installation answers on. A Link aimed at them would loop, or
 * dress one Link up as another.
 */
const checkTarget = (raw: string, ownHosts: readonly string[]): TargetProblem | null => {
  const value = raw.trim();
  if (value.length > MAX_LENGTH) {
    return "too-long";
  }
  if (!URL.canParse(value)) {
    return "not-a-url";
  }
  const url = new URL(value);
  if (url.protocol !== "https:") {
    return "not-https";
  }
  if (ownHosts.some((host) => host.toLowerCase() === url.hostname.toLowerCase())) {
    return "points-at-self";
  }
  return null;
};

export { checkTarget, type TargetProblem };
