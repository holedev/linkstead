/**
 * Where the System Administration dialog is open, written in the address: `?setup=<section>`, and
 * for one Unit `?setup=units&unit=<id>`. Kept apart from the dialog so the screens inside it can
 * link to each other without importing it.
 */

const SETUP_SECTIONS = ["organization", "language", "qr-logo", "units", "links", "admins", "codes", "export"] as const;
type SetupSection = (typeof SETUP_SECTIONS)[number];

const SETUP_PARAM = "setup";
const UNIT_PARAM = "unit";

const isSetupSection = (value: string | null): value is SetupSection => SETUP_SECTIONS.includes(value as SetupSection);

/** The query string that opens a section - or, for `units` with an id, one Unit. */
const setupSearch = (section: SetupSection, unitId?: number): string => {
  const params = new URLSearchParams({ [SETUP_PARAM]: section });
  if (unitId !== undefined) {
    params.set(UNIT_PARAM, String(unitId));
  }
  return `?${params.toString()}`;
};

export { isSetupSection, SETUP_PARAM, type SetupSection, setupSearch, UNIT_PARAM };
