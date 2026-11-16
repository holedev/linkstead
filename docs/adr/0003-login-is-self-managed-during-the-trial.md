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
