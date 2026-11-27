---
status: accepted
---

# linkstead runs on Cloudflare Workers and stays portable

A Link that does not answer breaks everything printed with it, so linkstead runs where one machine
going down does not take it down: Cloudflare Workers, with D1 for data and R2 for logo files. The
Workers Free plan is enough for an organization's own links.

Cloudflare is the one supported way to run it, not the only possible one. An organization may need
to bring it onto its own servers later, so request handling must not depend on Workers-only APIs,
and the data must be exportable and re-importable whole.

## Consequences

- The app is written against two seams, `Store` and `LogoFiles` (`src/worker/store.ts`).
  `store-d1.ts` and `index.ts` are the only files that know about Cloudflare. Running elsewhere
  means writing those two again, not touching the handlers.
- A System Administrator can export the whole installation, and another installation can import
  it (`docs/export-and-import.md`).
- An installation's domain is printed on every QR, and a QR carrying a domain dies with it. Choose
  the domain before printing anything; a trial on a temporary domain should print nothing.

## Considered Options

- **A Node server with SQLite** - not supported in this version. It would be easier for some to
  host, but every test and every release would have to cover two runtimes, and the country of a
  Visit and the daily safety check would need their own way in. The seams keep it possible.
- **Cloudflare-only, using Workers APIs freely** - rejected: it would close the way back to an
  organization's own servers.
