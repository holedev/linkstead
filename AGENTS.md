# AGENTS.md

OU Link gives Ho Chi Minh City Open University permanent links and QR codes under its own domain,
whose destination can change after they have been printed. Read these before changing anything:

- [CONTEXT.md](CONTEXT.md) - the vocabulary. Use its terms in code, UI text and commit messages, and
  do not introduce a synonym it lists under _Avoid_.
- [docs/adr/](docs/adr/) - the decisions that are hard to reverse, and why they were made.

## The rules the design rests on

These were decided before the first line of code. Each is a rule, not a default.

**Links**

- A Link is permanent: its Mã link is never changed, never reused and never deleted. A Link can
  only be switched off (ADR-0002).
- One flat namespace for the whole university. A Mã link is lowercase unaccented letters, digits
  and hyphens, 3 to 50 characters, matched case-insensitively. A generated one is 6 characters and
  avoids look-alikes (`0`/`o`, `1`/`l`).
- Mã dành riêng cover the system's own paths (`app`, `api`, ...) and names only a Quản trị hệ thống
  may hand out.
- A Link has exactly one Đích at a time: any `https` address that does not point back at this
  system. No expiry, no schedule, no per-device target.
- Changing a Đích goes through a confirmation showing the old and the new one, and is logged with
  who made it. Every Thành viên of the owning Đơn vị can read that history.
- An open Link answers with a **temporary** redirect - a permanent one is cached by browsers and
  keeps sending people to the old Đích. An unknown Mã link and a Link bị tắt both show a notice
  page, in Vietnamese and English; neither falls back to a home page.

**QR**

- A QR always carries the Link, never the Đích.
- The logo is chosen at three levels, the lower winning: the university's logo for the whole
  system, a Đơn vị's own default, and a per-Link choice which may also be "none". The per-Link
  choice is stored so a later download gives the same picture.
- The system decides the logo's size and position (centred, white backing, at most about a fifth of
  the width) and raises error correction to the highest level whenever a logo is present. Nobody
  can tune these.
- Uploaded logos are PNG or JPEG. **Never SVG** - it can carry script and would be served back
  under the university's domain.
- The server renders SVG, and the API returns only SVG. PNG is made in the browser from that SVG.

**People**

- A Link belongs to a Đơn vị, never to a person. The first two Đơn vị are Tạp chí Khoa học and Nhà
  xuất bản; others are added later.
- An Account is an `@ou.edu.vn` email. It may be in several Đơn vị; in none, it can create nothing.
- A Đơn vị always has at least one Quản lý đơn vị.
- A Quản trị hệ thống may switch off any Link and move a Link between Đơn vị. A Link they switched
  off only they switch back on. A Đơn vị that still owns Links cannot be dissolved.
- Login is self-managed for now (ADR-0003).

**API**

- A Khóa API belongs to a Đơn vị and acts on that Đơn vị's Links only.
- The API does six things: create a Link, change its Đích, switch it off and on, list a Đơn vị's
  Links, read Lượt mở, return a QR. Accounts, Đơn vị and keys are managed in the UI only - putting
  them in the API would widen what a leaked key can do.
- Every change made through the API is logged under the key that made it. Calls are rate-limited
  per key.

**Lượt mở**

- Counted per Link per day and kept forever. Nothing about the visitor is stored - no IP, no
  device.
- Openings made by preview fetchers (Zalo, Facebook, Messenger) are skipped where recognisable, and
  the UI presents the number as an estimate.

**Data**

- A Đơn vị can download its Links and Lượt mở as CSV. A Quản trị hệ thống can export everything in
  a form another installation can import - ADR-0001 requires it from the first version.

## Where it runs

Cloudflare Workers, as a trial (ADR-0001): one Worker, Hono for the API and the redirect, a React
UI built with Vite and served as static files under `/app`, D1 through Drizzle, R2 for logo files.
Request handling must not depend on Workers-only APIs, so it can move to the university's servers.

The trial runs on a temporary domain. **No QR is printed until the official domain exists.**

The admin UI is Vietnamese only.

## Commands

- `pnpm dev` - the Worker on a local D1 (`wrangler dev`). It serves the UI as last built, so run
  `pnpm build:ui` first
- `pnpm dev:ui` - the UI from Vite with hot reload, calling the Worker started by `pnpm dev`
- `pnpm deploy` - builds the UI, then deploys
- `pnpm db:generate` - a migration from `src/db/schema.ts`; `pnpm db:migrate:local` applies them locally,
  `pnpm db:migrate:remote` to the trial database
- `pnpm test` / `pnpm check-types` / `pnpm lint:check`

## What answers today

Everything under `/api` speaks JSON. A person is recognised by the session cookie, an application
by `Authorization: Bearer <Khóa API>`; a route says which of the two it accepts.

| Route | Who | Does |
| --- | --- | --- |
| `GET /:code` | anyone | opens a Link, or shows a notice page |
| `POST /api/bootstrap` | holder of `BOOTSTRAP_TOKEN` | creates the first Quản trị hệ thống, once |
| `POST /api/auth/setup` | holder of a one-time link | sets a password |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | a person | the session |
| `POST /api/units/:unitId/members` | Quản lý đơn vị | adds a Thành viên, returns their one-time link |
| `POST /api/units/:unitId/members/password-setup` | Quản lý đơn vị | a fresh one-time link |
| `POST /api/units/:unitId/keys`, `DELETE /api/units/:unitId/keys/:keyId` | Quản lý đơn vị | issues and revokes a Khóa API |
| `POST /api/links`, `GET /api/links` | a Thành viên, or a Khóa API | creates a Link, lists a Đơn vị's Links |
| `GET /api/units/:unitId/members`, `GET /api/units/:unitId/keys` | Quản lý đơn vị | lists them - never a password hash, never a key |
| `GET /app/*` | anyone | the UI |

Not built yet: changing a Đích, switching a Link off and on, reading Lượt mở, QR and logos,
exports, and the per-key rate limit - in the API and in the UI alike.

**Starting a fresh deployment.** Set the secret, create the administrator, then remove the secret:

1. `wrangler secret put BOOTSTRAP_TOKEN`
2. `POST /api/bootstrap` with `Authorization: Bearer <that secret>` and `{"email": "...@ou.edu.vn"}`.
   The answer carries the one-time link. It works only while no Quản trị hệ thống exists.
3. `wrangler secret delete BOOTSTRAP_TOKEN`

**Passwords cost CPU.** Hashing one takes more than the 10 ms a request gets on the Workers Free
plan, so signing in and setting a password need Workers Paid. Opening a Link does not.

## Layout

- `src/domain/` - the rules, pure and tested: what a Mã link may be, what a Đích may be, what
  counts as a Lượt mở. No I/O.
- `src/worker/app.tsx` and `src/worker/routes/` - the request handling, written against the
  `Store` in `store.ts` and nothing Cloudflare-specific. `store-d1.ts` and `index.ts` are the only
  files that know about Workers; that seam is ADR-0001.
- `src/worker/actor.ts` - works out who is asking. It refuses nothing but a cross-site write; each
  route decides what it needs.
- `src/worker/test-harness.ts` - runs the app against a real local D1 with the real migrations, so
  the tests exercise the SQL the Worker runs.
- `src/ui/` - the admin UI: React, built by Vite into `dist/client/app` and served by the Worker
  under `/app`. Vietnamese only. `api.ts` is the one place it talks to the server, and
  `messages.ts` the one place a server reason becomes a sentence. It has its own `tsconfig.json`
  because it is browser code and the Worker is not.
- `src/db/schema.ts` - the whole model of the first version.

## Conventions

The same as `hcmcoujs-turborepo`, whose maintainer is the same person:

- pnpm, Node 22 (`mise.toml`).
- Biome through ultracite. Two-space indent, 120 columns, double quotes, no trailing commas.
- Conventional commits, enforced by commitlint: `type(scope): subject`, lowercase imperative
  subject, header at most 100 characters, body lines wrapped at 100.
- Verify by running the binaries directly (`./node_modules/.bin/<tool>`) and reading the exit code.
