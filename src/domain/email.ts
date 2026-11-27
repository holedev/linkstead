/** An Account is an email address and nothing else (CONTEXT.md, ADR-0003). */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

/**
 * Whether an address may become an Account of an Organization that allows these domains. Exactly
 * one of the domains - not a subdomain, and not a look-alike that merely ends with the same
 * letters (`evil-example.org`). No domains means any well-formed address.
 */
const isAllowedEmail = (raw: string, domains: readonly string[]): boolean => {
  const email = normalizeEmail(raw);
  if (!EMAIL_PATTERN.test(email)) {
    return false;
  }
  return domains.length === 0 || domains.some((domain) => email.endsWith(`@${domain}`));
};

export { isAllowedEmail, normalizeEmail };
