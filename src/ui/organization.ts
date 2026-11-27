import { DEFAULT_SETTINGS } from "../domain/organization";
import type { Organization } from "./api";

/**
 * The Organization the installation serves, as the UI learned it when the page opened. Read once,
 * before the first screen (`main.tsx`): its name, language, colour and time zone change rarely,
 * and a System Administrator who changes them sees the change on the next page load.
 */

const FALLBACK: Organization = { ...DEFAULT_SETTINGS, hourlyVisits: false, uiLogo: null };

let current: Organization = FALLBACK;

const HEX_COLOR = /^#[0-9a-f]{6}$/;

/**
 * Paints the UI in the Organization's colour: the sidebar, the primary action, the focus ring.
 * Everything else in `styles.css` follows from these. The rest of the palette stays neutral.
 */
const applyBrand = (next: Organization) => {
  const color = HEX_COLOR.test(next.brandColor) ? next.brandColor : DEFAULT_SETTINGS.brandColor;
  const root = document.documentElement.style;
  root.setProperty("--org", color);
  document.title = next.name;
  document.querySelector("meta[name='theme-color']")?.setAttribute("content", color);
  if (next.uiLogo) {
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.href = next.uiLogo;
    document.head.append(icon);
  }
};

const setOrganization = (next: Organization) => {
  current = next;
  applyBrand(next);
};

const organization = (): Organization => current;

/** An address to show as an example in an email field: at the Organization's first domain. */
const exampleEmail = (): string => `name@${current.emailDomains[0] ?? "example.org"}`;

export { exampleEmail, FALLBACK as FALLBACK_ORGANIZATION, organization, setOrganization };
