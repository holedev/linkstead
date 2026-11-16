# OU Link

Permanent links and QR codes under the university's own domain, whose destination can be changed
after they have been printed or sent. Shared by every unit of Ho Chi Minh City Open University.

## Language

**Link** (Vi: Liên kết):
A permanent address under the university's domain that sends whoever opens it to a **Đích**. It
exists so that something already printed or sent keeps working when its destination moves.
_Avoid_: short link, URL rút gọn, redirect.

**Mã link** (En: Link Code):
The part of a **Link** a person reads and types. Chosen when the Link is created, or generated when
left blank; never changed afterwards and never given to another Link, even once its own is disabled.
_Avoid_: slug, alias, mã (alone - it collides with **QR**).

**Nhóm** (En: Group):
A **Đơn vị**'s own way of sorting its **Links** - by event, by year, by issue. A Link is in at most
one Nhóm, of its own Đơn vị; it leaves it when it moves to another Đơn vị. Unlike a Link, a Nhóm can
be renamed and deleted: nothing printed carries it, and deleting one leaves its Links in no Nhóm.
_Avoid_: folder, tag, category, campaign.

**Tên link** (En: Link Name):
What a **Link** is for, in the words of whoever created it - "Poster hội thảo 20 năm, bản in A3".
Every Link has one, because a **Mã link** alone tells nobody which piece of paper it sits on.
_Distinct from_: the **Mã link**, which is the address and never changes; the name may be reworded.
_Avoid_: title, label.

**Đích** (En: Target):
Where a **Link** currently sends its visitor - any `https` address. The only part of a Link that
changes, and every change is recorded with who made it.
_Avoid_: destination URL, original link.

**QR**:
A printable picture of a **Link**. It always carries the Link, never the **Đích**, which is what
lets the Đích change after printing. It shows the university's logo unless its **Đơn vị** set
another, or the Link itself was given one or none - a choice about the picture, never about the Link.
_Avoid_: mã QR động, QR code of the target.

**Đơn vị** (En: Unit):
A part of the university that owns **Links** - a journal, a faculty, an office. A Link belongs to
its Unit, never to the person who created it, so it outlives that person's account. A Link may be
moved to another Unit without its address changing, and a Unit cannot be dissolved while it still
owns one.
_Avoid_: team, workspace, tenant.

**Quản lý đơn vị** (En: Unit Manager):
The member of a **Đơn vị** who adds and removes its other members and issues its **Khóa API**. The
first one is named by a **Quản trị hệ thống** when the Unit is created; a Unit may have several
and always has at least one.
_Avoid_: owner, admin (alone - it collides with **Quản trị hệ thống**).

**Tài khoản** (En: Account):
One person, known by their university email address. It is created for them by someone already
inside - there is no signing oneself up - and may belong to several **Đơn vị** at once.
_Avoid_: user, login.

**Thành viên** (En: Member):
A **Tài khoản** that belongs to a **Đơn vị** and may therefore create and change that Unit's
**Links**. An account in no Unit can create nothing.
_Avoid_: user.

**Khóa API** (En: API Key):
What lets an application act for one **Đơn vị**, on that Unit's **Links** only. It belongs to the
Unit, never to a person.
_Avoid_: token, personal key.

**Mã dành riêng** (En: Reserved Code):
A **Mã link** nobody may take by being first - the names of faculties, of the university's own
programmes, of the system's own pages. Only a **Quản trị hệ thống** hands one out.

**Lượt mở** (En: Visit):
One opening of a **Link**, counted per Link per day. Nothing about the visitor is kept. It is an
estimate of interest, not a number of people: openings a machine makes to build a preview are left
out where they can be recognised.
_Avoid_: click, scan, hit.

**Link bị tắt** (En: Disabled Link):
A **Link** that shows the university's notice instead of sending its visitor on. Its **Mã link**
stays taken. A Unit may switch its own Links off and on; one switched off by a **Quản trị hệ thống**
only a Quản trị hệ thống switches back on.
_Distinct from_: a deleted Link, which does not exist - a Link is never removed.

**Quản trị hệ thống** (En: System Administrator):
The role that may disable any **Link** of any **Đơn vị**, without that Unit's agreement.
