# AGENTS.md

OU Link gives Ho Chi Minh City Open University permanent links and QR codes under its own domain,
whose destination can change after they have been printed. Read these before changing anything:

- [CONTEXT.md](CONTEXT.md) - the vocabulary. Use its terms in code, UI text and commit messages, and
  do not introduce a synonym it lists under _Avoid_.
- [docs/adr/](docs/adr/) - the decisions that are hard to reverse, and why they were made.

## The rules the design rests on

These were decided before the first line of code. Each is a rule, not a default.

**Links**

- A Link's Mã link is never changed and never reused (ADR-0002). A Link can be switched off,
  archived (hidden from the list, still opens) or deleted. Deleting keeps the row, so the code stays
  taken for good. Only a Quản lý đơn vị or a Quản trị hệ thống deletes, and never through the API
  (ADR-0004).
- One flat namespace for the whole university. A Mã link is lowercase unaccented letters, digits
  and hyphens, 3 to 50 characters, matched case-insensitively. A generated one is 6 characters and
  avoids look-alikes (`0`/`o`, `1`/`l`).
- Mã dành riêng cover the system's own paths (`app`, `api`, ...) and names only a Quản trị hệ thống
  may hand out.
- A Link has exactly one Đích at a time: any `https` address that does not point back at this
  system and that Google Safe Browsing does not list as unsafe. No expiry, no schedule, no
  per-device target. Every Đích is checked again daily. A Link whose Đích is newly listed shows
  visitors a warning instead of redirecting (`worker/safety.ts`).
- Changing a Đích goes through a confirmation showing the old and the new one, and is logged with
  who made it. Every Thành viên of the owning Đơn vị can read that history.
- An open Link answers with a **temporary** redirect - a permanent one is cached by browsers and
  keeps sending people to the old Đích. An unknown Mã link, a Link bị tắt and a Link đã xóa show a
  notice page, in Vietnamese and English; none falls back to a home page.

**QR**

- A QR always carries the Link, never the Đích.
- The logo is chosen at three levels, the lower winning: the university's logo for the whole
  system, a Đơn vị's own default, and a per-Link choice which may also be "none". The per-Link
  choice is stored so a later download gives the same picture.
- The system decides the logo's box (centred, white backing, at most about a fifth of the width)
  and raises error correction to the highest level whenever a logo is present. Nobody can tune
  these. Inside that box a Link may shrink its logo, from 40% to 100% of the box, stored with the
  Link - the box, and so what the code needs, never changes.
- Uploaded logos are PNG or JPEG. **Never SVG** - it can carry script and would be served back
  under the university's domain.
- The server renders SVG, and the API returns only SVG. PNG is made in the browser from that SVG.

**People**

- A Link belongs to a Đơn vị, never to a person. The first two Đơn vị are Tạp chí Khoa học and Nhà
  xuất bản; others are added later.
- An Account is an `@ou.edu.vn` email. It may be in several Đơn vị; in none, it can create nothing.
- A Đơn vị always has at least one Quản lý đơn vị.
- A Quản trị hệ thống may switch off any Link and move a Link between Đơn vị. A Link they switched
  off only they switch back on. A Đơn vị that still owns Links cannot be dissolved;
  it can be merged into another, which takes its Links, members and Khóa API.
- Login is self-managed for now (ADR-0003).

**API**

- A Khóa API belongs to a Đơn vị and acts on that Đơn vị's Links only.
- The API does six things: create a Link, change its Đích, switch it off and on, list a Đơn vị's
  Links, read Lượt mở, return a QR. Accounts, Đơn vị and keys are managed in the UI only - putting
  them in the API would widen what a leaked key can do.
- Every change made through the API is logged under the key that made it. Calls are rate-limited
  per key.

**Lượt mở**

- Counted per Link per day, and per day by country and by referring site (host only), and kept
  forever. Nothing identifying the visitor is stored - no IP, no device, no full address
  (ADR-0005).
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
- `pnpm deploy` - builds the UI, then deploys. A push to `main` does this by itself through
  `.github/workflows/deploy.yml`, after lint, types and tests pass and migrations are applied
- `pnpm db:generate` - a migration from `src/db/schema.ts`; `pnpm db:migrate:local` applies them locally,
  `pnpm db:migrate:remote` to the trial database
- `pnpm test` / `pnpm check-types` / `pnpm lint:check`

## What answers today

Everything under `/api` speaks JSON. A person is recognised by the session cookie, an application
by `Authorization: Bearer <Khóa API>`; a route says which of the two it accepts.

| Route | Who | Does |
| --- | --- | --- |
| `GET /:code` | anyone | opens a Link, counting it by day, country and referring site; or shows a notice page naming the address opened (`worker/notice.tsx`) - a warning with the Đích for a Link whose Đích is listed unsafe; a preview fetcher (Zalo, Facebook...) gets a page of Open Graph tags instead of the redirect (`domain/preview.ts`) |
| `GET /` | anyone | what OU Link is, and the way in to `/app` (`worker/landing.tsx`); a notice page links here but never falls back to it |
| `GET /robots.txt` | anyone | keeps crawlers out of `/app` and `/api` |
| `GET /app/*` | anyone | the UI |
| `POST /api/bootstrap` | holder of `BOOTSTRAP_TOKEN` | creates the first Quản trị hệ thống, once |
| `POST /api/auth/setup/account`, `POST /api/auth/setup` | holder of a one-time link | says whose link it is; sets a password |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | a person | the session |
| `POST /api/links`, `GET /api/links` | a Thành viên, or a Khóa API | creates a Link, lists a Đơn vị's Links |
| `PUT /api/links/:code/target` | a Thành viên, or a Khóa API | changes the Đích, logged |
| `POST /api/links/:code/disable`, `.../enable` | a Thành viên, a Khóa API, or a Quản trị hệ thống | switches a Link off and on, logged |
| `GET /api/links/:code/visits`, `GET /api/links/:code/qr` | a Thành viên, or a Khóa API | Lượt mở per day, country and referring site; the QR as SVG, `?style=` one of the fixed looks in `domain/qr-style.ts` |
| `GET /api/links/:code/history` | a Thành viên | every change of Đích, state and Đơn vị |
| `POST /api/links/:code/archive`, `.../unarchive` | a Thành viên | puts a Link away from the list, or back; it keeps opening |
| `DELETE /api/links/:code` | Quản lý đơn vị, or a Quản trị hệ thống | deletes a Link, with `{"confirmCode"}` the Mã link typed back; the code stays taken (ADR-0004) |
| `GET /api/units/:unitId/visits?days=` | a Thành viên | the Đơn vị's Lượt mở at a glance: per day, most opened Links, countries, referring sites |
| `PUT /api/links/:code/details`, `PUT /api/links/:code/qr-logo` | a Thành viên | rewords Tên link and note; the Link's logo choice |
| `PUT /api/links/:code/group`, `/api/units/:unitId/groups...` | a Thành viên | sorts a Link into a Nhóm; makes, renames and deletes the Đơn vị's Nhóm |
| `GET`, `PUT /api/links/:code/preview` | a Thành viên | the share preview: what the Đích says, and the Link's own title, description and image |
| `GET /api/units/:unitId/links.csv`, `.../visits.csv`, `.../visit-sources.csv` | a Thành viên | the Đơn vị's CSV downloads |
| `/api/units/:unitId/members...`, `.../keys...`, `.../qr-logo`, `.../qr-preview` | Quản lý đơn vị | members and their roles, Khóa API, the Đơn vị's logo |
| `/api/admin/admins`, `/units`, `/reserved-codes`, `/links...`, `/qr-logo`, `/export` | Quản trị hệ thống | other administrators, Đơn vị, Mã dành riêng, any Link (find, move, hand out a reserved code), the university's logo, the whole export |
| `GET /api/openapi.json`, `GET /app/api-docs` | anyone | the Khóa API's six operations as OpenAPI 3.1 (`worker/openapi.ts`), and the Swagger page that reads it |
| `POST /api/admin/import` | holder of `BOOTSTRAP_TOKEN` | takes an export into an unused installation (`docs/export-and-import.md`) |

A Khóa API is refused past 120 calls a minute. A Quản trị hệ thống outside a Đơn vị can switch its
Links off and on and move them, but cannot change a Đích or read a history.

**Checking every Đích.** With the secret `SAFE_BROWSING_KEY` set (a Google Safe Browsing key), a
new or changed Đích that Google lists as unsafe is refused, and the Worker's daily cron
(`wrangler.jsonc`) checks every Đích again. Without the key, nothing is checked.

**Starting a fresh deployment.** Set the secret, create the administrator, then remove the secret:

1. `wrangler secret put BOOTSTRAP_TOKEN`
2. `POST /api/bootstrap` with `Authorization: Bearer <that secret>` and `{"email": "...@ou.edu.vn"}`.
   The answer carries the one-time link. It works only while no Quản trị hệ thống exists.
3. `wrangler secret delete BOOTSTRAP_TOKEN`

**Passwords are stretched in the browser** (ADR-0003, `src/domain/password.ts`): the server is
sent the stretched value and stores a salted HMAC of it, so signing in fits the Workers Free plan.
The API's `passwordKey` is that value, never the password.

## Layout

- `src/domain/` - the rules, pure and tested: what a Mã link may be, what a Đích may be, what
  counts as a Lượt mở, how a QR is drawn, what a logo may be, how a password is stretched. No I/O.
- `src/worker/app.tsx` and `src/worker/routes/` - the request handling, written against the
  `Store` in `store.ts` and nothing Cloudflare-specific. `store-d1.ts` and `index.ts` are the only
  files that know about Workers (D1, and R2 behind the `LogoFiles` seam); that seam is ADR-0001.
- `src/worker/actor.ts` - works out who is asking. It refuses nothing but a cross-site write; each
  route decides what it needs.
- `src/worker/test-harness.ts` - runs the app against a real local D1 with the real migrations, so
  the tests exercise the SQL the Worker runs.
- `src/ui/` - the admin UI: React, built by Vite into `dist/client/app` and served by the Worker
  under `/app`. Vietnamese only. Built on shadcn/ui: `components/ui/` and `hooks/` are shadcn's own
  files, unlinted and left as shipped (`components.json` lets `shadcn add` bring in more);
  `components/app.tsx` is our layer on top, `components/app-sidebar.tsx` the sidebar with the
  Đơn vị switcher. `@/` is `src/ui/`. `api.ts` is the one place it talks to the server, and
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
