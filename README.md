# 🔗 linkstead

Permanent links and QR codes under your organization's own domain, whose **destination can change
after they have been printed**. A poster, a flyer or a conference badge printed today still leads to
the right place when the page it points to moves next year.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/holedev/linkstead)
[![CI](https://github.com/holedev/linkstead/actions/workflows/ci.yml/badge.svg)](https://github.com/holedev/linkstead/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**English** · [Tiếng Việt](README.vi.md)

## ✨ Features

- **Permanent links**: Every link has a Link Code (`/conference-2027`) that never changes and is
  never given out again, even after the link is deleted. A printed QR never leads somewhere new.
- **Controlled changes**: Changing a destination requires a confirmation that shows the old and the
  new one. Every change is recorded with who made it.
- **Redirect types**: Each link redirects with 302 (the default), 307, 301 or 308. Every redirect
  is sent uncached, so a changed destination always takes effect
  ([ADR-0009](docs/adr/0009-a-link-may-redirect-permanently.md)).
- **QR codes**: A QR carries the link, never the destination. The logo in the middle can be set by
  the organization, by a unit, or for a single link. Squares or dots, SVG or PNG.
- **Units, not people**: Links belong to units (a department, a journal, an office), so they stay
  when the person who made them leaves. Units sort their links into groups.
- **Passwords and expiry**: A link can ask for a password before sending visitors on, and can expire
  at a set time. An expired link keeps its code.
- **Bulk creation**: Import a CSV, review every row, and download all the QR codes as one zip.
- **Privacy-respecting visits**: Visits are counted per link per day, by country, referring site,
  device and browser. Nothing that identifies a visitor is kept, and preview bots from chat apps are
  left out.
- **Safe destinations**: Destinations listed by Google Safe Browsing as phishing or malware are
  refused, and every destination is checked again daily.
- **REST API**: Units issue API keys so their own software can create links and change destinations.
  Documented with OpenAPI and Swagger UI.
- **Your data stays yours**: Units download their data as CSV. A system administrator can export
  everything to a file that another installation can import.
- **Your organization's own**: The name, colour, logo, email domains, language (English or
  Vietnamese) and time zone are set in the UI.

## 🛠 Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | [Cloudflare Workers](https://workers.cloudflare.com) (one Worker serves everything) |
| API and redirects | [Hono](https://hono.dev) |
| Admin UI (`/app`) | React 19, Vite, Tailwind CSS 4, [shadcn/ui](https://ui.shadcn.com) |
| Database | Cloudflare D1 (SQLite) via [Drizzle ORM](https://orm.drizzle.team) |
| File storage | Cloudflare R2 (logos) |
| Analytics (optional) | Workers Analytics Engine |
| Tooling | TypeScript, Vitest, [Biome](https://biomejs.dev) via [Ultracite](https://www.ultracite.ai), Husky, commitlint |

The request handling relies on no Workers-only API. Storage sits behind two interfaces, `Store` and
`LogoFiles`, so moving to another platform means rewriting only those
([ADR-0001](docs/adr/0001-runs-on-cloudflare-workers-and-stays-portable.md)).

## 🚦 Getting Started

### Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up). The Workers Free plan is enough.
- A domain on Cloudflare for your links. **Choose it before printing anything**: a QR carries the
  domain it was made under.
- For deploying by hand or developing: Node.js 22 and pnpm 11.20.0 (pinned in `mise.toml`).

### Option 1: Deploy to Cloudflare (recommended)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/holedev/linkstead)

The button copies this repository into your GitHub account, creates the D1 database and the R2
bucket, runs the migrations and deploys. It asks for one secret, `BOOTSTRAP_TOKEN`
([see below](#-environment-variables)). Then open `/app` and
[create the first administrator](#create-the-first-administrator).

### Option 2: Deploy by hand

```bash
git clone https://github.com/holedev/linkstead.git
cd linkstead

# use the pinned toolchain (optional)
mise install

pnpm install
pnpm exec wrangler login

# build the UI, apply migrations and deploy
pnpm run deploy

# set the setup code
pnpm exec wrangler secret put BOOTSTRAP_TOKEN
```

On the first deploy, wrangler creates the database and the bucket named in `wrangler.jsonc`. Use
`pnpm run deploy`: `pnpm deploy` is a different, built-in pnpm command.

To keep your own configuration (another Worker name, an existing database, a cron at another hour),
copy `wrangler.jsonc` into your own deploy setup and update linkstead by moving to a newer release.
Run `pnpm db:migrate:remote` before deploying a release that adds migrations.

### Local development

```bash
pnpm install

# set up local secrets, then fill in BOOTSTRAP_TOKEN
cp .dev.vars.example .dev.vars

pnpm db:migrate:local
pnpm build:ui
pnpm dev
```

The Worker runs at `http://localhost:8787` and the UI at `http://localhost:8787/app`. For hot reload
while working on the UI, run `pnpm dev:ui` in a second terminal; it calls the Worker that `pnpm dev`
started.

## 🔐 Environment Variables

These are the values **you create**. In production, set secrets with
`pnpm exec wrangler secret put <NAME>` or in the Cloudflare dashboard (**Workers & Pages → your
Worker → Settings → Variables and Secrets**). Set variables under `vars` in `wrangler.jsonc` or on
the same dashboard page. Locally, put both in `.dev.vars`.

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `BOOTSTRAP_TOKEN` | Secret | **Yes**, until the first administrator exists | The setup code the first-run screen asks for. It stops anyone who reaches a fresh installation before you from taking it over. Afterwards it is used only to import an export. |
| `SAFE_BROWSING_KEY` | Secret | No | A Google Safe Browsing API key. With it, destinations are checked when set and again every day. See [the safety check](#turn-on-the-safety-check). |
| `CF_ACCOUNT_ID` | Variable | With Analytics Engine | Your Cloudflare account ID, where the Analytics Engine dataset lives. |
| `CF_API_TOKEN` | Secret | With Analytics Engine | A Cloudflare API token with **Account → Account Analytics → Read**, used to read visits back. |
| `VISIT_DATASET` | Variable | No | The Analytics Engine dataset name, if it is not `linkstead_visits`. |

Generate a strong `BOOTSTRAP_TOKEN`:

```bash
openssl rand -base64 32
```

A local `.dev.vars` looks like this:

```bash
BOOTSTRAP_TOKEN=your-long-random-setup-code
# SAFE_BROWSING_KEY=
# CF_ACCOUNT_ID=
# CF_API_TOKEN=
```

**Bindings** are declared in `wrangler.jsonc`. You do not create their values yourself:

| Binding | Type | Description |
| --- | --- | --- |
| `DB` | D1 database | Everything the system keeps. Created on the first deploy. |
| `LOGOS` | R2 bucket | Logo files for QR codes and the UI. Created on the first deploy. Without it, the system runs without logos. |
| `ASSETS` | Static assets | The built admin UI, served under `/app`. |
| `VISIT_EVENTS` | Analytics Engine dataset | Optional. Commented out by default; see [Analytics Engine](#turn-on-analytics-engine-optional). |

> [!NOTE]
> The organization's settings (name, language, time zone, colour, email domains) are **not**
> environment variables. They are set in the UI and stored in the database
> ([ADR-0007](docs/adr/0007-an-installation-serves-one-organization-configured-in-its-data.md)).
> Cron schedules live under `triggers.crons` in `wrangler.jsonc`.

## ⚙️ Configuration

### Create the first administrator

There is no open sign-up, and the system sends no email. While an installation has no system
administrator, `/app` shows a **first-run screen** instead of the sign-in page. Enter:

- the setup code (`BOOTSTRAP_TOKEN`);
- your email and a password of at least 12 characters;
- your organization's name, language and time zone, and optionally the email domains that accounts
  must use;
- the name of your first unit, which you will manage.

You are signed in at once and can create links straight away. Everyone after you is added by
someone already inside.

Once you are in, you can delete the setup code with
`pnpm exec wrangler secret delete BOOTSTRAP_TOKEN`, unless you plan to import an export.

<details>
<summary>Bootstrapping from a script</summary>

Call `/api/bootstrap`. The answer carries a one-time link for setting the password.

```bash
curl -X POST https://<your-worker>/api/bootstrap \
  -H "Authorization: Bearer <setup-code>" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.org","name":"Example University","emailDomains":["example.org"],"language":"en","timeZone":"Europe/Berlin","brandColor":"#1d4ed8","unitName":"Communications Office"}'
```

`language` is `en` or `vi`. `timeZone` is an IANA name. `brandColor` must be dark enough for white
text. `unitName` defaults to the organization's name. Every field except `email` is optional.

</details>

After that, a unit's members, API keys and QR logo are managed from the sidebar. Everything
system-wide is under **System administration**, in the menu under your name at the bottom left:
the organization, units, links of every unit, administrators, reserved codes and the export.

Moving from another installation? Import its export before bootstrapping; see
[docs/export-and-import.md](docs/export-and-import.md).

### Turn on the safety check

Destinations are checked with Google Safe Browsing, which is free but needs an API key.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or choose a project and
   enable the **Safe Browsing API**.
2. Create an API key under **APIs & Services → Credentials**.
3. Give it to the Worker:

   ```bash
   pnpm exec wrangler secret put SAFE_BROWSING_KEY
   ```

Without the key the system still runs, but checks nothing. The daily check runs at the time set in
`triggers.crons` (UTC).

### Turn on Analytics Engine (optional)

Visits can go through [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)
instead of one D1 write each. It suits links that are scanned many thousands of times a day, and
adds a view of visits by hour of day over the last three months. A quarter-hourly cron rolls the
events into the same daily counts
([ADR-0008](docs/adr/0008-visits-may-pass-through-workers-analytics-engine.md)). Nothing more is
recorded about visitors: no IP address, no user agent.

1. Uncomment the binding in `wrangler.jsonc`:

   ```jsonc
   "analytics_engine_datasets": [{ "binding": "VISIT_EVENTS", "dataset": "linkstead_visits" }],
   ```

2. Set `CF_ACCOUNT_ID` as a variable and `CF_API_TOKEN` as a secret:

   ```bash
   pnpm exec wrangler secret put CF_API_TOKEN
   ```

3. Deploy. If any of the three is missing, visits keep going to D1 directly.

## 🔌 API

Interactive documentation is served at **`/app/api-docs`** (Swagger UI, no sign-in needed). The
OpenAPI description at `/api/openapi.json` can be used to generate clients.

A unit manager issues API keys in the UI (**API Keys**). A key is shown once. Send it as
`Authorization: Bearer <key>`. A key works only on its own unit's links and allows up to 120 calls
a minute.

| Task | Route |
| --- | --- |
| Create a link | `POST /api/links`: `{ "name", "target", "code"?, "note"?, "groupId"?, "redirectType"? }` |
| List the unit's links | `GET /api/links` |
| Change the destination | `PUT /api/links/:code/target`: `{ "target" }` |
| Switch off / on | `POST /api/links/:code/disable`, `POST /api/links/:code/enable` |
| Read visits | `GET /api/links/:code/visits` |
| Get the QR (SVG) | `GET /api/links/:code/qr`, optionally `?style=light-on-dark`, `blue-on-light`, `dark-on-clear` or `light-on-clear` |

```bash
curl -X POST https://<your-worker>/api/links \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Conference poster, A3 print","target":"https://example.org/conference","code":"conference-2027"}'
```

The API deliberately does only these six things. Every change made through it is recorded under the
key that made it. Accounts, units, keys and settings are managed in the UI only.

## 📁 Project Structure

```
├── src/
│   ├── domain/          # Business rules, pure and unit-tested (link codes, targets, QR, visits)
│   ├── db/              # Drizzle schema
│   ├── worker/          # The Worker: Hono app, routes, D1 store, visitor pages, tests
│   │   └── routes/      # API routes by area (links, units, admin, auth, QR, stats, export)
│   └── ui/              # Admin UI (React), built into dist/client/app
│       ├── components/  # App components and shadcn/ui
│       ├── pages/       # Screens
│       └── i18n/        # English and Vietnamese
├── migrations/          # D1 migrations, applied on deploy
├── docs/
│   ├── adr/             # Architecture Decision Records
│   └── export-and-import.md
├── CONTEXT.md           # The project's vocabulary
├── AGENTS.md            # Design rules, route list, layout
└── wrangler.jsonc       # Worker configuration and bindings
```

## 🧪 Testing

```bash
pnpm test          # Vitest, against a real local D1 with the real migrations
pnpm check-types   # TypeScript, for the Worker and the UI
pnpm lint:check    # Biome
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org), checked by commitlint.
Staged files are formatted and linted before each commit.

## 📚 Documentation

- [CONTEXT.md](CONTEXT.md): the project's vocabulary (Link, Link Code, Target, Unit, Visit...).
- [AGENTS.md](AGENTS.md): design rules, the full route list and the code layout.
- [docs/adr/](docs/adr/): decisions that are hard to reverse, and why they were made.
- [docs/export-and-import.md](docs/export-and-import.md): moving to another installation.

## 📝 License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE). linkstead began as OU Link, written for Ho Chi Minh
City Open University.

## 👨‍💻 Author

[@holedev](https://github.com/holedev)
