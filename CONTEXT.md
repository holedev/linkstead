# linkstead

Permanent links and QR codes under an organization's own domain, whose destination can be changed
after they have been printed or sent. One installation serves one Organization and all its Units.

Each term gives its Vietnamese name (Vi:), the one the Vietnamese UI uses.

## Language

**Organization** (Vi: Tổ chức):
The one body an installation serves - a university, a company, an association. It has one domain,
under which every **Link** lives, and is divided into **Units**. It has a name, a language, a time
zone and a colour, and may restrict **Accounts** to its own email domains.
_Avoid_: tenant, workspace, university, company.

**Link** (Vi: Liên kết):
A permanent address under the **Organization**'s domain that sends whoever opens it to a
**Target**. It exists so that something already printed or sent keeps working when its destination
moves.
_Avoid_: short link, URL rút gọn, redirect.

**Link Code** (Vi: Mã link):
The part of a **Link** a person reads and types. Chosen when the Link is created, or generated when
left blank; never changed afterwards and never given to another Link, even once its own is disabled.
_Avoid_: slug, alias, code (alone - it collides with **QR**).

**Group** (Vi: Nhóm):
A **Unit**'s own way of sorting its **Links** - by event, by year, by issue. A Link is in at most
one Group, of its own Unit; it leaves it when it moves to another Unit. Unlike a Link, a Group can
be renamed and deleted: nothing printed carries it, and deleting one leaves its Links in no Group.
The Links in no Group are the Unit's shared ones; the UI shows each Group as a folder beside them.
_Avoid_: folder, tag, category, campaign.

**Link Name** (Vi: Tên link):
What a **Link** is for, in the words of whoever created it - "Conference poster, A3 print". Every
Link has one, because a **Link Code** alone tells nobody which piece of paper it sits on.
_Distinct from_: the **Link Code**, which is the address and never changes; the name may be reworded.
_Avoid_: title, label.

**Target** (Vi: Đích):
Where a **Link** currently sends its visitor - any `https` address. The only part of a Link that
changes, and every change is recorded with who made it.
_Avoid_: destination URL, original link.

**QR**:
A printable picture of a **Link**. It always carries the Link, never the **Target**, which is what
lets the Target change after printing. It shows the **Organization**'s logo unless its **Unit** set
another, or the Link itself was given one or none - a choice about the picture, never about the Link.
_Avoid_: dynamic QR, QR code of the target.

**Unit** (Vi: Đơn vị):
A part of the **Organization** that owns **Links** - a department, a journal, an office. A Link
belongs to its Unit, never to the person who created it, so it outlives that person's account. A
Link may be moved to another Unit without its address changing, and a Unit cannot be dissolved
while it still owns one.
_Avoid_: team, workspace, tenant.

**Unit Manager** (Vi: Quản lý đơn vị):
The member of a **Unit** who adds and removes its other members and issues its **API Keys**. The
first one is named by a **System Administrator** when the Unit is created; a Unit may have several
and always has at least one.
_Avoid_: owner, admin (alone - it collides with **System Administrator**).

**Account** (Vi: Tài khoản):
One person, known by an email address the **Organization** accepts. It is created for them by
someone already inside - there is no signing oneself up - and may belong to several **Units** at
once.
_Avoid_: user, login.

**Member** (Vi: Thành viên):
An **Account** that belongs to a **Unit** and may therefore create and change that Unit's
**Links**. An account in no Unit can create nothing.
_Avoid_: user.

**API Key** (Vi: Khóa API):
What lets an application act for one **Unit**, on that Unit's **Links** only. It belongs to the
Unit, never to a person.
_Avoid_: token, personal key.

**Reserved Code** (Vi: Mã dành riêng):
A **Link Code** nobody may take by being first - the names of departments, of the Organization's
own programmes, of the system's own pages. Only a **System Administrator** hands one out.

**Visit** (Vi: Lượt mở):
One opening of a **Link**, counted per Link per day, and per day by **Country**, **Referring
Site**, **Device** and **Browser**. The day is the **Organization**'s, in its time zone. Nothing that
identifies the visitor is kept. It is an estimate of interest, not a number of people: openings a
machine makes to build a preview are left out where they can be recognised. Where Visits go through
Analytics Engine, the hour of each is also known, for three months (ADR-0008).
_Avoid_: click, scan, hit.

**Country** (Vi: Quốc gia):
The country a **Visit** came from, as the network in front of the system reports it. Only ever a
count (ADR-0005).

**Referring Site** (Vi: Nguồn giới thiệu):
The site a **Visit** came from - its host name and nothing else of the address. Usually unknown:
a scanned **QR**, a typed address and most chat apps send none (ADR-0005).
_Avoid_: referrer URL, traffic source.

**Device** (Vi: Thiết bị):
The kind of device a **Visit** came from - phone, tablet, computer or other - and nothing finer:
no model, no system version. Only ever a count (ADR-0008).

**Browser** (Vi: Trình duyệt):
The family of browser a **Visit** came from - Chrome, Safari, or the app it was opened inside, such
as Zalo or Facebook - without a version. Read from the user agent, which is then dropped. Only ever
a count (ADR-0008).
_Avoid_: user agent.

**Disabled Link** (Vi: Link bị tắt):
A **Link** that shows the Organization's notice instead of sending its visitor on. Its **Link
Code** stays taken. A Unit may switch its own Links off and on; one switched off by a **System
Administrator** only a System Administrator switches back on.
_Distinct from_: a **Deleted Link**, which is gone for good; an **Archived Link**, which still opens.

**Link Password** (Vi: Mật khẩu link):
A word a Unit sets on a **Link** and shares with the people it means to let through. They give it
before being sent to the **Target** (ADR-0006). Not an **Account**'s password.
_Avoid_: PIN, access code.

**Expired Link** (Vi: Link hết hạn):
A **Link** past the moment its Unit set. It shows the Organization's notice, like a **Disabled
Link**, until the moment is moved or removed. Its **Link Code** stays taken (ADR-0006).

**Archived Link** (Vi: Link lưu trữ):
A **Link** put away from its Unit's list because nobody works on it any more. It still opens and
counts - archiving is tidying, not switching off.
_Avoid_: hidden, inactive.

**Deleted Link** (Vi: Link đã xóa):
A **Link** a **Unit Manager** or a **System Administrator** deleted. It opens nowhere and is listed
nowhere, but its **Link Code** stays taken for ever: what is printed must never lead somewhere new
(ADR-0004).
_Avoid_: removed, freed code.

**System Administrator** (Vi: Quản trị hệ thống):
The role that sets the **Organization**'s settings, creates **Units**, and may disable any
**Link** of any Unit, without that Unit's agreement.
