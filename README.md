# linkstead

Permanent links and QR codes under your organization's own domain, whose **destination can change
after they have been printed**. A poster, a flyer or a conference badge printed today still leads to
the right place when the page it points to moves next year.

[Tiếng Việt](README.vi.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/holedev/linkstead)

## What it does

- **Permanent links.** Each link has a Link Code (`/conference-2027`) that never changes and is
  never given out again. A link can be switched off, archived (hidden from the list, still opens)
  or deleted; a deleted link keeps its code, so a printed QR never leads somewhere new. Choose the
  code, or let the system make a 6-character one.
- **Controlled changes.** Changing where a link leads goes through a confirmation showing the old
  and the new destination, and is recorded with who made it.
- **QR codes.** A QR always carries the link, never the destination. The logo in its middle is
  chosen at three levels: the organization's, a unit's, or the link's own (or none). Squares or
  rounded dots, SVG or PNG.
- **Units, not people.** Links belong to units - a department, a journal, an office - so they stay
  when the person who made them leaves. An account may belong to several units.
- **Passwords and expiry.** A link may ask for a password before sending visitors on, and may
  expire at a moment of your choosing; an expired link keeps its code.
- **Many at once.** Import a CSV, review every row, and download the QR codes of all that were
  made as one zip.
- **Visits.** Counted per link per day, by country and by referring site (host only). Nothing that
  identifies a visitor is kept. Previews made by chat apps are left out.
- **Safe destinations.** A destination Google Safe Browsing lists as phishing or malware cannot be
  set, and every destination is checked again daily.
- **An API.** Each unit issues API keys so its own software can create links, change destinations,
  switch them off and on, list them, read visits and fetch QR codes.
- **Your data stays yours.** Units download CSV; a system administrator exports everything to a
  file another installation can import.
- **Your organization's own.** Its name, colour and logo, its email domains, its language (English
  or Vietnamese) and its time zone are set in the UI.

The project's vocabulary (Link, Link Code, Target, Unit, Visit...) is defined in
[CONTEXT.md](CONTEXT.md).

## Architecture

One Cloudflare Worker:

| Part | Technology |
| --- | --- |
| API and link redirects | [Hono](https://hono.dev) |
| Admin UI (`/app`) | React, Vite, Tailwind, shadcn/ui |
| Database | Cloudflare D1 through Drizzle |
| Logo files | Cloudflare R2 |

Request handling depends on no Workers-only API: it knows only two seams, `Store` and `LogoFiles`,
so running it elsewhere means rewriting those two (ADR-0001). The full layout and route list are in
[AGENTS.md](AGENTS.md).

## Running your own

The quickest way is the **Deploy to Cloudflare** button above: it copies this repository into your
GitHub account, creates the D1 database and the R2 bucket, runs the migrations and deploys. The
Workers Free plan is enough. Then [create the first administrator](#create-the-first-administrator).

By hand:

```bash
pnpm install
pnpm exec wrangler login
pnpm run deploy
```

`pnpm run deploy` builds the UI, applies the migrations and deploys; wrangler creates the database
and the bucket named in `wrangler.jsonc` the first time. (Type `pnpm run deploy`: `pnpm deploy` is
a different, built-in pnpm command.)

To keep your own configuration - another Worker name, an existing database, a cron at another hour -
copy `wrangler.jsonc` into your own repository or deploy setup, and update linkstead by moving to a
newer release. Run `pnpm db:migrate:remote` before deploying a release that adds migrations.

**Choose your domain before printing anything.** A QR carries the domain it was made under, and
dies with it.

### Create the first administrator

There is no open sign-up and the system sends no email. The first person is created with a secret
set at deploy; everyone after is added by someone already inside.

1. Set the secret (for a local run, a line in `.dev.vars`):

   ```bash
   pnpm exec wrangler secret put BOOTSTRAP_TOKEN
   ```

2. Call `/api/bootstrap` with the secret, your email and, optionally, your organization's
   settings:

   ```bash
   curl -X POST https://<your-worker>/api/bootstrap \
     -H "Authorization: Bearer <secret>" \
     -H "Content-Type: application/json" \
     -d '{"email":"you@example.org","name":"Example University","emailDomains":["example.org"],"language":"en","timeZone":"Europe/Berlin","brandColor":"#1d4ed8"}'
   ```

   `language` is `en` or `vi`; `timeZone` an IANA name; `brandColor` a colour dark enough for white
   text. Leave out `emailDomains` to accept any address.

3. Open the `setupUrl` in the answer to set a password (12 characters at least), then sign in at
   `/app`. The link works once, for 7 days.

4. Delete the secret:

   ```bash
   pnpm exec wrangler secret delete BOOTSTRAP_TOKEN
   ```

Step 2 works only while there is no system administrator. Units, members, other administrators,
the logos and every setting are then managed in the UI (**Settings**, **Units**...).

Moving from another installation instead? Import its export before bootstrapping:
[docs/export-and-import.md](docs/export-and-import.md).

### Turn on the safety check

Checking destinations uses Google Safe Browsing, which is free but needs a key:

1. In the [Google Cloud Console](https://console.cloud.google.com/), create (or choose) a project,
   enable the **Safe Browsing API**, and create an API key under **APIs & Services → Credentials**.
2. Give it to the Worker:

   ```bash
   pnpm exec wrangler secret put SAFE_BROWSING_KEY
   ```

Without the key the system still runs; it just checks nothing. The daily check runs at the time in
`triggers.crons` in `wrangler.jsonc` (UTC).

## Running locally

Node 22 and pnpm 11.20.0 (`mise.toml`; run `mise install` if you use [mise](https://mise.jdx.dev)).

```bash
pnpm install
echo "BOOTSTRAP_TOKEN=any-local-secret" > .dev.vars
pnpm db:migrate:local
pnpm build:ui
pnpm dev
```

The system runs at `http://localhost:8787`, the UI at `http://localhost:8787/app`. Create the first
administrator as above, against `http://localhost:8787`. While working on the UI, run `pnpm dev:ui`
in another window for hot reload; it calls the Worker started by `pnpm dev`.

## Using the API

The full documentation, to try in the browser: **`/app/api-docs`** (Swagger, no sign-in needed).
The OpenAPI description is at `/api/openapi.json`, for generating clients.

A unit manager issues API keys in the UI (**API Keys**); a key is shown once. An application sends
it as `Authorization: Bearer <key>`. A key works on its own unit's links only, and is refused past
120 calls a minute.

| Task | Route |
| --- | --- |
| Create a link | `POST /api/links` - `{ "name", "target", "code"?, "note"? }` |
| List the unit's links | `GET /api/links` |
| Change the destination | `PUT /api/links/:code/target` - `{ "target" }` |
| Switch off, on | `POST /api/links/:code/disable`, `POST /api/links/:code/enable` |
| Read visits per day | `GET /api/links/:code/visits` |
| Get the QR (SVG) | `GET /api/links/:code/qr` - add `?style=` for another look: `light-on-dark`, `blue-on-light`, `dark-on-clear`, `light-on-clear` |

```bash
curl -X POST https://<your-worker>/api/links \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Conference poster, A3 print","target":"https://example.org/conference","code":"conference-2027"}'
```

Every change made through the API is recorded under the key that made it. Accounts, units, keys and
settings are managed in the UI only, never through the API.

## Checking the code

```bash
pnpm test
pnpm check-types
pnpm lint:check
```

The tests run against a real local D1 with the real migrations, so they check the SQL the Worker
will run. Commits follow conventional commits, checked by commitlint.

## Documents

- [CONTEXT.md](CONTEXT.md) - the project's vocabulary.
- [AGENTS.md](AGENTS.md) - the design rules, the route list, the layout.
- [docs/adr/](docs/adr/) - the decisions that are hard to reverse, and why.
- [docs/export-and-import.md](docs/export-and-import.md) - exporting, and importing into another
  installation.

## License

MIT - see [LICENSE](LICENSE) and [NOTICE](NOTICE). linkstead began as OU Link, written for Ho Chi
Minh City Open University.
