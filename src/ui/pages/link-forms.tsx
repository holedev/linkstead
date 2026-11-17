import { FolderIcon, ShieldAlertIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Badge, Button, ConfirmDialog, ErrorText, Field, formatDate, formatDateTime, Modal } from "@/components/app";
import { cn } from "@/lib/utils";
import { checkTarget } from "../../domain/target";
import { api, type HistoryEntry, type Link, type LinkGroup, type Visits } from "../api";
import { messageOf } from "../messages";
import { useSession } from "../session";
import { formatVietnam, isPast } from "./access-form";
import { VisitSources } from "./visit-sources";

/**
 * The parts of a Link that both its row in the list and its own page use: its badges, what a
 * visitor meets instead of the Đích, and the forms and panels that change or read it.
 */

const RECENT_DAYS = 30;
const number = new Intl.NumberFormat("vi-VN");

/** `2027-03-01` as `01/03/2027`, without a trip through a time zone. */
const formatDay = (day: string): string => day.split("-").reverse().join("/");

const authorOf = (by: HistoryEntry["by"]): string => {
  if (!by) {
    return "không rõ";
  }
  return by.kind === "account" ? by.email : `khóa API "${by.name}"`;
};

const statusText = (entry: Extract<HistoryEntry, { kind: "status" }>): string => {
  if (entry.enabled) {
    return "Bật link";
  }
  return entry.bySystem ? "Tắt link (với tư cách Quản trị hệ thống)" : "Tắt link";
};

/** Loads once when its panel opens; `stamp` changes when the Link does, which loads it again. */
const usePanel = <T,>(stamp: string, load: () => Promise<T>) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` is the same call on every render; `stamp` is the reload trigger
  useEffect(() => {
    let current = true;
    setError("");
    load()
      .then((value) => current && setData(value))
      .catch((failure) => current && setError(messageOf(failure)));
    return () => {
      current = false;
    };
  }, [stamp]);

  return { data, error };
};

const entryKey = (entry: HistoryEntry): string => {
  switch (entry.kind) {
    case "target":
      return `${entry.at}-target-${entry.newTarget}`;
    case "unit":
      return `${entry.at}-unit-${entry.newUnitName}`;
    case "status":
      return `${entry.at}-status-${entry.enabled}`;
    default:
      return `${entry.at}-${entry.kind}`;
  }
};

const EntryText = ({ entry }: { entry: HistoryEntry }) => {
  if (entry.kind === "target") {
    return (
      <p className='break-all'>
        Đổi đích từ <span className='text-muted-foreground line-through'>{entry.oldTarget}</span> sang{" "}
        <span className='font-medium'>{entry.newTarget}</span>
      </p>
    );
  }
  if (entry.kind === "unit") {
    return (
      <p className='break-words'>
        Chuyển link từ {entry.oldUnitName} sang <span className='font-medium'>{entry.newUnitName}</span>
      </p>
    );
  }
  if (entry.kind === "deleted") {
    return <p className='font-medium text-destructive'>Xóa link</p>;
  }
  return <p>{statusText(entry)}</p>;
};

/** A Link's changes, newest first: when, who, what. */
const HistoryList = ({ entries, createdAt }: { entries: HistoryEntry[]; createdAt: string }) =>
  entries.length === 0 ? (
    <p className='mt-2 text-muted-foreground text-sm'>Chưa có thay đổi nào từ khi tạo ngày {formatDate(createdAt)}.</p>
  ) : (
    <ol className='mt-2 space-y-3'>
      {entries.map((entry) => (
        <li className='text-sm' key={entryKey(entry)}>
          <p className='text-muted-foreground text-xs'>
            {formatDateTime(entry.at)} - {authorOf(entry.by)}
          </p>
          <EntryText entry={entry} />
        </li>
      ))}
    </ol>
  );

const HistoryPanel = ({ link }: { link: Link }) => {
  const { data, error } = usePanel(`${link.target}|${link.enabled}|${link.disabledBySystem}`, () =>
    api.history(link.code).then((answer) => answer.history)
  );

  return (
    <div>
      <ErrorText>{error}</ErrorText>
      {!(data || error) && <p className='mt-2 text-muted-foreground text-sm'>Đang tải...</p>}
      {data && <HistoryList createdAt={link.createdAt} entries={data} />}
    </div>
  );
};

/** Today's date where the university is, as `2027-03-01`: Lượt mở are counted by Vietnamese day. */
const vietnamToday = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

/** The `count` days up to and including `last`, oldest first, as `2027-03-01`. */
const daysUpTo = (last: string, count: number): string[] => {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) =>
    new Date(end - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10)
  );
};

/**
 * Lượt mở of the last 30 days as bars, today the darkest. A day nobody opened the Link is an empty
 * slot, not a missing one, so the gaps show. The exact figures are in the list below it.
 */
const VisitsChart = ({ days }: { days: Visits["days"] }) => {
  const counts = new Map(days.map((day) => [day.day, day.count]));
  const shown = daysUpTo(vietnamToday(), RECENT_DAYS).map((day) => ({ count: counts.get(day) ?? 0, day }));
  const peak = Math.max(1, ...shown.map((day) => day.count));
  const total = shown.reduce((sum, day) => sum + day.count, 0);
  const first = shown[0]?.day ?? "";
  const last = shown.at(-1)?.day ?? "";

  return (
    <figure className='space-y-1.5'>
      <div
        aria-label={`Khoảng ${number.format(total)} lượt mở trong ${RECENT_DAYS} ngày, nhiều nhất ${number.format(peak)} một ngày`}
        className='flex h-32 items-end gap-0.5 border-b'
        role='img'
      >
        {shown.map((day, index) => (
          <div
            className={cn(
              "min-w-0 flex-1 rounded-t-sm",
              index === shown.length - 1 ? "bg-primary" : "bg-primary/40",
              day.count === 0 && "bg-transparent"
            )}
            key={day.day}
            style={{ height: `${Math.max(day.count ? 3 : 0, (day.count / peak) * 100)}%` }}
            title={`${formatDay(day.day)}: ${number.format(day.count)} lượt mở`}
          />
        ))}
      </div>
      <figcaption className='flex justify-between text-muted-foreground text-xs tabular-nums'>
        <span>{formatDay(first)}</span>
        <span>{total ? `Cao nhất ${number.format(peak)}/ngày` : "Chưa có lượt mở nào"}</span>
        <span>{formatDay(last)}</span>
      </figcaption>
    </figure>
  );
};

const VisitsPanel = ({ link }: { link: Link }) => {
  const { data, error } = usePanel<Visits>(link.code, () => api.visits(link.code));
  const recent = data?.days.slice(-RECENT_DAYS).reverse() ?? [];
  const peak = Math.max(1, ...recent.map((day) => day.count));

  return (
    <div>
      <p className='text-muted-foreground text-xs'>
        Con số ước tính: mỗi lần mở link được đếm một lượt, không phải số người. Lượt mở do Zalo, Facebook tự tạo để
        hiện bản xem trước được bỏ qua khi nhận ra được.
      </p>
      <ErrorText>{error}</ErrorText>
      {!(data || error) && <p className='mt-2 text-muted-foreground text-sm'>Đang tải...</p>}
      {data && (
        <p className='mt-2 text-sm'>
          Tổng cộng khoảng <strong>{number.format(data.total)}</strong> lượt mở.
        </p>
      )}
      {data && (
        <div className='mt-4'>
          <VisitsChart days={data.days} />
        </div>
      )}
      {data && data.days.length > RECENT_DAYS && (
        <p className='mt-1 text-muted-foreground text-xs'>Dưới đây là {RECENT_DAYS} ngày gần nhất có lượt mở.</p>
      )}
      {recent.length > 0 && (
        <table className='mt-2 w-full text-sm'>
          <thead className='sr-only'>
            <tr>
              <th>Ngày</th>
              <th>Lượt mở</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((day) => (
              <tr key={day.day}>
                <td className='w-24 py-0.5 pr-2 text-muted-foreground tabular-nums'>{formatDay(day.day)}</td>
                <td className='py-0.5'>
                  <div className='flex items-center gap-2'>
                    <div
                      aria-hidden='true'
                      className='h-2 min-w-0.5 rounded-sm bg-primary'
                      style={{ width: `${(day.count / peak) * 70}%` }}
                    />
                    <span className='tabular-nums'>{number.format(day.count)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && (
        <div className='mt-5 border-t pt-4'>
          <VisitSources countries={data.countries} referrers={data.referrers} />
        </div>
      )}
    </div>
  );
};

/**
 * Rewords the Tên link and its note. Mounted when its panel opens, so it always starts from the
 * Link as it is now. No confirmation: nothing a visitor sees changes, and it can be reworded again.
 */
const DetailsForm = ({
  link,
  onChanged,
  onDone
}: {
  link: Link;
  onChanged: (link: Link) => void;
  onDone: () => void;
}) => {
  const [name, setName] = useState(link.name);
  const [note, setNote] = useState(link.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onChanged(await api.updateLinkDetails(link.code, name, note));
      onDone();
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  };

  return (
    <form className='space-y-4' onSubmit={save}>
      <Field hint='Chỉ người trong đơn vị thấy. Mã link và địa chỉ link không đổi.' label='Tên link'>
        {(props) => (
          <input {...props} maxLength={200} onChange={(event) => setName(event.target.value)} required value={name} />
        )}
      </Field>
      <Field label='Ghi chú (không bắt buộc)'>
        {(props) => (
          <textarea
            {...props}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            value={note}
          />
        )}
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>Hủy</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>
    </form>
  );
};

/**
 * Changes the Đích in two steps: type the new one, then confirm it beside the old one. The second
 * step is the confirmation the rule asks for - the write happens only from its button.
 */
const TargetForm = ({
  link,
  onChanged,
  onDone
}: {
  link: Link;
  onChanged: (link: Link) => void;
  onDone: () => void;
}) => {
  const [draft, setDraft] = useState("");
  const [reviewing, setReviewing] = useState(false);
  // A preview set by hand describes the old Đích; dropping it is the usual wish, so it is the default.
  const hasOwnPreview = Boolean(link.preview.title || link.preview.description || link.preview.image);
  const [resetPreview, setResetPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = draft.trim();

  const review = (event: FormEvent) => {
    event.preventDefault();
    const problem = next === link.target ? "unchanged" : checkTarget(next, [window.location.hostname]);
    setError(problem ? messageOf({ code: "bad-target", problem }) : "");
    setReviewing(!problem);
  };

  const change = async () => {
    setBusy(true);
    setError("");
    try {
      onChanged(await api.changeTarget(link.code, next, link.target, hasOwnPreview && resetPreview));
      onDone();
    } catch (failure) {
      setError(messageOf(failure));
      setReviewing(false);
      setBusy(false);
    }
  };

  if (reviewing) {
    return (
      <div className='space-y-4 text-sm'>
        <p className='text-muted-foreground'>Người mở {link.url} sẽ được chuyển tới đích mới ngay sau khi đổi.</p>
        <dl className='space-y-3 rounded-lg border bg-muted/50 p-3'>
          <div>
            <dt className='text-muted-foreground text-xs'>Đích hiện tại</dt>
            <dd className='break-all text-muted-foreground line-through'>{link.target}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>Đích mới</dt>
            <dd className='break-all font-medium'>{next}</dd>
          </div>
        </dl>
        {hasOwnPreview && (
          <label className='flex items-start gap-2 rounded-lg border p-3'>
            <input
              checked={resetPreview}
              className='mt-1'
              onChange={(event) => setResetPreview(event.target.checked)}
              type='checkbox'
            />
            <span>
              Bỏ phần xem trước đã tự đặt
              {link.preview.title && <> ("{link.preview.title}")</>}, dùng tiêu đề, mô tả và ảnh của trang đích mới khi
              dán link vào Zalo, Facebook.
            </span>
          </label>
        )}
        <p className='text-muted-foreground'>Thay đổi được ghi vào lịch sử của link cùng email của bạn.</p>
        <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
          <Button disabled={busy} onClick={() => setReviewing(false)}>
            Quay lại
          </Button>
          <Button disabled={busy} onClick={change} variant='primary'>
            {busy ? "Đang đổi..." : "Đổi đích"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className='space-y-4' onSubmit={review}>
      <div className='text-sm'>
        <p className='text-muted-foreground text-xs'>Đích hiện tại</p>
        <p className='break-all'>{link.target}</p>
      </div>
      <Field hint='Mã link và QR đã in giữ nguyên; chỉ nơi người mở được chuyển tới thay đổi.' label='Đích mới'>
        {(props) => (
          <input
            {...props}
            inputMode='url'
            onChange={(event) => setDraft(event.target.value)}
            placeholder='https://'
            required
            spellCheck={false}
            value={draft}
          />
        )}
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>Hủy</Button>
        <Button type='submit' variant='primary'>
          Xem lại
        </Button>
      </div>
    </form>
  );
};

/** Puts the Link in another of its Đơn vị's Nhóm, or in none. Nothing a visitor sees changes. */
const GroupForm = ({
  link,
  groups,
  onChanged,
  onDone
}: {
  link: Link;
  groups: LinkGroup[];
  onChanged: (link: Link) => void;
  onDone: () => void;
}) => {
  const [groupId, setGroupId] = useState<number | null>(link.groupId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onChanged(await api.setLinkGroup(link.code, groupId));
      onDone();
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  };

  if (groups.length === 0) {
    return (
      <div className='space-y-4 text-sm'>
        <p className='text-muted-foreground'>Đơn vị chưa có nhóm nào. Tạo nhóm bằng nút "Tạo nhóm" ở danh sách link.</p>
        <div className='flex justify-end'>
          <Button onClick={onDone}>Đóng</Button>
        </div>
      </div>
    );
  }

  return (
    <form className='space-y-4' onSubmit={save}>
      <Field label='Nhóm'>
        {(props) => (
          <select
            {...props}
            onChange={(event) => setGroupId(event.target.value ? Number(event.target.value) : null)}
            value={groupId ?? ""}
          >
            <option value=''>Không nhóm</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>Hủy</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>
    </form>
  );
};

/** The Nhóm a Link is in, named beside it - or nothing, for a Link in none. */
const GroupBadge = ({ groupId, groups }: { groupId: number | null; groups: LinkGroup[] }) => {
  const group = groups.find((candidate) => candidate.id === groupId);
  return group ? (
    <span className='inline-flex max-w-48 items-center gap-1 truncate rounded-full border px-2 py-0.5 text-muted-foreground text-xs'>
      <FolderIcon aria-hidden='true' className='size-3 shrink-0' />
      <span className='truncate'>{group.name}</span>
    </span>
  ) : null;
};

const EnabledBadge = ({ link }: { link: Link }) => {
  if (link.enabled) {
    return <Badge tone='ok'>Đang bật</Badge>;
  }
  return link.disabledBySystem ? (
    <Badge tone='danger'>Quản trị hệ thống đã tắt</Badge>
  ) : (
    <Badge tone='muted'>Đã tắt</Badge>
  );
};

const StatusBadge = ({ link }: { link: Link }) => (
  <>
    {isPast(link.expiresAt) ? <Badge tone='muted'>Đã hết hạn</Badge> : <EnabledBadge link={link} />}
    {link.hasPassword && <Badge tone='muted'>Có mật khẩu</Badge>}
    {link.expiresAt && !isPast(link.expiresAt) && <Badge tone='muted'>Hết hạn {formatVietnam(link.expiresAt)}</Badge>}
    {link.unsafeSince && <Badge tone='danger'>Đích không an toàn</Badge>}
    {link.archived && <Badge tone='muted'>Đã lưu trữ</Badge>}
  </>
);

/** What a visitor meets instead of the Đích, said under the Link where it is not simply sent on. */
const LinkNotices = ({ link, lockedBySystem }: { link: Link; lockedBySystem: boolean }) => (
  <>
    {link.unsafeSince && (
      <p className='flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-destructive text-xs'>
        <ShieldAlertIcon aria-hidden='true' className='mt-px size-3.5 shrink-0' />
        <span>
          Từ {formatDate(link.unsafeSince)}, Google Safe Browsing xếp đích này vào danh sách không an toàn (lừa đảo hoặc
          mã độc). Người mở link đang gặp trang cảnh báo thay vì được chuyển đi. Hãy kiểm tra trang đích, hoặc đổi sang
          đích khác.
        </span>
      </p>
    )}
    {link.enabled && link.expiresAt && isPast(link.expiresAt) && (
      <p className='text-muted-foreground text-xs'>
        Link đã hết hạn lúc {formatVietnam(link.expiresAt)}; người mở đang thấy trang báo hết hạn. Đặt hạn mới trong
        "Mật khẩu và hạn dùng" để mở lại.
      </p>
    )}
    {!link.enabled && (
      <p className='text-muted-foreground text-xs'>
        Người mở link này đang thấy trang thông báo link đã bị tắt.
        {lockedBySystem && " Link do Quản trị hệ thống tắt nên chỉ Quản trị hệ thống bật lại được."}
      </p>
    )}
  </>
);

/**
 * Deleting, confirmed by typing the Mã link back - the one step here that cannot be undone. The
 * code stays taken for good (ADR-0004), so what is printed never leads anywhere new.
 */
const DeleteLinkDialog = ({
  link,
  open,
  onClose,
  onDeleted
}: {
  link: Link;
  open: boolean;
  onClose: () => void;
  onDeleted: (code: string) => void;
}) => {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = typed.trim().toLowerCase() === link.code;

  const remove = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.deleteLink(link.code, typed.trim());
      onDeleted(link.code);
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  };

  return (
    <Modal description={link.name} onClose={onClose} open={open} title='Xóa link'>
      <form className='space-y-4 text-sm' onSubmit={remove}>
        <div className='space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3'>
          <p>
            Người mở <span className='break-all font-mono'>{link.url}</span> - kể cả từ QR đã in - sẽ thấy trang báo
            liên kết đã bị xóa.
          </p>
          <p>
            Link biến khỏi danh sách, khỏi số liệu và tệp CSV của đơn vị. Mã <strong>{link.code}</strong> không bao giờ
            được cấp lại cho link khác. Không hoàn tác được.
          </p>
          <p className='text-muted-foreground'>
            Chỉ muốn link biến khỏi danh sách mà vẫn mở được? Hãy dùng "Lưu trữ". Chỉ muốn tạm ngưng? Hãy "Tắt link".
          </p>
        </div>
        <Field label={`Gõ lại mã link "${link.code}" để xác nhận`}>
          {(props) => (
            <input
              {...props}
              autoCapitalize='off'
              autoComplete='off'
              onChange={(event) => setTyped(event.target.value)}
              spellCheck={false}
              value={typed}
            />
          )}
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
          <Button onClick={onClose}>Hủy</Button>
          <Button disabled={busy || !matches} type='submit' variant='danger'>
            {busy ? "Đang xóa..." : "Xóa vĩnh viễn"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

/** Who may do what to a Link, from the signed-in account. */
const useLinkRights = (link: Link) => {
  const { me } = useSession();
  const isSystemAdmin = me?.isSystemAdmin ?? false;
  const role = me?.units.find((unit) => unit.unitId === link.unitId)?.role;
  return {
    /** A Quản lý đơn vị of the Link's Đơn vị, or a Quản trị hệ thống. */
    canDelete: isSystemAdmin || role === "manager",
    isSystemAdmin,
    /** Switched off by a Quản trị hệ thống: only one of them switches it back on. */
    lockedBySystem: !link.enabled && link.disabledBySystem && !isSystemAdmin
  };
};

/** Asked before switching a Link off: everyone holding the printed QR meets a notice instead. */
const DisableLinkDialog = ({
  link,
  open,
  busy,
  onConfirm,
  onCancel
}: {
  link: Link;
  open: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const { isSystemAdmin } = useLinkRights(link);
  return (
    <ConfirmDialog
      busy={busy}
      confirmLabel='Tắt link'
      onCancel={onCancel}
      onConfirm={onConfirm}
      open={open}
      title={`Tắt link "${link.name}"`}
    >
      <p>
        Người mở {link.url} - kể cả từ QR đã in - sẽ thấy trang thông báo link đã bị tắt thay vì được chuyển tới đích.
        Mã link vẫn được giữ, không cấp cho link khác.
      </p>
      <p className='mt-2'>
        {isSystemAdmin
          ? "Bạn là Quản trị hệ thống, nên sau khi bạn tắt chỉ Quản trị hệ thống bật lại được link này."
          : "Thành viên của đơn vị có thể bật lại link bất cứ lúc nào."}
      </p>
    </ConfirmDialog>
  );
};

export {
  DeleteLinkDialog,
  DetailsForm,
  DisableLinkDialog,
  GroupBadge,
  GroupForm,
  HistoryList,
  HistoryPanel,
  LinkNotices,
  number,
  StatusBadge,
  TargetForm,
  useLinkRights,
  usePanel,
  VisitsChart,
  VisitsPanel
};
