---
status: accepted, amended by ADR-0004
---

# A Link Code is permanent and the namespace is flat

A Link Code is never changed and never reused, because the paper it was printed on is still out
there. The whole Organization shares one namespace (`/cfp-2027`), first come first served, with a
list of Reserved Codes only a System Administrator hands out.

## Considered Options

- **A prefix per Unit** (`/js/cfp-2027`) - rejected. It shows who owns a Link, but a code is
  permanent and a Unit is not: departments merge and are renamed, and the prefix would stay wrong
  on everything already printed. It would also make moving a Link between Units change its address.
