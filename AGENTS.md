# AGENTS.md

linkstead gives an organization permanent links and QR codes under its own domain, whose
destination can change after they have been printed. Read these before changing anything:

- [CONTEXT.md](CONTEXT.md) - the vocabulary. Use its terms in code, UI text and commit messages, and
  do not introduce a synonym it lists under _Avoid_.
- [docs/adr/](docs/adr/) - the decisions that are hard to reverse, and why they were made.

## The rules the design rests on

Each is a rule, not a default.

**The Organization**

- An installation serves one Organization: one domain, one namespace, divided into Units
  (ADR-0007). Its name, email domains, language, time zone, colour and UI logo are one row in the
  database, set by a System Administrator in the UI or at bootstrap - never in code or config.
  Nothing about a particular organization is built in.
- The UI speaks the Organization's language, from `src/ui/i18n/` (one file per language, `vi.ts`
  typed against `en.ts`). The pages visitors meet speak it too, with English beneath when it is
  another (`worker/visitor-text.ts`). Every word a person reads lives in one of those
  dictionaries.
- Days are the Organization's: Visits are counted, and expiries typed and shown, in its IANA time
  zone (`domain/time-zone.ts`).

**Links**

- A Link's Link Code is never changed and never reused (ADR-0002). A Link can be switched off,
  archived (hidden from the list, still opens) or deleted. Deleting keeps the row, so the code stays
  taken for good. Only a Unit Manager or a System Administrator deletes, and never through the API
  (ADR-0004).
- One flat namespace for the whole Organization. A Link Code is lowercase unaccented letters,
  digits and hyphens, 3 to 50 characters, matched case-insensitively. A generated one is 6
  characters and avoids look-alikes (`0`/`o`, `1`/`l`).
- Reserved Codes cover the system's own paths (`app`, `api`, ...) and names only a System
  Administrator may hand out.
- A Link has exactly one Target at a time: any `https` address that does not point back at this
  system and that Google Safe Browsing does not list as unsafe. No schedule, no per-device target.
  A Link may have a password visitors must give first, and a moment it expires at - after which
  it shows a notice and keeps its code (ADR-0006). Both are set in the UI only. Every Target is
  checked again daily. A Link whose Target is newly listed shows visitors a warning instead of
  redirecting (`worker/safety.ts`).
- Changing a Target goes through a confirmation showing the old and the new one, and is logged with
  who made it. Every Member of the owning Unit can read that history.
- An open Link answers with a **temporary** redirect - a permanent one is cached by browsers and
  keeps sending people to the old Target. An unknown Link Code, a Disabled Link, a Deleted Link and
  an Expired Link show a notice page; none falls back to a home page. A Link with a password shows
  a page asking for it, which names nothing of the Target.

**QR**

- A QR always carries the Link, never the Target.
- The logo is chosen at three levels, the lower winning: the Organization's logo for the whole
  system, a Unit's own default, and a per-Link choice which may also be "none". The per-Link
  choice is stored so a later download gives the same picture. Until a System Administrator
  uploads the Organization's logo, QR carry none.
- The system decides the logo's box (centred, white backing, at most about a fifth of the width)
  and raises error correction to the highest level whenever a logo is present. Nobody can tune
  these. Inside that box a Link may shrink its logo, from 40% to 100% of the box, stored with the
  Link - the box, and so what the code needs, never changes.
- Uploaded logos - for QR and for the UI - are PNG or JPEG. **Never SVG** - it can carry script and
  would be served back under the Organization's domain.
- The server renders SVG, and the API returns only SVG. PNG is made in the browser from that SVG.
- Modules are drawn `square` or as `dots` with rounded corner squares, kept per Link like its logo.
  Only the outline changes, never where a module is, so both read the same.

**People**

- A Link belongs to a Unit, never to a person.
- An Account is an email address at one of the Organization's email domains, or any address when
  it names none. It may be in several Units; in none, it can create nothing.
- A Unit always has at least one Unit Manager.
- A System Administrator may switch off any Link and move a Link between Units. A Link they
  switched off only they switch back on. A Unit that still owns Links cannot be dissolved; it can
  be merged into another, which takes its Links, members and API Keys.
- Login is self-managed (ADR-0003). The password salt keeps its `ou-link:` prefix for ever.

**API**

- An API Key belongs to a Unit and acts on that Unit's Links only.
- The API does six things: create a Link, change its Target, switch it off and on, list a Unit's
  Links, read Visits, return a QR. Accounts, Units, keys and the Organization's settings are
  managed in the UI only - putting them in the API would widen what a leaked key can do.
- Every change made through the API is logged under the key that made it. Calls are rate-limited
  per key. New keys start `lsk_`; `oul_` keys from before keep working.

**Visits**

- Counted per Link per day, and per day by country and by referring site (host only), and kept
  forever. Nothing identifying the visitor is stored - no IP, no device, no full address
  (ADR-0005).
- Openings made by preview fetchers (Zalo, Facebook, Messenger) are skipped where recognisable, and
  the UI presents the number as an estimate.

**Data**

- A Unit can download its Links and Visits as CSV, in the Organization's language. A System
  Administrator can export everything - the Organization included - in a form another
  installation can import (`docs/export-and-import.md`).

## Where it runs

Cloudflare Workers (ADR-0001): one Worker, Hono for the API and the redirect, a React UI built with
Vite and served as static files under `/app`, D1 through Drizzle, R2 for logo files. Request
handling must not depend on Workers-only APIs, so it can move to an organization's own servers.
`wrangler.jsonc` holds the platform's bindings only; an installation copies it and changes the
names.

## Commands

- `pnpm dev` - the Worker on a local D1 (`wrangler dev`). It serves the UI as last built, so run
  `pnpm build:ui` first
- `pnpm dev:ui` - the UI from Vite with hot reload, calling the Worker started by `pnpm dev`
- `pnpm run deploy` - builds the UI, then deploys. CI (`.github/workflows/ci.yml`) only checks;
  an installation deploys from its own repository or machine
- `pnpm db:generate` - a migration from `src/db/schema.ts`; `pnpm db:migrate:local` applies them
  locally, `pnpm db:migrate:remote` to the deployed database
- `pnpm test` / `pnpm check-types` / `pnpm lint:check`

On Windows, run vitest from a shell whose working directory has an upper-case drive letter
(`E:\...`); from `e:\...` it loads itself twice and every suite fails before running.

## What answers today

Everything under `/api` speaks JSON. A person is recognised by the session cookie, an application
by `Authorization: Bearer <API Key>`; a route says which of the two it accepts.

| Route | Who | Does |
| --- | --- | --- |
| `GET /:code` | anyone | opens a Link, counting it by day, country and referring site; or shows a notice page naming the address opened (`worker/notice.tsx`) - a warning with the Target for a Link whose Target is listed unsafe; a preview fetcher (Zalo, Facebook...) gets a page of Open Graph tags instead of the redirect (`domain/preview.ts`) |
| `GET /` | anyone | what these links are, and the way in to `/app` (`worker/landing.tsx`); a notice page links here but never falls back to it |
| `GET /robots.txt` | anyone | keeps crawlers out of `/app` and `/api` |
| `GET /app/*` | anyone | the UI |
| `GET /api/organization`, `GET /api/organization/logo` | anyone | the Organization's name, language, time zone, colour, email domains and UI logo |
| `GET /api/bootstrap` | anyone | whether the installation still waits for its first System Administrator, so `/app` shows the first-run screen (`pages/first-run.tsx`) |
| `POST /api/bootstrap` | holder of `BOOTSTRAP_TOKEN` | creates the first System Administrator, once, with the Organization's first settings; with `passwordKey` sets the password and signs them in, without it answers a one-time link |
| `POST /api/auth/setup/account`, `POST /api/auth/setup` | holder of a one-time link | says whose link it is; sets a password |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | a person | the session |
| `POST /api/links`, `GET /api/links` | a Member, or an API Key | creates a Link, lists a Unit's Links |
| `PUT /api/links/:code/target` | a Member, or an API Key | changes the Target, logged |
| `POST /api/links/:code/disable`, `.../enable` | a Member, an API Key, or a System Administrator | switches a Link off and on, logged |
| `GET /api/links/:code` | a Member | one Link, for its page in the UI; never an API Key |
| `GET /api/links/:code/visits`, `GET /api/links/:code/qr` | a Member, or an API Key | Visits per day, country and referring site; the QR as SVG, `?style=` one of the fixed looks in `domain/qr-style.ts` |
| `GET /api/links/:code/history` | a Member | every change of Target, state and Unit |
| `POST /api/links/:code/archive`, `.../unarchive` | a Member | puts a Link away from the list, or back; it keeps opening |
| `PUT /api/links/:code/access`, `PUT /api/links/:code/qr-shape` | a Member | the Link's password and expiry (ADR-0006); how its QR is drawn |
| `POST /:code` | anyone | the password page's form: right, a 303 to the Target; 10 wrong in a minute, 429 |
| `DELETE /api/links/:code` | Unit Manager, or a System Administrator | deletes a Link, with `{"confirmCode"}` the Link Code typed back; the code stays taken (ADR-0004) |
| `GET /api/units/:unitId/visits?days=` | a Member | the Unit's Visits at a glance: per day, most opened Links, countries, referring sites |
| `PUT /api/links/:code/details`, `PUT /api/links/:code/qr-logo` | a Member | rewords Link Name and note; the Link's logo choice |
| `PUT /api/links/:code/group`, `/api/units/:unitId/groups...` | a Member | sorts a Link into a Group; makes, renames and deletes the Unit's Groups |
| `GET`, `PUT /api/links/:code/preview` | a Member | the share preview: what the Target says, and the Link's own title, description and image |
| `GET /api/units/:unitId/links.csv`, `.../visits.csv`, `.../visit-sources.csv` | a Member | the Unit's CSV downloads |
| `/api/units/:unitId/members...`, `.../keys...`, `.../qr-logo`, `.../qr-preview` | Unit Manager | members and their roles, API Keys, the Unit's logo |
| `/api/admin/settings`, `/ui-logo`, `/admins`, `/units`, `/reserved-codes`, `/links...`, `/qr-logo`, `/export` | System Administrator | the Organization's settings and UI logo, other administrators, Units, Reserved Codes, any Link (find, move, hand out a reserved code), the Organization's QR logo, the whole export |
| `GET /api/openapi.json`, `GET /app/api-docs` | anyone | the API Key's six operations as OpenAPI 3.1 (`worker/openapi.ts`), and the Swagger page that reads it |
| `POST /api/admin/import` | holder of `BOOTSTRAP_TOKEN` | takes an export into an unused installation (`docs/export-and-import.md`) |

An API Key is refused past 120 calls a minute. A System Administrator outside a Unit can switch
its Links off and on and move them, but cannot change a Target or read a history.

**Checking every Target.** With the secret `SAFE_BROWSING_KEY` set (a Google Safe Browsing key), a
new or changed Target that Google lists as unsafe is refused, and the Worker's daily cron
(`wrangler.jsonc`) checks every Target again. Without the key, nothing is checked.

**Starting a fresh deployment.** `BOOTSTRAP_TOKEN` is the setup code: declared in
`.dev.vars.example`, so the Deploy to Cloudflare button asks for it. While no System Administrator
exists, `/app` shows the first-run screen, which asks for the code, the first administrator's email
and password, and the Organization's settings, then signs them in. A script does the same with
`POST /api/bootstrap`, `Authorization: Bearer <code>` and `{"email", "name", "emailDomains",
"language", "timeZone", "brandColor"}`. The code keeps whoever reaches a fresh installation first
from taking it; afterwards it opens only the import.

**Passwords are stretched in the browser** (ADR-0003, `src/domain/password.ts`): the server is
sent the stretched value and stores a salted HMAC of it, so signing in fits the Workers Free plan.
The API's `passwordKey` is that value, never the password.

## Layout

- `src/domain/` - the rules, pure and tested: what a Link Code may be, what a Target may be, what
  counts as a Visit, how a QR is drawn, what a logo may be, how a password is stretched, what the
  Organization's settings may be, how days and wall clocks work in a time zone. No I/O.
- `src/worker/app.tsx` and `src/worker/routes/` - the request handling, written against the
  `Store` in `store.ts` and nothing Cloudflare-specific. `store-d1.ts` and `index.ts` are the only
  files that know about Workers (D1, and R2 behind the `LogoFiles` seam); that seam is ADR-0001.
  `index.ts` also keeps the Organization in memory for a minute per isolate.
- `src/worker/actor.ts` - works out who is asking. It refuses nothing but a cross-site write; each
  route decides what it needs.
- `src/worker/visitor-page.tsx`, `visitor-text.ts` - the frame and the words of every page a
  visitor meets.
- `src/worker/test-harness.ts` - runs the app against a real local D1 with the real migrations, as
  an example Organization with two Units, so the tests exercise the SQL the Worker runs.
- `src/ui/` - the admin UI: React, built by Vite into `dist/client/app` and served by the Worker
  under `/app`. `main.tsx` reads the Organization, sets the language and colour, and only then
  loads `root.tsx` and the screens - so a screen may read `text()` at the top of its file. Built on
  shadcn/ui: `components/ui/` and `hooks/` are shadcn's own files, unlinted and left as shipped
  (`components.json` lets `shadcn add` bring in more); `components/app.tsx` is our layer on top,
  `components/app-sidebar.tsx` the sidebar with the Unit switcher. A Link has its own page
  (`pages/link-detail.tsx`); the list and that page share `pages/link-forms.tsx`. `@/` is
  `src/ui/`. `api.ts` is the one place it talks to the server, and `messages.ts` the one place a
  server reason becomes a sentence. It has its own `tsconfig.json` because it is browser code and
  the Worker is not.
- `src/ui/public/brand/` - Be Vietnam Pro, served at `/app/brand/` to the UI and the visitor pages
  alike, self-hosted so no page calls another site. Its Vietnamese subset is why it was chosen.
- `src/db/schema.ts` - the whole model.

## Conventions

- pnpm, Node 22 (`mise.toml`).
- Biome through ultracite. Two-space indent, 120 columns, double quotes, no trailing commas, object
  keys sorted.
- Conventional commits, enforced by commitlint: `type(scope): subject`, lowercase imperative
  subject, header at most 100 characters, body lines wrapped at 100.
- Verify by running the binaries directly (`./node_modules/.bin/<tool>`) and reading the exit code.
