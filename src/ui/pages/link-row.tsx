import { type FormEvent, useEffect, useState } from "react";
import { checkTarget } from "../../domain/target";
import { api, type HistoryEntry, type Link, type Visits } from "../api";
import { Badge, Button, ConfirmDialog, CopyButton, ErrorText, Field, formatDate, formatDateTime } from "../components";
import { messageOf } from "../messages";
import { useSession } from "../session";

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
        Đổi đích từ <span className='text-muted line-through'>{entry.oldTarget}</span> sang{" "}
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
    <p className='mt-2 text-muted text-sm'>Chưa có thay đổi nào từ khi tạo ngày {formatDate(createdAt)}.</p>
  ) : (
    <ol className='mt-2 space-y-3'>
      {entries.map((entry) => (
        <li className='text-sm' key={entryKey(entry)}>
          <p className='text-muted text-xs'>
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
    <div className='rounded-md border border-line bg-page p-3'>
      <h4 className='font-medium text-sm'>Lịch sử thay đổi</h4>
      <ErrorText>{error}</ErrorText>
      {!(data || error) && <p className='mt-2 text-muted text-sm'>Đang tải...</p>}
      {data && <HistoryList createdAt={link.createdAt} entries={data} />}
    </div>
  );
};

const VisitsPanel = ({ link }: { link: Link }) => {
  const { data, error } = usePanel<Visits>(link.code, () => api.visits(link.code));
  const recent = data?.days.slice(-RECENT_DAYS).reverse() ?? [];
  const peak = Math.max(1, ...recent.map((day) => day.count));

  return (
    <div className='rounded-md border border-line bg-page p-3'>
      <h4 className='font-medium text-sm'>Lượt mở</h4>
      <p className='mt-1 text-muted text-xs'>
        Con số ước tính: mỗi lần mở link được đếm một lượt, không phải số người. Lượt mở do Zalo, Facebook tự tạo để
        hiện bản xem trước được bỏ qua khi nhận ra được.
      </p>
      <ErrorText>{error}</ErrorText>
      {!(data || error) && <p className='mt-2 text-muted text-sm'>Đang tải...</p>}
      {data && (
        <p className='mt-2 text-sm'>
          Tổng cộng khoảng <strong>{number.format(data.total)}</strong> lượt mở.
        </p>
      )}
      {data && data.days.length > RECENT_DAYS && (
        <p className='mt-1 text-muted text-xs'>Dưới đây là {RECENT_DAYS} ngày gần nhất có lượt mở.</p>
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
                <td className='w-24 py-0.5 pr-2 text-muted tabular-nums'>{formatDay(day.day)}</td>
                <td className='py-0.5'>
                  <div className='flex items-center gap-2'>
                    <div
                      aria-hidden='true'
                      className='h-2 min-w-0.5 rounded-sm bg-brand'
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

type Panel = "target" | "history" | "visits" | null;

/**
 * One Link and everything a Thành viên may do to it. Changing the Đích and switching the Link off
 * both go through a confirmation; nothing here can change the Mã link.
 */
const LinkRow = ({ link, onChanged }: { link: Link; onChanged: (link: Link) => void }) => {
  const { me } = useSession();
  const isSystemAdmin = me?.isSystemAdmin ?? false;
  const [panel, setPanel] = useState<Panel>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<"target" | "disable" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (next: Panel) => {
    setError("");
    setPanel((current) => (current === next ? null : next));
  };
  const lockedBySystem = !link.enabled && link.disabledBySystem && !isSystemAdmin;

  /** Runs a change, keeps the visit count the server did not recount, and reports a refusal. */
  const run = async (change: () => Promise<Link>) => {
    setBusy(true);
    setError("");
    try {
      onChanged(await change());
      return true;
    } catch (failure) {
      setError(messageOf(failure));
      return false;
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const reviewTarget = (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim();
    const problem = next === link.target ? "unchanged" : checkTarget(next, [window.location.hostname]);
    if (problem) {
      setError(messageOf({ code: "bad-target", problem }));
      return;
    }
    setError("");
    setConfirming("target");
  };

  const changeTarget = async () => {
    if (await run(() => api.changeTarget(link.code, draft.trim(), link.target))) {
      setDraft("");
      setPanel("history");
    }
  };

  return (
    <li className='space-y-3 p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <h3 className='min-w-0 flex-1 break-words font-medium'>{link.name}</h3>
        {link.enabled && <Badge tone='ok'>Đang bật</Badge>}
        {!link.enabled && (
          <Badge tone={link.disabledBySystem ? "danger" : "muted"}>
            {link.disabledBySystem ? "Quản trị hệ thống đã tắt" : "Đã tắt"}
          </Badge>
        )}
      </div>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <code className='min-w-0 flex-1 break-all font-mono text-brand text-sm'>{link.url}</code>
        <CopyButton value={link.url} />
      </div>
      <p className='break-all text-muted text-sm'>
        Đích:{" "}
        <a className='underline' href={link.target} rel='noreferrer' target='_blank'>
          {link.target}
        </a>
      </p>
      {link.note && <p className='break-words text-muted text-sm'>Ghi chú: {link.note}</p>}
      <p className='text-muted text-xs'>
        Tạo ngày {formatDate(link.createdAt)} - khoảng {number.format(link.visits)} lượt mở
      </p>
      {!link.enabled && (
        <p className='text-muted text-sm'>
          Người mở link này đang thấy trang thông báo link đã bị tắt.
          {lockedBySystem && " Link do Quản trị hệ thống tắt nên chỉ Quản trị hệ thống bật lại được."}
        </p>
      )}

      <div className='flex flex-wrap gap-2'>
        <Button aria-expanded={panel === "target"} onClick={() => toggle("target")}>
          Đổi đích
        </Button>
        <Button aria-expanded={panel === "history"} onClick={() => toggle("history")}>
          Lịch sử
        </Button>
        <Button aria-expanded={panel === "visits"} onClick={() => toggle("visits")}>
          Lượt mở
        </Button>
        {link.enabled && (
          <Button disabled={busy} onClick={() => setConfirming("disable")}>
            Tắt link
          </Button>
        )}
        {!(link.enabled || lockedBySystem) && (
          <Button disabled={busy} onClick={() => run(() => api.enableLink(link.code))}>
            {busy ? "Đang bật..." : "Bật lại link"}
          </Button>
        )}
      </div>

      {panel === "target" && (
        <form className='space-y-3 rounded-md border border-line bg-page p-3' onSubmit={reviewTarget}>
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
          <Button type='submit' variant='primary'>
            Xem lại và đổi đích
          </Button>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
      {panel === "history" && <HistoryPanel link={link} />}
      {panel === "visits" && <VisitsPanel link={link} />}

      <ConfirmDialog
        busy={busy}
        confirmLabel={busy ? "Đang đổi..." : "Đổi đích"}
        onCancel={() => setConfirming(null)}
        onConfirm={changeTarget}
        open={confirming === "target"}
        title={`Đổi đích của "${link.name}"`}
        tone='primary'
      >
        <p>Người mở {link.url} sẽ được chuyển tới đích mới ngay sau khi đổi.</p>
        <dl className='mt-3 space-y-2'>
          <div>
            <dt className='font-medium text-ink'>Đích hiện tại</dt>
            <dd className='break-all'>{link.target}</dd>
          </div>
          <div>
            <dt className='font-medium text-ink'>Đích mới</dt>
            <dd className='break-all text-ink'>{draft.trim()}</dd>
          </div>
        </dl>
        <p className='mt-3'>Thay đổi được ghi vào lịch sử của link cùng email của bạn.</p>
      </ConfirmDialog>

      <ConfirmDialog
        busy={busy}
        confirmLabel={busy ? "Đang tắt..." : "Tắt link"}
        onCancel={() => setConfirming(null)}
        onConfirm={() => run(() => api.disableLink(link.code))}
        open={confirming === "disable"}
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
