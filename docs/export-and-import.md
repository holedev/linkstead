# Export and import

ADR-0001 requires that the data can leave Cloudflare whole. This is how.

## A Unit's own data

Every Member can download, from the Links screen:

- `GET /api/units/:unitId/links.csv` - one row per Link: Link Code, address, Link Name, Group,
  Target, note, state, archived, creation time, total Visits.
- `GET /api/units/:unitId/visits.csv` - one row per Link per day that had a Visit.
- `GET /api/units/:unitId/visit-sources.csv` - one row per Link, day, and country or referring
  site.

Their headers and values are in the Organization's language. They are UTF-8 with a BOM, so Excel
reads accented letters. They need a signed-in person; an API Key cannot fetch them.

## The whole installation

A System Administrator downloads everything from the administration screen
(`GET /api/admin/export`). The file is JSON:

```json
{
  "version": 1,
  "exportedAt": "2027-03-01T03:00:00.000Z",
  "tables": { "organization": [ ... ], "accounts": [ ... ], ... },
  "logos": { "units/2/Xy...": "<base64>", ... }
}
```

Each table is a list of plain rows keyed by column name, exactly as in `migrations/`, so reading it
does not depend on D1. It holds the Organization's settings, accounts (with password hashes),
units, memberships, API keys (as hashes), reserved codes, groups, links, the three histories, daily
visits and their sources, and every logo file - for QR and for the UI. It leaves out sign-in
sessions, unused one-time password links and rate-limit counters. **Treat the file as a secret.**

To take it into a new installation, before anyone has signed in there:

```bash
curl -X POST https://<new-host>/api/admin/import \
  -H "Authorization: Bearer $BOOTSTRAP_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @linkstead-2027-03-01.json
```

- It is refused (`409 not-empty`) once the installation has an Account or a Link - so import
  instead of bootstrapping, not after.
- Ids are kept, so numbering carries on after the imported rows and nothing is ever reused.
- A file that cannot be read whole leaves nothing behind (`422 bad-snapshot`).
- Passwords and API Keys keep working: only their hashes travel, and the hashing is the same.
- A file made before the Organization was kept in the data has no `organization` table; the new
  installation keeps the defaults, which a System Administrator then sets under Settings.
- Logo files travel in the same file, base64, under the key the database points at. On import each
  is checked like an upload (PNG or JPEG, size); one that fails is left out, and its QR or the UI
  shows no logo.
