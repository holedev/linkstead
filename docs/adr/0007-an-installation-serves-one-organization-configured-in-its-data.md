---
status: accepted
---

# An installation serves one Organization, configured in its own data

linkstead began as one university's system, with that university written into the code: its email
domain, its language, its time zone, its colours and logo. To be usable by anyone, all of that
became the **Organization**: the one body an installation serves. An installation has one domain,
one flat namespace of Link Codes (ADR-0002), and one Organization, divided into Units.

What the Organization is - its name, the email domains its Accounts may have, its language, its
time zone, its colour, and the logo its UI shows - is a single row in the database, set by a
System Administrator in the UI, or given with the first one at bootstrap. `wrangler.jsonc` holds
only what the platform needs: bindings, the cron, the Worker's name.

## Consequences

- A deploy needs no file changed to become someone's: the bootstrap call names the Organization,
  and the Settings screen changes it later. The export carries it to another installation.
- An Account must be at exactly one of the Organization's email domains; when it names none, any
  address is accepted, since accounts are only ever made by someone inside (ADR-0003).
- The admin UI speaks the Organization's language, one for the whole installation, from one
  dictionary per language. The pages visitors meet speak it too, with English beneath when it is
  another: whoever scans a poster may read only one of them.
- Visits are counted by day in the Organization's IANA time zone, and an expiry is typed and shown
  on its clocks. Changing the zone does not move the days already counted.
- Nothing about any organization is built in: no logo for QR (none until one is uploaded), no
  Units seeded by a migration. Two migrations that once seeded the first installation's Units are
  kept as empty statements, so the installations that already ran them still line up.
- The Worker keeps the Organization in memory for up to a minute per isolate: every opened Link
  needs its time zone. A change shows everywhere within that minute.

## Considered Options

- **Several Organizations per installation** - rejected. It would make linkstead a hosted service:
  a namespace and a domain per Organization, rights across them, and an export that splits. An
  organization that wants linkstead runs its own installation.
- **Settings in environment variables** - rejected. Every change would need a deploy, the export
  would not carry them, and the name and colour are a System Administrator's to change, not the
  person who deploys.
- **A user's own choice of language** - not now. One language per installation keeps every
  notice, CSV and preview consistent with what is printed.
