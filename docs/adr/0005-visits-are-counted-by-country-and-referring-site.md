---
status: accepted
---

# Lượt mở are counted by country and by referring site

A Lượt mở used to be a count per Link per day and nothing more. A Đơn vị wants to know where its
readers come from, so each opening is now also counted by two things:

- **the country**, as the network in front of the system reports it (`CF-IPCountry` on
  Cloudflare). A server without such a header counts every opening as unknown. Nothing else needs
  to change there (ADR-0001).
- **the referring site**, as the host of the `Referer` header only: `facebook.com`, `ou.edu.vn`.
  The rest of the address can name a person or a private page, so it is dropped before anything
  is stored. A scanned QR, a typed address and most chat apps send no referrer, so "unknown" is
  usually the largest group, and the UI says so.

These are still counts, one row per Link, day, kind and value. No IP address, device, browser or
time of day is stored, and nothing ties one row to another visitor. The promise that nothing
identifying the visitor is kept stands; what changed is that the count has two more columns.

## Considered Options

- **City or region** - rejected. Below the country, a small faculty's Link opened by a handful of
  people starts to describe those people.
- **The full referring address** - rejected for the reason above.
- **Device or browser** - rejected. It is not needed to run a Link, and AGENTS.md rules it out.
