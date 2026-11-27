---
status: accepted
---

# Login is self-managed

linkstead keeps its own passwords, so an installation needs nothing from an identity provider to
start. An Account is known by its email and by nothing else - an address at one of the
Organization's email domains, or any address when it names none (ADR-0007) - so that signing in
through an organization's own provider (OIDC: Microsoft 365, Google, Keycloak) can be added later
and match people by email, with nobody added to their Unit again.

## Consequences

- There is no self sign-up and the system sends no mail. Someone already inside adds an email and
  passes on a one-time link for setting the password; a forgotten password goes the same way.
- Failed sign-ins are rate-limited per Account. There is no second factor.
- A password is stretched in the browser - PBKDF2-SHA256 through Web Crypto, 600,000 rounds, salted
  with the account's email - and the server stores a salted HMAC of the result. A stolen database
  is as slow to attack as if the server had done every round, but signing in costs the server one
  hash, which fits the CPU a request gets on the Workers Free plan. Hashing all of it on the server,
  at the 100,000 rounds the Workers runtime allows, measured about 13 ms against a 10 ms limit.
- The server therefore never sees a password, and cannot check its length: the browser does. What
  the browser sends stands in for the password and travels only over https. Signing in needs
  JavaScript, which the UI needs anyway.
- The salt begins with `ou-link:`, the project's first name. It stays: changing it would turn away
  every password already set.

## Considered Options

- **OIDC from the start** - not now. Every installation would need an application registered with
  a provider before its first sign-in, and the smallest ones have none.
