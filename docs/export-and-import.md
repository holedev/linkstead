# Export and import

ADR-0001 requires that the data can leave Cloudflare whole. This is how.

## A Đơn vị's own data

Every Thành viên can download, from the Link screen:

- `GET /api/units/:unitId/links.csv` - one row per Link: Mã link, address, Tên link, Đích, note,
  state, creation time, total Lượt mở.
- `GET /api/units/:unitId/visits.csv` - one row per Link per day that had a Lượt mở.

Both are UTF-8 with a BOM, so Excel reads Vietnamese. They need a signed-in person; a Khóa API
cannot fetch them.

## The whole installation

A Quản trị hệ thống downloads everything from the administration screen
(`GET /api/admin/export`). The file is JSON:

```json
{
  "version": 1,
  "exportedAt": "2027-03-01T03:00:00.000Z",
  "tables": { "accounts": [ ... ], ... },
  "logos": { "units/2/Xy...": "<base64>", ... }
}
```

Each table is a list of plain rows keyed by column name, exactly as in `migrations/`, so reading it
does not depend on D1. It holds accounts (with password hashes), units, memberships, API keys (as
hashes), reserved codes, links, the three histories and daily visits, and the logo files for QR. It leaves out sign-in
sessions, unused one-time password links and rate-limit counters. **Treat the file as a secret.**

To take it into a new installation, before anyone has signed in there:

```bash
curl -X POST https://<new-host>/api/admin/import \
  -H "Authorization: Bearer $BOOTSTRAP_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @ou-link-2027-03-01.json
```

- It is refused (`409 not-empty`) once the installation has a Tài khoản or a Link.
- The two Đơn vị a fresh installation is seeded with are replaced by the file's own.
- Ids are kept, so numbering carries on after the imported rows and nothing is ever reused.
- A file that cannot be read whole leaves nothing behind (`422 bad-snapshot`).
- Passwords and Khóa API keep working: only their hashes travel, and the hashing is the same.

- Logo files travel in the same file, base64, under the key the database points at. On import each
  is checked like an upload (PNG or JPEG, size); one that fails is left out and its QR shows no logo.
