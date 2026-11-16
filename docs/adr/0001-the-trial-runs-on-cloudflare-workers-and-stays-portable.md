---
status: accepted
---

# The trial runs on Cloudflare Workers and stays portable

OU Link is meant for the whole university and is expected to be taken over by the university's IT
office, which runs its own servers. The first version nevertheless runs on Cloudflare Workers,
because a server that is down takes every printed QR in the university down with it and the trial
should not depend on one machine. So that the move back remains possible, request handling must not
depend on Workers-only APIs, and the data must be exportable and re-importable whole.

## Consequences

- The trial runs on a temporary domain. Every Link created during it is disposable, and **no QR is
  printed** until the university's own domain is in place - a QR carrying the temporary domain dies
  with it, which is the failure this system exists to prevent.
- Whether a subdomain of `ou.edu.vn` can be attached to Workers at all is unverified and depends on
  how the university manages its DNS. It must be confirmed with the IT office before the official
  domain is promised on Cloudflare.
