import { DownloadIcon, FolderCogIcon, Link2Icon, PlusIcon, SearchIcon } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button, Card, CONTROL, ErrorText, Field, Modal, SecretBox } from "@/components/app";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { api, type Link, type LinkGroup } from "../api";
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
import { GroupManager } from "./groups";
import { LinkRow } from "./link-row";

const EMPTY = { code: "", name: "", note: "", target: "" };

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
  /** The Nhóm being looked at when the form opened: a new Link usually belongs there too. */
  initialGroup: number | null;
  onCreated: (link: Link) => void;
  onDone: () => void;
}) => {
  const [form, setForm] = useState(EMPTY);
  const [groupId, setGroupId] = useState<number | null>(initialGroup);
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
      const link = await api.createLink({ ...form, groupId, unitId });
      setCreated(link);
      setForm(EMPTY);
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
          <p className='font-medium text-ok text-sm'>Đã tạo link "{created.name}".</p>
          <SecretBox value={created.url} />
        </div>
        <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
          <Button onClick={() => setCreated(null)}>Tạo link khác</Button>
          <Button onClick={onDone} variant='primary'>
            Xong
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className='space-y-4' onSubmit={submit}>
      <Field hint='Link này dùng cho việc gì, in ở đâu. Chỉ người trong đơn vị thấy.' label='Tên link'>
        {(props) => (
          <input
            {...props}
            maxLength={200}
            onChange={set("name")}
            placeholder='Poster hội thảo, bản in A3'
            required
            value={form.name}
          />
        )}
      </Field>
      <Field hint='Địa chỉ người mở link sẽ được chuyển tới. Đổi được về sau.' label='Đích'>
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
      <Field hint='Bỏ trống để hệ thống tự sinh. Mã không đổi được sau khi tạo.' label='Mã link (không bắt buộc)'>
        {(props) => (
          <input
            {...props}
            autoCapitalize='none'
            maxLength={50}
            onChange={set("code")}
            placeholder='hoi-thao-2027'
            spellCheck={false}
            value={form.code}
          />
        )}
      </Field>
      {groups.length > 0 && (
        <Field label='Nhóm (không bắt buộc)'>
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
      )}
      <Field label='Ghi chú (không bắt buộc)'>
        {(props) => <textarea {...props} maxLength={1000} onChange={set("note")} rows={2} value={form.note} />}
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>Hủy</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? "Đang tạo..." : "Tạo link"}
        </Button>
      </div>
    </form>
  );
};

/** The Đơn vị's two CSV downloads, behind one button. */
const DownloadMenu = ({ unitId }: { unitId: number }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button>
        <DownloadIcon />
        Tải CSV
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end' className='min-w-56'>
      <DropdownMenuItem asChild>
        <a download href={`/api/units/${unitId}/links.csv`}>
          Danh sách link
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a download href={`/api/units/${unitId}/visits.csv`}>
          Lượt mở theo ngày
        </a>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

/** A filter chip: one Nhóm, or all, or none, with how many Links it holds. */
const Chip = ({
  label,
  count,
  active,
  onClick
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    aria-pressed={active}
    className={cn(
      "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent"
    )}
    onClick={onClick}
    type='button'
  >
    <span className='max-w-48 truncate'>{label}</span>
    <span className={cn("text-xs tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
  </button>
);

const SELECT = cn(CONTROL, "w-auto md:min-w-36");

/** Search, state, order and Nhóm for the Links below - all kept in the address. */
const Toolbar = ({
  filter,
  onChange,
  links,
  groups,
  onManageGroups
}: {
  filter: LinkFilter;
  onChange: (next: LinkFilter) => void;
  links: Link[];
  groups: LinkGroup[];
  onManageGroups: () => void;
}) => {
  const ungrouped = links.filter((link) => link.groupId === null).length;
  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <div className='relative min-w-0 flex-1'>
          <SearchIcon
            aria-hidden='true'
            className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
          />
          <input
            aria-label='Tìm link'
            className={cn(CONTROL, "pl-9")}
            onChange={(event) => onChange({ ...filter, query: event.target.value })}
            placeholder='Tìm theo tên, mã, đích, ghi chú...'
            type='search'
            value={filter.query}
          />
        </div>
        <div className='flex gap-2'>
          <select
            aria-label='Trạng thái'
            className={SELECT}
            onChange={(event) => onChange({ ...filter, status: event.target.value as Status })}
            value={filter.status}
          >
            <option value='all'>Mọi trạng thái</option>
            <option value='on'>Đang bật</option>
            <option value='off'>Đã tắt</option>
          </select>
          <select
            aria-label='Sắp xếp'
            className={SELECT}
            onChange={(event) => onChange({ ...filter, sort: event.target.value as Sort })}
            value={filter.sort}
          >
            <option value='new'>Mới nhất</option>
            <option value='old'>Cũ nhất</option>
            <option value='visits'>Nhiều lượt mở</option>
            <option value='name'>Tên A-Z</option>
          </select>
        </div>
      </div>
      <div className='flex items-center gap-2'>
        <fieldset aria-label='Lọc theo nhóm' className='-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1'>
          <Chip
            active={filter.group === "all"}
            count={links.length}
            label='Tất cả'
            onClick={() => onChange({ ...filter, group: "all" })}
          />
          {groups.map((group) => (
            <Chip
              active={filter.group === group.id}
              count={group.linkCount}
              key={group.id}
              label={group.name}
              onClick={() => onChange({ ...filter, group: group.id })}
            />
          ))}
          {groups.length > 0 && (
            <Chip
              active={filter.group === "none"}
              count={ungrouped}
              label='Chưa có nhóm'
              onClick={() => onChange({ ...filter, group: "none" })}
            />
          )}
        </fieldset>
        <Button className='shrink-0' onClick={onManageGroups}>
          <FolderCogIcon />
          <span className='hidden sm:inline'>Quản lý nhóm</span>
          <span className='sm:hidden'>Nhóm</span>
        </Button>
      </div>
    </div>
  );
};

/** The Đơn vị's Links first; making a new one is a button away, finding one is a search away. */
const LinksPage = () => {
  const { unit } = useSession();
  const unitId = unit?.unitId ?? 0;
  const { data, error, setData } = useLoaded(unitId, (id) => api.links(id).then((answer) => answer.links));
  const groupsLoaded = useLoaded(unitId, (id) => api.groups(id).then((answer) => answer.groups));
  const groups = groupsLoaded.data ?? [];
  const [creating, setCreating] = useState(false);
  const [managingGroups, setManagingGroups] = useState(false);
  const [params, setParams] = useSearchParams();
  // Read once per address, so the list below is only filtered again when the filter changes.
  const filter = useMemo(() => readFilter(params), [params]);
  const setFilter = (next: LinkFilter) => setParams(writeFilter(next), { replace: true });
  const hasLinks = Boolean(data && data.length > 0);
  const shown = useMemo(() => (data ? applyFilter(data, filter) : []), [data, filter]);

  // A Nhóm belongs to one Đơn vị: switching Đơn vị starts from an unfiltered list.
  const shownFor = useRef(unitId);
  useEffect(() => {
    if (shownFor.current !== unitId) {
      shownFor.current = unitId;
      setParams(new URLSearchParams(), { replace: true });
    }
  }, [unitId, setParams]);

  const replaceLink = (changed: Link) => {
    setData((links) => (links ?? []).map((other) => (other.code === changed.code ? changed : other)));
    groupsLoaded.reload();
  };

  return (
    <>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='min-w-0 flex-1'>
          <h1 className='font-semibold text-xl tracking-tight'>Link</h1>
          <p className='text-muted-foreground text-sm'>
            {data ? `${data.length} link của ${unit?.unitName}` : `Link của ${unit?.unitName}`}
          </p>
        </div>
        {hasLinks && <DownloadMenu unitId={unitId} />}
        <Button onClick={() => setCreating(true)} variant='primary'>
          <PlusIcon />
          Tạo link
        </Button>
      </div>

      <ErrorText>{error}</ErrorText>
      {!(data || error) && <p className='text-muted-foreground'>Đang tải...</p>}

      {data && !hasLinks && (
        <Card>
          <div className='flex flex-col items-center gap-3 py-8 text-center'>
            <div className='flex size-12 items-center justify-center rounded-full bg-muted'>
              <Link2Icon className='size-6 text-muted-foreground' />
            </div>
            <div>
              <p className='font-medium'>Đơn vị chưa có link nào</p>
              <p className='text-muted-foreground text-sm'>Tạo link đầu tiên để có địa chỉ và QR cố định cho nó.</p>
            </div>
            <Button onClick={() => setCreating(true)} variant='primary'>
              <PlusIcon />
              Tạo link
            </Button>
          </div>
        </Card>
      )}

      {data && hasLinks && (
        <>
          <Toolbar
            filter={filter}
            groups={groups}
            links={data}
            onChange={setFilter}
            onManageGroups={() => setManagingGroups(true)}
          />
          {isFiltering(filter) && (
            <p className='flex flex-wrap items-center gap-x-3 text-muted-foreground text-sm'>
              <span>
                Đang hiện {shown.length} / {data.length} link
              </span>
              <button
                className='font-medium text-primary underline-offset-4 hover:underline'
                onClick={() => setFilter({ ...DEFAULT_FILTER, sort: filter.sort })}
                type='button'
              >
                Bỏ lọc
              </button>
            </p>
          )}
          {shown.length === 0 ? (
            <Card>
              <p className='py-6 text-center text-muted-foreground'>Không có link nào khớp với bộ lọc.</p>
            </Card>
          ) : (
            <Card flush>
              <ul className='divide-y divide-border'>
                {shown.map((link) => (
                  <LinkRow groups={groups} key={link.code} link={link} onChanged={replaceLink} />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <Modal
        description={`Link mới thuộc về ${unit?.unitName}.`}
        onClose={() => setCreating(false)}
        open={creating}
        title='Tạo link'
      >
        <CreateLinkForm
          groups={groups}
          initialGroup={typeof filter.group === "number" ? filter.group : null}
          onCreated={(link) => {
            setData((links) => [link, ...(links ?? [])]);
            groupsLoaded.reload();
          }}
          onDone={() => setCreating(false)}
          unitId={unitId}
        />
      </Modal>

      <Modal
        description={`Nhóm giúp sắp xếp link của ${unit?.unitName}. Mỗi link thuộc tối đa một nhóm.`}
        onClose={() => setManagingGroups(false)}
        open={managingGroups}
        title='Quản lý nhóm'
      >
        <GroupManager
          groups={groups}
          onChanged={() => {
            groupsLoaded.reload();
            // Deleting a Nhóm takes its Links out of it, so the list is read again too.
            api
              .links(unitId)
              .then((answer) => setData(answer.links))
              .catch(() => undefined);
          }}
          unitId={unitId}
        />
      </Modal>
    </>
  );
};

export { LinksPage };
