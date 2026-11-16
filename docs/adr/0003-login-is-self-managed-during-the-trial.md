---
status: accepted
---

# Login is self-managed during the trial

The university has Microsoft 365 accounts and OU Link is meant to sign people in with them, but
that needs the IT office to register an application, and the trial should not wait on it. Until
then the system keeps its own passwords. An Account is still known by its `@ou.edu.vn` email and by
nothing else, so that the move to Microsoft 365 matches people by email and nobody has to be added
to their Đơn vị again.

## Consequences

- There is no self sign-up and the system sends no mail. Someone already inside adds an email and
  passes on a one-time link for setting the password; a forgotten password goes the same way.
- Failed sign-ins are rate-limited per Account. There is no second factor during the trial.
- A password is stretched in the browser - PBKDF2-SHA256 through Web Crypto, 600.000 rounds, salted
  with the account's email - and the server stores a salted HMAC of the result. A stolen database
  is as slow to attack as if the server had done every round, but signing in costs the server one
  hash, which fits the CPU a request gets on the Workers Free plan. Hashing all of it on the server,
  at the 100.000 rounds the Workers runtime allows, measured about 13 ms against a 10 ms limit.
- The server therefore never sees a password, and cannot check its length: the browser does. What
  the browser sends stands in for the password and travels only over https. Signing in needs
  JavaScript, which the UI needs anyway.
