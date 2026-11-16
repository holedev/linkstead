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
- Passwords are hashed with PBKDF2 through Web Crypto, the one password hash Workers and Node both
  provide natively, at the 100.000 iterations the Workers runtime allows. That is more CPU than a
  request gets on the Workers Free plan, so signing in needs Workers Paid.
