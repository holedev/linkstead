/** A Tài khoản is its university email and nothing else (CONTEXT.md, ADR-0003). */

const UNIVERSITY_DOMAIN = "ou.edu.vn";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

/**
 * Whether an address may become a Tài khoản. Exactly the university's domain - not a subdomain,
 * and not a look-alike that merely ends with the same letters (`evil-ou.edu.vn`).
 */
const isUniversityEmail = (raw: string): boolean => {
  const email = normalizeEmail(raw);
  return EMAIL_PATTERN.test(email) && email.endsWith(`@${UNIVERSITY_DOMAIN}`);
};

export { isUniversityEmail, normalizeEmail };
