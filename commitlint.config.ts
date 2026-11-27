import type { UserConfig } from "@commitlint/types";

// The same rules as hcmcoujs-turborepo, minus the mandatory workspace scope: this repository is
// one package, so a scope names an area (`qr`, `api`) when it helps and is left out when it does not.
const config: UserConfig = {
  extends: ["@commitlint/config-conventional"]
};

export default config;
