import { api } from "./api";
import { setLanguage } from "./i18n";
import { FALLBACK_ORGANIZATION, setOrganization } from "./organization";
import "./styles.css";

/**
 * The UI's first step: learn which Organization this is - its language, colour, name and time
 * zone - and only then load the screens, so every word they hold is already in its language.
 * An installation that cannot be reached still opens, in English and the default colour, and
 * says so on the screen that needed the server.
 */
const start = async () => {
  const organization = await api.organization().catch(() => FALLBACK_ORGANIZATION);
  setOrganization(organization);
  setLanguage(organization.language);
  const { renderApp } = await import("./root");
  renderApp();
};

start();
