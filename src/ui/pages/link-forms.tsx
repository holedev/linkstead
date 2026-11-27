import { FolderIcon, ShieldAlertIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorText,
  Field,
  formatDate,
  formatDateTime,
  formatNumber,
  Modal
} from "@/components/app";
import { cn } from "@/lib/utils";
import { checkTarget } from "../../domain/target";
import { dayIn } from "../../domain/time-zone";
import { api, type HistoryEntry, type Link, type LinkGroup, type Visits } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";
import { organization } from "../organization";
import { useSession } from "../session";
import { isPast } from "./access-form";
import { HourlyVisitsChart } from "./hourly-visits";
import { VisitSources } from "./visit-sources";

/**
 * The parts of a Link that both its row in the list and its own page use: its badges, what a
 * visitor meets instead of the Target, and the forms and panels that change or read it.
 */

const RECENT_DAYS = 30;
const t = text().linkForms;
const { common } = text();

/** Numbers as the Organization's language writes them. */
const number = { format: formatNumber };

/** `2027-03-01` as `01/03/2027`, without a trip through a time zone. */
const formatDay = (day: string): string => day.split("-").reverse().join("/");

const authorOf = (by: HistoryEntry["by"]): string => {
  if (!by) {
    return t.byUnknown;
  }
  return by.kind === "account" ? by.email : t.byKey(by.name);
};

const statusText = (entry: Extract<HistoryEntry, { kind: "status" }>): string => {
  if (entry.enabled) {
    return t.statusOn;
  }
  return entry.bySystem ? t.statusOffBySystem : t.statusOff;
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
        {t.entryTargetFrom} <span className='text-muted-foreground line-through'>{entry.oldTarget}</span> {t.entryTo}{" "}
        <span className='font-medium'>{entry.newTarget}</span>
      </p>
    );
  }
  if (entry.kind === "unit") {
    return (
      <p className='break-words'>
        {t.entryMovedFrom} {entry.oldUnitName} {t.entryTo} <span className='font-medium'>{entry.newUnitName}</span>
      </p>
    );
  }
  if (entry.kind === "deleted") {
    return <p className='font-medium text-destructive'>{t.entryDeleted}</p>;
  }
  return <p>{statusText(entry)}</p>;
};

/** A Link's changes, newest first: when, who, what. */
const HistoryList = ({ entries, createdAt }: { entries: HistoryEntry[]; createdAt: string }) =>
  entries.length === 0 ? (
    <p className='mt-2 text-muted-foreground text-sm'>{t.noChanges(formatDate(createdAt))}</p>
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
      {!(data || error) && <p className='mt-2 text-muted-foreground text-sm'>{common.loading}</p>}
      {data && <HistoryList createdAt={link.createdAt} entries={data} />}
    </div>
  );
};

/** Today's date on the Organization's calendar, which Visits are counted by. */
const organizationToday = (): string => dayIn(new Date(), organization().timeZone);

/** The `count` days up to and including `last`, oldest first, as `2027-03-01`. */
const daysUpTo = (last: string, count: number): string[] => {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) =>
    new Date(end - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10)
  );
};

/**
 * Visits of the last 30 days as bars, today the darkest. A day nobody opened the Link is an empty
 * slot, not a missing one, so the gaps show. The exact figures are in the list below it.
 */
const VisitsChart = ({ days }: { days: Visits["days"] }) => {
  const counts = new Map(days.map((day) => [day.day, day.count]));
  const shown = daysUpTo(organizationToday(), RECENT_DAYS).map((day) => ({ count: counts.get(day) ?? 0, day }));
  const peak = Math.max(1, ...shown.map((day) => day.count));
  const total = shown.reduce((sum, day) => sum + day.count, 0);
  const first = shown[0]?.day ?? "";
  const last = shown.at(-1)?.day ?? "";

  return (
    <figure className='space-y-1.5'>
      <div
        aria-label={t.visitsChart(number.format(total), RECENT_DAYS, number.format(peak))}
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
            title={`${formatDay(day.day)}: ${t.visitCount(number.format(day.count))}`}
          />
        ))}
      </div>
      <figcaption className='flex justify-between text-muted-foreground text-xs tabular-nums'>
        <span>{formatDay(first)}</span>
        <span>{total ? t.peakPerDay(number.format(peak)) : t.noVisits}</span>
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
      <p className='text-muted-foreground text-xs'>{t.visitsEstimate}</p>
      <ErrorText>{error}</ErrorText>
      {!(data || error) && <p className='mt-2 text-muted-foreground text-sm'>{common.loading}</p>}
      {data && (
        <p className='mt-2 text-sm'>
          {t.totalAbout} <strong>{number.format(data.total)}</strong> {t.totalVisits}
        </p>
      )}
      {data && (
        <div className='mt-4'>
          <VisitsChart days={data.days} />
        </div>
      )}
      {data && data.days.length > RECENT_DAYS && (
        <p className='mt-1 text-muted-foreground text-xs'>{t.recentDays(RECENT_DAYS)}</p>
      )}
      {recent.length > 0 && (
        <table className='mt-2 w-full text-sm'>
          <thead className='sr-only'>
            <tr>
              <th>{t.day}</th>
              <th>{t.visits}</th>
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
          <VisitSources visits={data} />
        </div>
      )}
      {organization().hourlyVisits && (
        <div className='mt-5 border-t pt-4'>
          <HourlyVisitsChart load={(days) => api.linkVisitHours(link.code, days)} stamp={link.code} />
        </div>
      )}
    </div>
  );
};

/**
 * Rewords the Link Name and its note. Mounted when its panel opens, so it always starts from the
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
      <Field hint={t.nameHint} label={t.name}>
        {(props) => (
          <input {...props} maxLength={200} onChange={(event) => setName(event.target.value)} required value={name} />
        )}
      </Field>
      <Field label={t.note}>
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
        <Button onClick={onDone}>{common.cancel}</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? common.saving : common.save}
        </Button>
      </div>
    </form>
  );
};

/**
 * Changes the Target in two steps: type the new one, then confirm it beside the old one. The second
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
  // A preview set by hand describes the old Target; dropping it is the usual wish, so it is the default.
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
        <p className='text-muted-foreground'>{t.sentOn(link.url)}</p>
        <dl className='space-y-3 rounded-lg border bg-muted/50 p-3'>
          <div>
            <dt className='text-muted-foreground text-xs'>{t.currentTarget}</dt>
            <dd className='break-all text-muted-foreground line-through'>{link.target}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>{t.newTarget}</dt>
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
              {t.resetPreview}
              {link.preview.title && <> ("{link.preview.title}")</>}
              {t.resetPreviewAfter}
            </span>
          </label>
        )}
        <p className='text-muted-foreground'>{t.loggedWithEmail}</p>
        <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
          <Button disabled={busy} onClick={() => setReviewing(false)}>
            {t.back}
          </Button>
          <Button disabled={busy} onClick={change} variant='primary'>
            {busy ? t.changing : t.changeTarget}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className='space-y-4' onSubmit={review}>
      <div className='text-sm'>
        <p className='text-muted-foreground text-xs'>{t.currentTarget}</p>
        <p className='break-all'>{link.target}</p>
      </div>
      <Field hint={t.newTargetHint} label={t.newTarget}>
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
        <Button onClick={onDone}>{common.cancel}</Button>
        <Button type='submit' variant='primary'>
          {t.review}
        </Button>
      </div>
    </form>
  );
};

/** Puts the Link in another of its Unit's Groups, or in none. Nothing a visitor sees changes. */
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
        <p className='text-muted-foreground'>{t.noGroups}</p>
        <div className='flex justify-end'>
          <Button onClick={onDone}>{common.close}</Button>
        </div>
      </div>
    );
  }

  return (
    <form className='space-y-4' onSubmit={save}>
      <Field label={t.group}>
        {(props) => (
          <select
            {...props}
            onChange={(event) => setGroupId(event.target.value ? Number(event.target.value) : null)}
            value={groupId ?? ""}
          >
            <option value=''>{t.noGroupOption}</option>
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
        <Button onClick={onDone}>{common.cancel}</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? common.saving : common.save}
        </Button>
      </div>
    </form>
  );
};

/** The Group a Link is in, named beside it - or nothing, for a Link in none. */
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
    return <Badge tone='ok'>{t.badgeOn}</Badge>;
  }
  return link.disabledBySystem ? (
    <Badge tone='danger'>{t.badgeOffBySystem}</Badge>
  ) : (
    <Badge tone='muted'>{t.badgeOff}</Badge>
  );
};

const StatusBadge = ({ link }: { link: Link }) => (
  <>
    {isPast(link.expiresAt) ? <Badge tone='muted'>{t.badgeExpired}</Badge> : <EnabledBadge link={link} />}
    {link.hasPassword && <Badge tone='muted'>{t.badgePassword}</Badge>}
    {link.expiresAt && !isPast(link.expiresAt) && (
      <Badge tone='muted'>{t.badgeExpires(formatDateTime(link.expiresAt))}</Badge>
    )}
    {link.unsafeSince && <Badge tone='danger'>{t.badgeUnsafe}</Badge>}
    {link.archived && <Badge tone='muted'>{t.badgeArchived}</Badge>}
  </>
);

/** What a visitor meets instead of the Target, said under the Link where it is not simply sent on. */
const LinkNotices = ({ link, lockedBySystem }: { link: Link; lockedBySystem: boolean }) => (
  <>
    {link.unsafeSince && (
      <p className='flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-destructive text-xs'>
        <ShieldAlertIcon aria-hidden='true' className='mt-px size-3.5 shrink-0' />
        <span>{t.unsafeNotice(formatDate(link.unsafeSince))}</span>
      </p>
    )}
    {link.enabled && link.expiresAt && isPast(link.expiresAt) && (
      <p className='text-muted-foreground text-xs'>{t.expiredNotice(formatDateTime(link.expiresAt))}</p>
    )}
    {!link.enabled && (
      <p className='text-muted-foreground text-xs'>
        {t.offNotice}
        {lockedBySystem && t.offNoticeBySystem}
      </p>
    )}
  </>
);

/**
 * Deleting, confirmed by typing the Link Code back - the one step here that cannot be undone. The
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
    <Modal description={link.name} onClose={onClose} open={open} title={t.deleteTitle}>
      <form className='space-y-4 text-sm' onSubmit={remove}>
        <div className='space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3'>
          <p>
            {t.opener} <span className='break-all font-mono'>{link.url}</span> {t.deleteVisitors}
          </p>
          <p>{t.deleteGone(link.code)}</p>
          <p className='text-muted-foreground'>{t.deleteArchiveHint}</p>
        </div>
        <Field label={t.confirmCode(link.code)}>
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
          <Button onClick={onClose}>{common.cancel}</Button>
          <Button disabled={busy || !matches} type='submit' variant='danger'>
            {busy ? t.deleting : t.deleteForGood}
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
    /** A Unit Manager of the Link's Unit, or a System Administrator. */
    canDelete: isSystemAdmin || role === "manager",
    isSystemAdmin,
    /** Switched off by a System Administrator: only one of them switches it back on. */
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
      confirmLabel={t.disable}
      onCancel={onCancel}
      onConfirm={onConfirm}
      open={open}
      title={t.disableTitle(link.name)}
    >
      <p>{t.disableVisitors(link.url)}</p>
      <p className='mt-2'>{isSystemAdmin ? t.disableAdmin : t.disableMember}</p>
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
