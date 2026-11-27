---
status: accepted
---

# Visits may pass through Workers Analytics Engine

Counting a Visit in D1 costs a row write for each thing it is counted by, while the person who
opened the Link waits only for the redirect - but the Workers Free plan allows 100,000 row writes a
day, which a few busy posters can reach. And a day is the smallest stretch D1 keeps, so a Unit
cannot see at what time of day its Links are opened.

An installation may therefore send its Visits through Workers Analytics Engine instead: one data
point per Visit, written without waiting. Every quarter-hour a cron adds the quarter-hours that
have settled into the same per-day counts D1 has always kept, so lists, CSV files, the API and the
export read D1 as before, at most about twenty minutes behind. Analytics Engine keeps its events
for three months, and only there can Visits be read by the hour of the day.

At the same time a Visit is counted by two more things, in both modes: the **kind of device**
(phone, tablet, computer, other) and the **browser family** (Chrome, Safari, Zalo, Facebook...).
Both are read from the user agent, which is then dropped.

## Consequences

- An event carries the Link, its Unit, the country, the referring site's host, the device kind and
  the browser family - what D1 counts, and nothing else. No IP address, user agent, city or full
  referring address is written anywhere. This is where linkstead differs from Sink and similar
  shorteners, which log those for every click.
- The time of a Visit is kept only inside Analytics Engine, for three months. ADR-0005's "no time
  of day is stored" holds for D1 and the export; the view by hour is the one exception, and it ends
  with Analytics Engine's retention.
- Analytics Engine samples heavy traffic; the counts it adds are weighted estimates, which the UI
  already calls every Visit count.
- It is on only when the dataset is bound (`VISIT_EVENTS`) **and** the Worker can read it back
  (`CF_ACCOUNT_ID`, `CF_API_TOKEN` with Account Analytics Read). Events that cannot be read back
  would be lost after three months, so with anything missing Visits go to D1 directly.
- The rollup moves a mark in the same batch as the counts it adds, so no quarter-hour is added
  twice; a count for a Link the installation does not have is dropped.
- Like logo files, Analytics Engine sits behind a seam (`VisitEvents`, `worker/context.ts`). Off
  Cloudflare, Visits are counted in the Store as before (ADR-0001); only the view by hour is missing.
- Counting by device and browser costs two more row writes per Visit in D1 mode.

## Considered Options

- **Analytics Engine only, as Sink does** - rejected. Visits are kept for ever and travel in the
  export; three months would break both.
- **Logging what Sink logs** (IP, user agent, city, coordinates) - rejected. Nothing that could tell
  who opened a Link is kept; a coarse device kind and a browser family cannot.
- **Reading through the Analytics SQL binding** instead of an API token - not now: it is in beta
  and speaks a different SQL dialect. A token with one read permission is a small thing to set.
