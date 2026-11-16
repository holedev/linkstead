import {
  ArrowRightLeftIcon,
  ChartNoAxesColumnIcon,
  CornerDownRightIcon,
  EllipsisIcon,
  HistoryIcon,
  PencilIcon,
  PowerIcon,
  PowerOffIcon,
  QrCodeIcon,
  Share2Icon
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  Badge,
  Button,
  ConfirmDialog,
  CopyIconButton,
  ErrorText,
  Field,
  formatDate,
  formatDateTime,
  Modal
} from "@/components/app";
import { Button as UiButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { checkTarget } from "../../domain/target";
import { api, type HistoryEntry, type Link, type Visits } from "../api";
import { messageOf } from "../messages";
import { useSession } from "../session";
import { PreviewPanel } from "./preview-panel";
import { QrPanel } from "./qr-panel";

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
  if (entry.kind === "target") {
    return `${entry.at}-target-${entry.newTarget}`;
  }
  return entry.kind === "unit" ? `${entry.at}-unit-${entry.newUnitName}` : `${entry.at}-status-${entry.enabled}`;
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
      onChanged(await api.changeTarget(link.code, next, link.target));
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

const StatusBadge = ({ link }: { link: Link }) => {
  if (link.enabled) {
    return <Badge tone='ok'>Đang bật</Badge>;
  }
  return link.disabledBySystem ? (
    <Badge tone='danger'>Quản trị hệ thống đã tắt</Badge>
  ) : (
    <Badge tone='muted'>Đã tắt</Badge>
  );
};

type Task = "target" | "details" | "preview" | "history" | "visits" | "qr" | "disable" | null;

const TASK_TITLE = {
  details: "Sửa tên, ghi chú",
  history: "Lịch sử thay đổi",
  preview: "Xem trước khi chia sẻ",
  qr: "QR và logo",
  target: "Đổi đích",
  visits: "Lượt mở"
};

/** Everything that can be done to a Link beyond reading it, behind one button. */
const LinkActions = ({
  link,
  canEnable,
  busy,
  onTask,
  onEnable
}: {
  link: Link;
  canEnable: boolean;
  busy: boolean;
  onTask: (task: Task) => void;
  onEnable: () => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <UiButton
        aria-label={`Thao tác với link ${link.name}`}
        className='size-9 shrink-0 md:size-8'
        disabled={busy}
        size='icon'
        variant='outline'
      >
        <EllipsisIcon />
      </UiButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end' className='min-w-52'>
      <DropdownMenuItem onSelect={() => onTask("target")}>
        <ArrowRightLeftIcon />
        Đổi đích
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onTask("details")}>
        <PencilIcon />
        Sửa tên, ghi chú
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onTask("qr")}>
        <QrCodeIcon />
        QR và logo
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onTask("preview")}>
        <Share2Icon />
        Xem trước khi chia sẻ
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onTask("visits")}>
        <ChartNoAxesColumnIcon />
        Lượt mở
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onTask("history")}>
        <HistoryIcon />
        Lịch sử thay đổi
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {link.enabled && (
        <DropdownMenuItem onSelect={() => onTask("disable")} variant='destructive'>
          <PowerOffIcon />
          Tắt link
        </DropdownMenuItem>
      )}
      {!link.enabled && (
        <DropdownMenuItem disabled={!canEnable} onSelect={onEnable}>
          <PowerIcon />
          Bật lại link
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

/**
 * One Link: its QR, its address and where it leads, readable at a glance; everything else behind
 * the actions button. Nothing here can change the Mã link.
 */
const LinkRow = ({ link, onChanged }: { link: Link; onChanged: (link: Link) => void }) => {
  const { me } = useSession();
  const isSystemAdmin = me?.isSystemAdmin ?? false;
  const [task, setTask] = useState<Task>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Counts what may have changed the picture, so the small QR is fetched again.
  const [qrVersion, setQrVersion] = useState(0);
  const lockedBySystem = !link.enabled && link.disabledBySystem && !isSystemAdmin;
  const close = () => setTask(null);

  const setStatus = async (change: () => Promise<Link>) => {
    setTask(null);
    setBusy(true);
    setError("");
    try {
      onChanged(await change());
    } catch (failure) {
      setError(messageOf(failure));
    }
    setBusy(false);
  };

  return (
    <li className='flex gap-3 p-4 sm:gap-4'>
      <button
        aria-label={`QR của link ${link.name}. Mở để tải về hoặc đổi logo`}
        className='size-20 shrink-0 self-start overflow-hidden rounded-lg border bg-white outline-none transition hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:size-24'
        onClick={() => setTask("qr")}
        type='button'
      >
        <img
          alt=''
          className={`size-full ${link.enabled ? "" : "opacity-40"}`}
          height={96}
          loading='lazy'
          src={`/api/links/${link.code}/qr?v=${qrVersion}`}
          width={96}
        />
      </button>

      <div className='min-w-0 flex-1 space-y-1.5'>
        <div className='flex items-start gap-2'>
          <div className='flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1'>
            <h3 className='min-w-0 break-words font-medium leading-snug'>{link.name}</h3>
            <StatusBadge link={link} />
          </div>
          <LinkActions
            busy={busy}
            canEnable={!lockedBySystem}
            link={link}
            onEnable={() => setStatus(() => api.enableLink(link.code))}
            onTask={setTask}
          />
        </div>

        <div className='flex items-center gap-1'>
          <a
            className='min-w-0 break-all font-mono text-primary text-sm underline-offset-4 hover:underline'
            href={link.url}
            rel='noreferrer'
            target='_blank'
          >
            {link.url}
          </a>
          <CopyIconButton label='Sao chép link' value={link.url} />
        </div>

        <p className='flex items-start gap-1.5 text-muted-foreground text-sm'>
          <CornerDownRightIcon aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
          <span className='sr-only'>Đích:</span>
          <a
            className='min-w-0 break-all underline-offset-4 hover:underline'
            href={link.target}
            rel='noreferrer'
            target='_blank'
          >
            {link.target}
          </a>
        </p>

        {link.note && <p className='break-words text-muted-foreground text-sm'>{link.note}</p>}
        <p className='text-muted-foreground text-xs'>
          Khoảng {number.format(link.visits)} lượt mở - tạo ngày {formatDate(link.createdAt)}
        </p>
        {!link.enabled && (
          <p className='text-muted-foreground text-xs'>
            Người mở link này đang thấy trang thông báo link đã bị tắt.
            {lockedBySystem && " Link do Quản trị hệ thống tắt nên chỉ Quản trị hệ thống bật lại được."}
          </p>
        )}
        <ErrorText>{error}</ErrorText>
      </div>

      <Modal
        description={link.name}
        onClose={close}
        open={task !== null && task !== "disable"}
        title={task && task !== "disable" ? TASK_TITLE[task] : ""}
      >
        {task === "target" && <TargetForm link={link} onChanged={onChanged} onDone={close} />}
        {task === "details" && <DetailsForm link={link} onChanged={onChanged} onDone={close} />}
        {task === "history" && <HistoryPanel link={link} />}
        {task === "visits" && <VisitsPanel link={link} />}
        {task === "preview" && <PreviewPanel link={link} onChanged={onChanged} onDone={close} />}
        {task === "qr" && (
          <QrPanel
            link={link}
            onChanged={(changed) => {
              onChanged(changed);
              setQrVersion((value) => value + 1);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        busy={busy}
        confirmLabel='Tắt link'
        onCancel={close}
        onConfirm={() => setStatus(() => api.disableLink(link.code))}
        open={task === "disable"}
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
    </li>
  );
};

export { HistoryList, LinkRow };
