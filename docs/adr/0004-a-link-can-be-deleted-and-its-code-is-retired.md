---
status: accepted
---

# A Link can be deleted, and its code is retired

ADR-0002 said a Link is never deleted, only switched off. A Đơn vị asked to delete Links made by
mistake or no longer wanted, so a Link can now be deleted. What ADR-0002 protects still holds: **a
Mã link is never reused.** A deleted Link keeps its row, so its code stays taken for good. What is
printed with that code shows "this link was deleted", and never someone else's page.

A deleted Link opens nowhere: the visitor gets a notice and an HTTP 410. It leaves every list,
every count and every CSV, and the API answers it as unknown. Only a Quản trị hệ thống's lookup
still finds it, with who deleted it and when. The whole-installation export carries it, so another
installation keeps the code retired too.

Deleting is for a Quản lý đơn vị of the owning Đơn vị, or a Quản trị hệ thống. The Mã link must be
typed back to confirm. A Khóa API cannot delete: a leaked key must not be able to break what is
printed.

## Considered Options

- **Delete the row and free the code** - rejected. Paper outlives intentions. A freed code is soon
  taken by somebody else, and the old poster then leads to their page under the university's name.
- **Only switching off, as before** - rejected by the Đơn vị: a list of Links that will never be
  used again is clutter. For a Link that is finished but should keep working, there is archiving
  instead, which hides it from the list and leaves it open.
