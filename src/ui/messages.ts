import { ApiFailure } from "./api";
import { text } from "./i18n";
import { organization } from "./organization";

/**
 * The server answers with reasons, the UI with sentences. Each reason is worded once, in the
 * dictionaries (`i18n/`), so a new one the server starts sending shows up here as the fallback,
 * not as silence.
 */

const isReason = (value: unknown): value is { code: string; problem?: string } =>
  typeof value === "object" && value !== null && typeof (value as { code?: unknown }).code === "string";

/** The domains an address must be at, as a sentence names them. */
const allowedDomains = (): string =>
  organization()
    .emailDomains.map((domain) => `@${domain}`)
    .join(", ");

const messageOf = (error: unknown): string => {
  const t = text();
  // A plain `{ code, problem }` is a refusal the UI reached itself, with the server's own rule.
  if (error instanceof ApiFailure || isReason(error)) {
    if (error.code === "email-not-allowed") {
      return t.common.emailOnly(allowedDomains());
    }
    return t.problems[`${error.code}:${error.problem}`] ?? t.reasons[error.code] ?? t.common.errorWithCode(error.code);
  }
  return t.common.errorTryAgain;
};

export { messageOf };
