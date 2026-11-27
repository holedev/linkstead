import {
  ChevronRightIcon,
  DownloadIcon,
  FileUpIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  Link2Icon,
  PlusIcon,
  QrCodeIcon,
  SearchIcon
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button, Card, CONTROL, ConfirmDialog, ErrorText, Field, Modal, SecretBox } from "@/components/app";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Table, TableBody } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DEFAULT_REDIRECT_TYPE, type RedirectType } from "../../domain/redirect";
import { api, type Link, type LinkGroup } from "../api";
import { text } from "../i18n";
import { useLinkDrop } from "../lib/drag";
import {
  applyFilter,
  DEFAULT_FILTER,
  isFiltering,
  type LinkFilter,
  readFilter,
  type Sort,
  type Status,
  writeFilter
} from "../lib/link-filter";
import { messageOf } from "../messages";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";
import { BulkCreateDialog, ZipButtons } from "./bulk-create";
import { FolderGrid, GroupNameForm } from "./groups";
import { RedirectSelect } from "./link-forms";
import { LinkRow, LinkTableHeader } from "./link-row";

const EMPTY = { code: "", name: "", note: "", target: "" };
const t = text().links;
const { common } = text();

/**
 * The form for a new Link. After a save it shows the address to copy, and offers to make another
 * - several are often made in a row.
 */
const CreateLinkForm = ({
  unitId,
  groups,
  initialGroup,
  onCreated,
  onDone
}: {
  unitId: number;
  groups: LinkGroup[];
  /** The Group being looked at when the form opened: a new Link usually belongs there too. */
  initialGroup: number | null;
  onCreated: (link: Link) => void;
  onDone: () => void;
}) => {
  const [form, setForm] = useState(EMPTY);
  const [groupId, setGroupId] = useState<number | null>(initialGroup);
  const [redirectType, setRedirectType] = useState<RedirectType>(DEFAULT_REDIRECT_TYPE);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Link | null>(null);
  const set = (field: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setForm((previous) => ({ ...previous, [field]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const link = await api.createLink({ ...form, groupId, redirectType, unitId });
      setCreated(link);
      setForm(EMPTY);
      setRedirectType(DEFAULT_REDIRECT_TYPE);
      onCreated(link);
    } catch (failure) {
      setError(messageOf(failure));
    }
    setBusy(false);
  };

  if (created) {
    return (
      <div className='space-y-4'>
        <div className='space-y-2 rounded-lg border border-ok/30 bg-ok/5 p-3'>
          <p className='font-medium text-ok text-sm'>{t.created(created.name)}</p>
          <SecretBox value={created.url} />
        </div>
        <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
          <Button onClick={() => setCreated(null)}>{t.createAnother}</Button>
          <Button onClick={onDone} variant='primary'>
            {t.done}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className='space-y-4' onSubmit={submit}>
      <Field hint={t.nameHint} label={t.name}>
        {(props) => (
          <input
            {...props}
            maxLength={200}
            onChange={set("name")}
            placeholder={t.namePlaceholder}
            required
            value={form.name}
          />
        )}
      </Field>
      <Field hint={t.targetHint} label={t.target}>
        {(props) => (
          <input
            {...props}
            inputMode='url'
            onChange={set("target")}
            placeholder='https://'
            required
            spellCheck={false}
            value={form.target}
          />
        )}
      </Field>
      <Field hint={t.codeHint} label={t.code}>
        {(props) => (
          <input
            {...props}
            autoCapitalize='none'
            maxLength={50}
            onChange={set("code")}
            placeholder={t.codePlaceholder}
            spellCheck={false}
            value={form.code}
          />
        )}
      </Field>
      {groups.length > 0 && (
        <Field label={t.group}>
          {(props) => (
            <select
              {...props}
              onChange={(event) => setGroupId(event.target.value ? Number(event.target.value) : null)}
              value={groupId ?? ""}
            >
              <option value=''>{t.noGroup}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <RedirectSelect onChange={setRedirectType} value={redirectType} />
      <Field label={t.note}>
        {(props) => <textarea {...props} maxLength={1000} onChange={set("note")} rows={2} value={form.note} />}
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>{common.cancel}</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? t.creating : t.create}
        </Button>
      </div>
    </form>
  );
};

/** The Unit's CSV downloads, and the QR of the Links on screen, behind one button. */
const DownloadMenu = ({ unitId, shownCount, onQrZip }: { unitId: number; shownCount: number; onQrZip: () => void }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button>
        <DownloadIcon />
        {t.download}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end' className='min-w-64'>
      <DropdownMenuLabel className='text-muted-foreground text-xs'>{t.csvOfUnit}</DropdownMenuLabel>
      <DropdownMenuItem asChild>
        <a download href={`/api/units/${unitId}/links.csv`}>
          {t.linksCsv}
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a download href={`/api/units/${unitId}/visits.csv`}>
          {t.visitsCsv}
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a download href={`/api/units/${unitId}/visit-sources.csv`}>
          {t.visitSourcesCsv}
        </a>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={shownCount === 0} onSelect={onQrZip}>
        <QrCodeIcon />
        {t.qrOfShown(shownCount)}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const SELECT = cn(CONTROL, "w-auto md:min-w-36");

/** The buttons beside the title: downloads, a new Group (at the top only), import, a new Link. */
const HeaderActions = ({
  unitId,
  atTop,
  hasLinks,
  shownCount,
  onQrZip,
  onCreateGroup,
  onImport,
  onCreate
}: {
  unitId: number;
  atTop: boolean;
  hasLinks: boolean;
  shownCount: number;
  onQrZip: () => void;
  onCreateGroup: () => void;
  onImport: () => void;
  onCreate: () => void;
}) => (
  <>
    {hasLinks && <DownloadMenu onQrZip={onQrZip} shownCount={shownCount} unitId={unitId} />}
    {atTop && (
      <Button onClick={onCreateGroup}>
        <FolderPlusIcon />
        {t.createGroup}
      </Button>
    )}
    <Button onClick={onImport}>
      <FileUpIcon />
      {t.import}
    </Button>
    <Button onClick={onCreate} variant='primary'>
      <PlusIcon />
      {t.create}
    </Button>
  </>
);

/** Search, state and order for the Links below - kept in the address with where one is. */
const Toolbar = ({
  filter,
  onChange,
  inGroup
}: {
  filter: LinkFilter;
  onChange: (next: LinkFilter) => void;
  /** The Group being looked in, if any: a search then stays inside it. */
  inGroup: LinkGroup | null;
}) => (
  <div className='flex flex-col gap-2 sm:flex-row'>
    <div className='relative min-w-0 flex-1'>
      <SearchIcon
        aria-hidden='true'
        className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
      />
      <input
        aria-label={t.search}
        className={cn(CONTROL, "pl-9")}
        onChange={(event) => onChange({ ...filter, query: event.target.value })}
        placeholder={inGroup ? t.searchInGroup(inGroup.name) : t.searchEverywhere}
        type='search'
        value={filter.query}
      />
    </div>
    <div className='flex gap-2'>
      <select
        aria-label={t.state}
        className={SELECT}
        onChange={(event) => onChange({ ...filter, status: event.target.value as Status })}
        value={filter.status}
      >
        <option value='all'>{t.allStates}</option>
        <option value='on'>{t.stateOn}</option>
        <option value='off'>{t.stateOff}</option>
        <option value='archived'>{t.stateArchived}</option>
      </select>
      <select
        aria-label={t.sort}
        className={SELECT}
        onChange={(event) => onChange({ ...filter, sort: event.target.value as Sort })}
        value={filter.sort}
      >
        <option value='new'>{t.sortNew}</option>
        <option value='old'>{t.sortOld}</option>
        <option value='visits'>{t.sortVisits}</option>
        <option value='name'>{t.sortName}</option>
      </select>
    </div>
  </div>
);

const EmptyState = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
  <Card>
    <div className='flex flex-col items-center gap-3 py-8 text-center'>
      <div className='flex size-12 items-center justify-center rounded-full bg-muted'>
        <Link2Icon className='size-6 text-muted-foreground' />
      </div>
      <div>
        <p className='font-medium'>{title}</p>
        <p className='text-muted-foreground text-sm'>{children}</p>
      </div>
      {action}
    </div>
  </Card>
);

type GroupTask = { kind: "create" } | { kind: "rename"; group: LinkGroup } | { kind: "delete"; group: LinkGroup };

/** What a drop just did, said where it can be undone. */
type Moved = { code: string; name: string; from: number | null; to: LinkGroup | null };

/**
 * The title: "Links" at the top, "Links / <Group>" inside one. Inside, "Links" is also where a
 * Link is dropped to take it out of the Group.
 */
const LinksHeading = ({
  openGroup,
  summary,
  onTop,
  onDropToTop
}: {
  openGroup: LinkGroup | null;
  summary: string;
  onTop: () => void;
  onDropToTop: (code: string) => void;
}) => {
  const { dropProps, over } = useLinkDrop(onDropToTop);
  return (
    <div className='min-w-0 flex-1 basis-60'>
      {openGroup ? (
        <nav aria-label={t.where} className='flex min-w-0 items-center gap-1.5'>
          <button
            className={cn(
              "rounded-md px-1 font-bold text-2xl text-muted-foreground tracking-tight transition hover:text-foreground",
              over && "bg-primary/10 text-primary ring-2 ring-primary/30"
            )}
            onClick={onTop}
            title={t.toTop}
            type='button'
            {...dropProps}
          >
            {t.title}
          </button>
          <ChevronRightIcon aria-hidden='true' className='size-5 shrink-0 text-muted-foreground' />
          <h1 className='flex min-w-0 items-center gap-2 font-bold text-2xl tracking-tight'>
            <FolderOpenIcon aria-hidden='true' className='size-5 shrink-0 text-primary' />
            <span className='truncate'>{openGroup.name}</span>
          </h1>
        </nav>
      ) : (
        <h1 className='font-bold text-2xl tracking-tight'>{t.title}</h1>
      )}
      <p className='text-muted-foreground text-sm'>{over ? t.dropToTop : summary}</p>
    </div>
  );
};

/** Making, renaming and deleting a Group, each in its own dialog. */
const GroupDialogs = ({
  task,
  unitId,
  onClose,
  onChanged,
  onDeleted
}: {
  task: GroupTask | null;
  unitId: number;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: (group: LinkGroup) => void;
}) => {
  const [deleting, setDeleting] = useState(false);
  const remove = async (group: LinkGroup) => {
    setDeleting(true);
    try {
      await api.deleteGroup(unitId, group.id);
      onClose();
      onDeleted(group);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal
        onClose={onClose}
        open={task?.kind === "create" || task?.kind === "rename"}
        title={task?.kind === "rename" ? t.renameGroup(task.group.name) : t.createGroup}
      >
        {task?.kind === "create" && (
          <GroupNameForm
            onDone={onClose}
            onSave={async (name) => {
              await api.createGroup(unitId, name);
              onChanged();
            }}
            submitLabel={t.createGroup}
          />
        )}
        {task?.kind === "rename" && (
          <GroupNameForm
            initial={task.group.name}
            onDone={onClose}
            onSave={async (name) => {
              await api.renameGroup(unitId, task.group.id, name);
              onChanged();
            }}
            submitLabel={common.save}
          />
        )}
      </Modal>
      <ConfirmDialog
        busy={deleting}
        confirmLabel={t.deleteGroup}
        onCancel={onClose}
        onConfirm={() => task?.kind === "delete" && remove(task.group)}
        open={task?.kind === "delete"}
        title={task?.kind === "delete" ? t.deleteGroupTitle(task.group.name) : ""}
      >
        {task?.kind === "delete" && task.group.linkCount > 0
          ? t.deleteGroupLinks(task.group.linkCount)
          : t.deleteGroupEmpty}
      </ConfirmDialog>
    </>
  );
};

/** Says where a dropped Link went, with a way back. Read out by a screen reader too. */
const MovedNotice = ({ moved, onUndo, onClose }: { moved: Moved | null; onUndo: () => void; onClose: () => void }) => (
  <div aria-live='polite' className='empty:hidden'>
    {moved && (
      <p className='flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-ok/30 bg-ok/5 px-3 py-2 text-sm'>
        <span className='min-w-0 flex-1'>{t.moved(moved.name, moved.to?.name ?? null)}</span>
        <button className='font-medium text-primary underline-offset-4 hover:underline' onClick={onUndo} type='button'>
          {t.undo}
        </button>
        <button className='text-muted-foreground hover:text-foreground' onClick={onClose} type='button'>
          {common.close}
        </button>
      </p>
    )}
  </div>
);

/** The list itself, and what to say when it is empty. */
const LinkList = ({
  shown,
  filter,
  groups,
  openGroup,
  onChanged,
  onClear,
  onCreate
}: {
  shown: Link[];
  filter: LinkFilter;
  groups: LinkGroup[];
  openGroup: LinkGroup | null;
  onChanged: (link: Link) => void;
  onClear: () => void;
  onCreate: () => void;
}) => {
  const filtering = isFiltering(filter);
  return (
    <>
      {filtering && (
        <p className='flex flex-wrap items-center gap-x-3 text-muted-foreground text-sm'>
          <span>{t.matching(shown.length, Boolean(filter.query.trim() && !openGroup))}</span>
          <button
            className='font-medium text-primary underline-offset-4 hover:underline'
            onClick={onClear}
            type='button'
          >
            {t.clearFilter}
          </button>
        </p>
      )}
      {shown.length > 0 && (
        <Card flush>
          <Table>
            <LinkTableHeader />
            <TableBody>
              {shown.map((link) => (
                <LinkRow groups={groups} key={link.code} link={link} onChanged={onChanged} showGroup={!openGroup} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {shown.length === 0 && filtering && (
        <Card>
          <p className='py-6 text-center text-muted-foreground'>{t.noMatch}</p>
        </Card>
      )}
      {shown.length === 0 && !filtering && openGroup && (
        <EmptyState
          action={
            <Button onClick={onCreate} variant='primary'>
              <PlusIcon />
              {t.createInGroup}
            </Button>
          }
          title={t.emptyGroup}
        >
          {t.emptyGroupHint}
        </EmptyState>
      )}
    </>
  );
};

/** The line under the title: how many Links here, and how many Groups. */
const summaryOf = (openGroup: LinkGroup | null, total: number | null, unitName: string, groupCount: number) => {
  if (openGroup) {
    return t.inGroupCount(openGroup.linkCount);
  }
  if (total === null) {
    return "";
  }
  return t.summary(total, unitName, groupCount);
};

/** Making a Link, in the Group being looked in if there is one. */
const CreateLinkDialog = ({
  open,
  unitId,
  unitName,
  groups,
  openGroup,
  onCreated,
  onClose
}: {
  open: boolean;
  unitId: number;
  unitName: string;
  groups: LinkGroup[];
  openGroup: LinkGroup | null;
  onCreated: (link: Link) => void;
  onClose: () => void;
}) => (
  <Modal
    description={openGroup ? t.newInGroup(unitName, openGroup.name) : t.newInUnit(unitName)}
    onClose={onClose}
    open={open}
    title={t.create}
  >
    <CreateLinkForm
      groups={groups}
      initialGroup={openGroup?.id ?? null}
      onCreated={onCreated}
      onDone={onClose}
      unitId={unitId}
    />
  </Modal>
);

/**
 * The Unit's Links. At the top, its Groups as folders and, below them, the Links in none - the
 * shared ones. Opening a folder shows its Links, and a new Link made there goes into it. A Link
 * dragged onto a folder goes into that Group.
 */
const LinksPage = () => {
  const { unit } = useSession();
  const unitId = unit?.unitId ?? 0;
  const { data, error, setData, reload } = useLoaded(unitId, (id) => api.links(id).then((answer) => answer.links));
  const groupsLoaded = useLoaded(unitId, (id) => api.groups(id).then((answer) => answer.groups));
  const groups = groupsLoaded.data ?? [];
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [groupTask, setGroupTask] = useState<GroupTask | null>(null);
  const [moved, setMoved] = useState<Moved | null>(null);
  const [moveError, setMoveError] = useState("");
  const [params, setParams] = useSearchParams();
  // Read once per address, so the list below is only filtered again when the filter changes.
  const filter = useMemo(() => readFilter(params), [params]);
  const setFilter = (next: LinkFilter, push = false) => setParams(writeFilter(next), { replace: !push });
  const openGroup = groups.find((group) => group.id === filter.group) ?? null;
  const shown = useMemo(() => (data ? applyFilter(data, filter) : []), [data, filter]);
  const atTop = filter.group === "root";
  // The Links in use: archived ones are counted only where they are listed.
  const total = data?.filter((link) => !link.archived).length ?? 0;

  // A Group belongs to one Unit: switching Unit goes back to the top.
  const shownFor = useRef(unitId);
  useEffect(() => {
    if (shownFor.current !== unitId) {
      shownFor.current = unitId;
      setParams(new URLSearchParams(), { replace: true });
    }
  }, [unitId, setParams]);

  // A Group that no longer exists - deleted, or an old address - leads back to the top.
  useEffect(() => {
    if (!atTop && groupsLoaded.data && !openGroup) {
      setParams(writeFilter({ ...filter, group: "root" }), { replace: true });
    }
  }, [atTop, groupsLoaded.data, openGroup, filter, setParams]);

  const goTo = (group: LinkGroup | null) => setFilter({ ...filter, group: group ? group.id : "root", query: "" }, true);

  const replaceLink = (changed: Link) => {
    setData((links) => (links ?? []).map((other) => (other.code === changed.code ? changed : other)));
    groupsLoaded.reload();
  };

  /** Puts a dropped Link into a Group, or into none, and says so with a way back. */
  const moveLink = async (code: string, to: LinkGroup | null, remember = true) => {
    const link = data?.find((candidate) => candidate.code === code);
    if (!link || link.groupId === (to?.id ?? null)) {
      return;
    }
    setMoveError("");
    try {
      replaceLink(await api.setLinkGroup(code, to?.id ?? null));
      setMoved(remember ? { code, from: link.groupId, name: link.name, to } : null);
    } catch (failure) {
      setMoveError(messageOf(failure));
    }
  };

  const undoMove = () => {
    if (moved) {
      moveLink(moved.code, groups.find((group) => group.id === moved.from) ?? null, false);
    }
  };

  const summary = summaryOf(openGroup, data ? total : null, unit?.unitName ?? "", groups.length);
  const showFolders = atTop && !filter.query.trim() && groups.length > 0;

  return (
    <>
      <div className='flex flex-wrap items-end gap-2'>
        <LinksHeading
          onDropToTop={(code) => moveLink(code, null)}
          onTop={() => goTo(null)}
          openGroup={openGroup}
          summary={summary}
        />
        <HeaderActions
          atTop={atTop}
          hasLinks={(data?.length ?? 0) > 0}
          onCreate={() => setCreating(true)}
          onCreateGroup={() => setGroupTask({ kind: "create" })}
          onImport={() => setImporting(true)}
          onQrZip={() => setZipping(true)}
          shownCount={shown.length}
          unitId={unitId}
        />
      </div>

      <ErrorText>{error || moveError}</ErrorText>
      {!(data || error) && <p className='text-muted-foreground'>{common.loading}</p>}

      {data && data.length === 0 && groups.length === 0 && (
        <EmptyState
          action={
            <Button onClick={() => setCreating(true)} variant='primary'>
              <PlusIcon />
              {t.create}
            </Button>
          }
          title={t.emptyUnit}
        >
          {t.emptyUnitHint}
        </EmptyState>
      )}

      {data && (data.length > 0 || groups.length > 0) && (
        <>
          <Toolbar filter={filter} inGroup={openGroup} onChange={(next) => setFilter(next)} />
          <MovedNotice moved={moved} onClose={() => setMoved(null)} onUndo={undoMove} />
          {showFolders && (
            <>
              <FolderGrid
                groups={groups}
                onDelete={(group) => setGroupTask({ group, kind: "delete" })}
                onDropLink={(code, group) => moveLink(code, group)}
                onOpen={goTo}
                onRename={(group) => setGroupTask({ group, kind: "rename" })}
              />
              {total > 0 && <p className='hidden text-muted-foreground text-xs md:block'>{t.dragHint}</p>}
              {shown.length > 0 && <h2 className='pt-2 font-medium text-muted-foreground text-sm'>{t.inNoGroup}</h2>}
            </>
          )}
          <LinkList
            filter={filter}
            groups={groups}
            onChanged={replaceLink}
            onClear={() => setFilter({ ...DEFAULT_FILTER, group: filter.group, sort: filter.sort })}
            onCreate={() => setCreating(true)}
            openGroup={openGroup}
            shown={shown}
          />
        </>
      )}

      <CreateLinkDialog
        groups={groups}
        onClose={() => setCreating(false)}
        onCreated={(link) => {
          setData((links) => [link, ...(links ?? [])]);
          groupsLoaded.reload();
        }}
        open={creating}
        openGroup={openGroup}
        unitId={unitId}
        unitName={unit?.unitName ?? ""}
      />

      <BulkCreateDialog
        groups={groups}
        onClose={() => setImporting(false)}
        onCreated={(links) => {
          if (links.length > 0) {
            setData((current) => [...links, ...(current ?? [])]);
          } else {
            groupsLoaded.reload();
          }
        }}
        open={importing}
        unitId={unitId}
        unitName={unit?.unitName ?? ""}
      />

      <Modal description={t.zipLead} onClose={() => setZipping(false)} open={zipping} title={t.zipTitle(shown.length)}>
        {zipping && <ZipButtons codes={shown.map((link) => link.code)} />}
      </Modal>

      <GroupDialogs
        onChanged={groupsLoaded.reload}
        onClose={() => setGroupTask(null)}
        onDeleted={(group) => {
          if (openGroup?.id === group.id) {
            goTo(null);
          }
          groupsLoaded.reload();
          // Its Links come out to the top, so the list is read again.
          reload();
        }}
        task={groupTask}
        unitId={unitId}
      />
    </>
  );
};

export { LinksPage };
