import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FolderInputIcon,
  LockIcon,
  PencilIcon,
  PowerIcon,
  PowerOffIcon,
  QrCodeIcon,
  Share2Icon,
  Trash2Icon
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from "react-router";
import { Button, Card, CopyButton, ErrorText, formatDate, Modal } from "@/components/app";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api, type Link, type Visits } from "../api";
import { messageOf } from "../messages";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";
import { AccessForm, formatVietnam } from "./access-form";
import {
  DeleteLinkDialog,
  DetailsForm,
  DisableLinkDialog,
  GroupForm,
  HistoryPanel,
  LinkNotices,
  number,
  StatusBadge,
  TargetForm,
  useLinkRights,
  usePanel,
  VisitsChart,
  VisitsPanel
} from "./link-forms";
import { PreviewPanel } from "./preview-panel";
import { QrPanel } from "./qr-panel";

const TABS = { history: "Lịch sử", overview: "Tổng quan", qr: "QR", settings: "Cài đặt", visits: "Lượt mở" } as const;
type Tab = keyof typeof TABS;
const isTab = (value: string | null): value is Tab => value !== null && value in TABS;
/** The tabs in the order a person reaches for them. */
const ORDER: Tab[] = ["overview", "qr", "visits", "history", "settings"];

/** The forms that open over the page. `?task=target` in the address opens "Đổi đích" straight away. */
type Task = "target" | "details" | "group" | "access" | "preview" | "disable" | "delete" | null;
const TASK_TITLE = {
  access: "Mật khẩu và hạn dùng",
  details: "Sửa tên, ghi chú",
  group: "Chuyển nhóm",
  preview: "Xem trước khi chia sẻ",
  target: "Đổi đích"
};
type FormTask = keyof typeof TASK_TITLE;
const isFormTask = (task: Task): task is FormTask => task !== null && task in TASK_TITLE;

/** A titled block of the page, with an optional line under the title and a button on the right. */
const Section = ({
  title,
  lead,
  action,
  className,
  children
}: {
  title: string;
  lead?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) => (
  <section className={cn("rounded-xl border bg-card p-4 sm:p-5", className)}>
    <div className='flex flex-wrap items-start gap-x-4 gap-y-2'>
      <div className='min-w-0 flex-1 basis-44'>
        <h2 className='font-semibold'>{title}</h2>
        {lead && <p className='text-muted-foreground text-sm'>{lead}</p>}
      </div>
      {action}
    </div>
    {children && <div className='mt-3'>{children}</div>}
  </section>
);

/** One line of the danger zone: what it does to visitors, and its button. */
const DangerRow = ({ title, lead, children }: { title: string; lead: string; children: ReactNode }) => (
  <div className='flex flex-wrap items-center gap-x-4 gap-y-2 border-t py-3 first:border-t-0'>
    <div className='min-w-0 flex-1 basis-56'>
      <p className='font-medium text-sm'>{title}</p>
      <p className='text-muted-foreground text-sm'>{lead}</p>
    </div>
    {children}
  </div>
);

const Overview = ({
  link,
  groupName,
  qrVersion,
  onTask,
  onTab
}: {
  link: Link;
  /** The Nhóm the Link is in, or null for none. */
  groupName: string | null;
  qrVersion: number;
  onTask: (task: Task) => void;
  onTab: (tab: Tab) => void;
}) => {
  const { data: visits, error } = usePanel<Visits>(link.code, () => api.visits(link.code));
  const { lockedBySystem } = useLinkRights(link);

  return (
    <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]'>
      <div className='min-w-0 space-y-4'>
        <Section lead='In và gửi đi bằng địa chỉ này. Mã link không bao giờ đổi.' title='Địa chỉ'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='min-w-0 flex-1 basis-60 break-all font-medium font-mono text-lg text-primary'>
              {link.url}
            </span>
            <CopyButton value={link.url} />
            <a
              className='inline-flex h-11 items-center gap-2 rounded-md border bg-background px-3 font-medium text-sm hover:bg-accent md:h-9'
              href={link.url}
              rel='noreferrer'
              target='_blank'
            >
              <ExternalLinkIcon className='size-4' />
              Mở
            </a>
          </div>
        </Section>

        <Section
          action={
            <Button onClick={() => onTask("target")}>
              <ArrowRightLeftIcon />
              Đổi đích
            </Button>
          }
          lead='Nơi người mở link được chuyển tới. Đổi được bất cứ lúc nào, kể cả sau khi đã in.'
          title='Đích'
        >
          <div className='space-y-2'>
            <a
              className='block break-all text-sm underline-offset-4 hover:underline'
              href={link.target}
              rel='noreferrer'
              target='_blank'
            >
              {link.target}
            </a>
            <LinkNotices link={link} lockedBySystem={lockedBySystem} />
            <button
              className='font-medium text-primary text-sm underline-offset-4 hover:underline'
              onClick={() => onTab("history")}
              type='button'
            >
              Xem lịch sử thay đổi
            </button>
          </div>
        </Section>

        <Section
          action={
            visits && <span className='font-semibold tabular-nums'>khoảng {number.format(visits.total)} tất cả</span>
          }
          lead='Ước tính. Lượt xem trước của Zalo, Facebook được bỏ qua khi nhận ra được.'
          title='Lượt mở 30 ngày qua'
        >
          <ErrorText>{error}</ErrorText>
          {!(visits || error) && <p className='text-muted-foreground text-sm'>Đang tải...</p>}
          {visits && <VisitsChart days={visits.days} />}
        </Section>
      </div>

      <div className='min-w-0 space-y-4'>
        <Card>
          <button
            aria-label='Mở phần QR để đổi logo hoặc tải về'
            className='mx-auto block w-full max-w-56 overflow-hidden rounded-lg border bg-white p-2 outline-none transition hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
            onClick={() => onTab("qr")}
            type='button'
          >
            <img
              alt={`QR của link ${link.name}`}
              className={cn("aspect-square w-full", link.enabled ? "" : "opacity-40")}
              height={224}
              src={`/api/links/${link.code}/qr?v=${qrVersion}`}
              width={224}
            />
          </button>
          <p className='mt-2 text-center text-muted-foreground text-xs'>QR mang link, không mang đích.</p>
          <Button className='mt-3 w-full' onClick={() => onTab("qr")}>
            <QrCodeIcon />
            QR và logo
          </Button>
        </Card>

        <Section
          action={
            <Button aria-label='Sửa tên, ghi chú' className='size-9 px-0 md:size-8' onClick={() => onTask("details")}>
              <PencilIcon />
            </Button>
          }
          title='Thông tin'
        >
          <dl className='grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm'>
            <dt className='text-muted-foreground'>Nhóm</dt>
            <dd>{groupName ?? "Không nhóm"}</dd>
            <dt className='text-muted-foreground'>Mật khẩu</dt>
            <dd>{link.hasPassword ? "Có" : "Không"}</dd>
            <dt className='text-muted-foreground'>Hạn dùng</dt>
            <dd>{link.expiresAt ? formatVietnam(link.expiresAt) : "Không giới hạn"}</dd>
            <dt className='text-muted-foreground'>Tạo ngày</dt>
            <dd>{formatDate(link.createdAt)}</dd>
            <dt className='text-muted-foreground'>Ghi chú</dt>
            <dd className='break-words'>{link.note || "-"}</dd>
          </dl>
        </Section>
      </div>
    </div>
  );
};

const Settings = ({
  link,
  busy,
  onTask,
  onEnable,
  onArchive
}: {
  link: Link;
  busy: boolean;
  onTask: (task: Task) => void;
  onEnable: () => void;
  onArchive: () => void;
}) => {
  const { canDelete, lockedBySystem } = useLinkRights(link);
  return (
    <div className='space-y-4'>
      <Section
        action={
          <Button onClick={() => onTask("group")}>
            <FolderInputIcon />
            Chuyển nhóm
          </Button>
        }
        lead='Chỉ để sắp xếp trong đơn vị. Địa chỉ link và QR không đổi.'
        title='Nhóm'
      />
      <Section
        action={
          <Button onClick={() => onTask("access")}>
            <LockIcon />
            Đặt mật khẩu, hạn dùng
          </Button>
        }
        lead={
          <>
            {link.hasPassword ? "Người mở phải nhập mật khẩu trước. " : "Không có mật khẩu. "}
            {link.expiresAt ? `Hết hạn lúc ${formatVietnam(link.expiresAt)}.` : "Không giới hạn thời gian."}
          </>
        }
        title='Mật khẩu và hạn dùng'
      />
      <Section
        action={
          <Button onClick={() => onTask("preview")}>
            <Share2Icon />
            Sửa phần xem trước
          </Button>
        }
        lead='Tiêu đề, mô tả và ảnh hiện ra khi dán link vào Zalo, Facebook.'
        title='Xem trước khi chia sẻ'
      />
      <Section
        className='border-destructive/30'
        lead='Người đang cầm bản in sẽ thấy ngay những thay đổi này.'
        title='Vùng cần cẩn thận'
      >
        <DangerRow
          lead={
            link.enabled
              ? "Người mở thấy trang thông báo thay vì được chuyển tới đích. Bật lại được."
              : "Link đang tắt. Bật lại để người mở được chuyển tới đích như trước."
          }
          title={link.enabled ? "Tắt link" : "Bật lại link"}
        >
          {link.enabled ? (
            <Button disabled={busy} onClick={() => onTask("disable")} variant='danger'>
              <PowerOffIcon />
              Tắt link
            </Button>
          ) : (
            <Button disabled={busy || lockedBySystem} onClick={onEnable}>
              <PowerIcon />
              Bật lại link
            </Button>
          )}
        </DangerRow>
        <DangerRow
          lead={
            link.archived
              ? "Link đang được lưu trữ: ẩn khỏi danh sách, vẫn mở bình thường."
              : "Ẩn khỏi danh sách, link vẫn mở bình thường."
          }
          title={link.archived ? "Bỏ lưu trữ" : "Lưu trữ"}
        >
          <Button disabled={busy} onClick={onArchive}>
            {link.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
            {link.archived ? "Bỏ lưu trữ" : "Lưu trữ"}
          </Button>
        </DangerRow>
        {canDelete && (
          <DangerRow lead='Không lấy lại được. Mã link giữ mãi, không cấp cho link khác.' title='Xóa link'>
            <Button disabled={busy} onClick={() => onTask("delete")} variant='danger'>
              <Trash2Icon />
              Xóa link
            </Button>
          </DangerRow>
        )}
      </Section>
    </div>
  );
};

/**
 * One Link's own page: what it is and where it leads at the top, then its QR, Lượt mở, history
 * and settings as tabs, the tab kept in the address. It is about the Đơn vị that owns the Link, so
 * opening it switches to that Đơn vị when the account is in it.
 */
const LinkDetailPage = () => {
  const { code = "" } = useParams();
  const { me, unit, selectUnit } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: link, error, setData } = useLoaded(code, (value) => api.link(value));
  const groupsLoaded = useLoaded(link?.unitId ?? 0, (id) =>
    id ? api.groups(id).then((answer) => answer.groups) : Promise.resolve([])
  );
  const [task, setTask] = useState<Task>(params.get("task") === "target" ? "target" : null);
  const [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState("");
  // Counts what may have changed the picture, so the QR is fetched again.
  const [qrVersion, setQrVersion] = useState(0);
  const asked = params.get("tab");
  const tab: Tab = isTab(asked) ? asked : "overview";

  const linkUnit = link?.unitId;
  useEffect(() => {
    if (linkUnit && unit && linkUnit !== unit.unitId && me?.units.some((candidate) => candidate.unitId === linkUnit)) {
      selectUnit(linkUnit);
    }
  }, [linkUnit, unit, me, selectUnit]);

  const setTab = (next: Tab) => setParams(next === "overview" ? {} : { tab: next }, { replace: true });
  const close = () => {
    setTask(null);
    if (params.has("task")) {
      setParams(tab === "overview" ? {} : { tab }, { replace: true });
    }
  };

  if (!link) {
    return (
      <div className='space-y-4'>
        <RouterLink
          className='inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-primary'
          to='/'
        >
          <ArrowLeftIcon className='size-4' />
          Link
        </RouterLink>
        {error ? <ErrorText>{error}</ErrorText> : <p className='text-muted-foreground'>Đang tải...</p>}
      </div>
    );
  }

  const changed = (next: Link) => setData(next);
  const setStatus = async (change: () => Promise<Link>) => {
    setTask(null);
    setBusy(true);
    setStatusError("");
    try {
      changed(await change());
    } catch (failure) {
      setStatusError(messageOf(failure));
    }
    setBusy(false);
  };

  return (
    <div className='space-y-4'>
      <RouterLink className='inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-primary' to='/'>
        <ArrowLeftIcon className='size-4' />
        Link
      </RouterLink>

      <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
        <h1 className='min-w-0 text-balance break-words font-bold text-2xl tracking-tight'>{link.name}</h1>
        <div className='flex flex-wrap gap-1'>
          <StatusBadge link={link} />
        </div>
        <div className='flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto'>
          <CopyButton label='Sao chép link' value={link.url} />
          <Button onClick={() => setTab("qr")} variant='primary'>
            <DownloadIcon />
            Tải QR
          </Button>
        </div>
      </div>
      <ErrorText>{statusError}</ErrorText>

      <Tabs onValueChange={(value) => setTab(value as Tab)} value={tab}>
        <div className='-mx-4 overflow-x-auto border-b px-4 md:mx-0 md:px-0'>
          <TabsList className='h-auto gap-1 p-0' variant='line'>
            {ORDER.map((key) => (
              <TabsTrigger
                className='flex-none rounded-none px-3 py-2.5 data-[state=active]:text-primary group-data-[variant=line]/tabs-list:data-[state=active]:after:bg-primary'
                key={key}
                value={key}
              >
                {TABS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent className='pt-2' value='overview'>
          <Overview
            groupName={groupsLoaded.data?.find((group) => group.id === link.groupId)?.name ?? null}
            link={link}
            onTab={setTab}
            onTask={setTask}
            qrVersion={qrVersion}
          />
        </TabsContent>
        <TabsContent className='pt-2' value='qr'>
          <Card>
            <QrPanel
              link={link}
              onChanged={(next) => {
                changed(next);
                setQrVersion((value) => value + 1);
              }}
            />
          </Card>
        </TabsContent>
        <TabsContent className='pt-2' value='visits'>
          <Card>
            <VisitsPanel link={link} />
          </Card>
        </TabsContent>
        <TabsContent className='pt-2' value='history'>
          <Card>
            <h2 className='font-semibold'>Lịch sử thay đổi</h2>
            <p className='text-muted-foreground text-sm'>Mọi Thành viên của đơn vị đều xem được.</p>
            <HistoryPanel link={link} />
          </Card>
        </TabsContent>
        <TabsContent className='pt-2' value='settings'>
          <Settings
            busy={busy}
            link={link}
            onArchive={() =>
              setStatus(() => (link.archived ? api.unarchiveLink(link.code) : api.archiveLink(link.code)))
            }
            onEnable={() => setStatus(() => api.enableLink(link.code))}
            onTask={setTask}
          />
        </TabsContent>
      </Tabs>

      <Modal
        description={link.name}
        onClose={close}
        open={isFormTask(task)}
        title={isFormTask(task) ? TASK_TITLE[task] : ""}
      >
        {task === "target" && <TargetForm link={link} onChanged={changed} onDone={close} />}
        {task === "details" && <DetailsForm link={link} onChanged={changed} onDone={close} />}
        {task === "access" && <AccessForm link={link} onChanged={changed} onDone={close} />}
        {task === "group" && (
          <GroupForm
            groups={groupsLoaded.data ?? []}
            link={link}
            onChanged={(next) => {
              changed(next);
              groupsLoaded.reload();
            }}
            onDone={close}
          />
        )}
        {task === "preview" && <PreviewPanel link={link} onChanged={changed} onDone={close} />}
      </Modal>

      {task === "delete" && (
        <DeleteLinkDialog link={link} onClose={close} onDeleted={() => navigate("/", { replace: true })} open />
      )}

      <DisableLinkDialog
        busy={busy}
        link={link}
        onCancel={close}
        onConfirm={() => setStatus(() => api.disableLink(link.code))}
        open={task === "disable"}
      />
    </div>
  );
};

export { LinkDetailPage };
