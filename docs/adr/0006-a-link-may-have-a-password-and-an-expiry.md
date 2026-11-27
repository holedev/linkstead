---
status: accepted
---

# A Link may have a password and an expiry

A Link used to open for anyone, for ever. Units asked for two limits. Both are optional, and both
are set in the UI only, not through the API.

**A password.** Visitors are asked for it before being sent to the Target. It suits material for
one class or one review board. The Link answers with its own page, and that page names nothing
about the Target: not to a person, and not to a preview fetcher, which gets the same page. A right
password sends the visitor on with a temporary redirect (303) and counts a Visit.

The password is stored as PBKDF2-SHA256 with its own salt and 10,000 rounds, which fits a Worker's
CPU limit. It is a word a Unit shares, not a person's secret, and the Target stays an ordinary
address. So guessing is slowed where it matters, at the door: after 10 wrong tries in a minute,
the Link asks the visitor to wait.

**An expiry.** After it, the Link shows the expired notice instead of redirecting. This replaces
the earlier rule of "no expiry". What that rule protected still holds: **the Link Code stays
taken.** An Expired Link is still a Link. A later date, or none, opens it again. Nothing printed
ever leads somewhere new. The moment is stored in UTC and typed and shown on the Organization's
clocks (ADR-0007).

## Considered Options

- **Freeing the code at expiry** - rejected, for the reason in ADR-0004: a poster outlives its
  event.
- **Sending an Expired Link to a fallback address** - rejected. AGENTS.md rules out falling back,
  and a fallback is a second Target that nobody confirms.
- **A per-visitor unlock cookie** - not now. Each opening asks again. That is simpler, and nothing
  about the visitor is kept.
