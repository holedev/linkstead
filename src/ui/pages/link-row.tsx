import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowRightLeftIcon,
  ChartNoAxesColumnIcon,
  ChevronRightIcon,
  EllipsisIcon,
  GripVerticalIcon,
  PowerIcon,
  PowerOffIcon,
  QrCodeIcon,
  SquareArrowOutUpRightIcon
} from "lucide-react";
import { type MouseEvent, useRef, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router";
import { CopyIconButton, ErrorText } from "@/components/app";
import { Button as UiButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api, type Link, type LinkGroup } from "../api";
import { startLinkDrag } from "../lib/drag";
import { messageOf } from "../messages";
import { DisableLinkDialog, GroupBadge, number, StatusBadge, useLinkRights } from "./link-forms";

/** The address of a Link's own page, at one of its tabs. */
const linkPage = (code: string, tab?: string): string => `/links/${code}${tab ? `?tab=${tab}` : ""}`;

/** The heads of the list's columns. From a tablet up only: on a phone a row is two lines instead. */
const LinkTableHeader = () => (
  <TableHeader className='hidden bg-muted/40 md:table-header-group'>
    <TableRow className='hover:bg-transparent'>
      <TableHead className='w-6'>
        <span className='sr-only'>Kéo</span>
      </TableHead>
      <TableHead className='w-14'>QR</TableHead>
      <TableHead>Tên link</TableHead>
      <TableHead>Mã link</TableHead>
      <TableHead className='hidden lg:table-cell'>Đích</TableHead>
      <TableHead className='text-right' title='Ước tính: lượt xem trước của Zalo, Facebook được bỏ qua khi nhận ra'>
        Lượt mở
      </TableHead>
      <TableHead className='w-12'>
        <span className='sr-only'>Thao tác</span>
      </TableHead>
    </TableRow>
  </TableHeader>
);

/** The few things done to a Link straight from the list; everything else is on its page. */
const RowActions = ({
  link,
  canEnable,
  busy,
  onDisable,
  onEnable,
  onArchive
}: {
  link: Link;
  canEnable: boolean;
  busy: boolean;
  onDisable: () => void;
  onEnable: () => void;
  onArchive: () => void;
}) => {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <UiButton
          aria-label={`Thao tác với link ${link.name}`}
          className='size-9 shrink-0 text-muted-foreground md:size-8'
          disabled={busy}
          size='icon'
          variant='ghost'
        >
          <EllipsisIcon />
        </UiButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='min-w-52'>
        <DropdownMenuItem onSelect={() => navigate(linkPage(link.code))}>
          <SquareArrowOutUpRightIcon />
          Mở trang của link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`${linkPage(link.code)}?task=target`)}>
          <ArrowRightLeftIcon />
          Đổi đích
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(linkPage(link.code, "qr"))}>
          <QrCodeIcon />
          QR và logo
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(linkPage(link.code, "visits"))}>
          <ChartNoAxesColumnIcon />
          Lượt mở
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {link.enabled ? (
          <DropdownMenuItem onSelect={onDisable} variant='destructive'>
            <PowerOffIcon />
            Tắt link
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={!canEnable} onSelect={onEnable}>
            <PowerIcon />
            Bật lại link
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onArchive}>
          {link.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
          {link.archived ? "Bỏ lưu trữ" : "Lưu trữ"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * A click on the row opens the Link's page - unless it was on something in the row that acts
 * itself, or in a menu or dialog the row opened: those sit elsewhere on the page, but React still
 * hands their clicks up to the row.
 */
const actsItself = (event: MouseEvent<HTMLElement>): boolean =>
  !(event.target instanceof Element && event.currentTarget.contains(event.target)) ||
  event.target.closest("a, button") !== null;

/**
 * One Link in the list: its QR, name, code, Đích and Lượt mở at a glance. The whole row opens its
 * page; switching off, on and archiving stay here, for doing to several in a row. Nothing here can
 * change the Mã link.
 */
const LinkRow = ({
  link,
  groups,
  showGroup = true,
  onChanged
}: {
  link: Link;
  /** The Đơn vị's Nhóm, to name the Link's. */
  groups: LinkGroup[];
  /** Off inside a Nhóm, where every Link shown is in it. */
  showGroup?: boolean;
  onChanged: (link: Link) => void;
}) => {
  const row = useRef<HTMLTableRowElement>(null);
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { lockedBySystem } = useLinkRights(link);
  const dim = !link.enabled || link.archived;

  const setStatus = async (change: () => Promise<Link>) => {
    setDisabling(false);
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
    <TableRow
      className={cn("cursor-pointer", dragging && "opacity-40")}
      onClick={(event) => !actsItself(event) && navigate(linkPage(link.code))}
      ref={row}
    >
      {/* Drag by this grip onto a Nhóm. A mouse only: on a phone, the page's "Chuyển nhóm" does the same. */}
      <TableCell className='hidden w-6 pr-0 md:table-cell'>
        <span
          aria-hidden='true'
          className='flex cursor-grab justify-center text-muted-foreground/50 hover:text-foreground active:cursor-grabbing'
          draggable
          onDragEnd={() => setDragging(false)}
          onDragStart={(event) => {
            setDragging(true);
            startLinkDrag(event, link.code, row.current);
          }}
          title='Kéo vào một nhóm'
        >
          <GripVerticalIcon className='size-4' />
        </span>
      </TableCell>

      <TableCell className='w-14 py-2.5'>
        <img
          alt=''
          className={cn("size-11 rounded-md border bg-white p-0.5", dim && "opacity-40")}
          height={44}
          loading='lazy'
          src={`/api/links/${link.code}/qr`}
          width={44}
        />
      </TableCell>

      <TableCell className='whitespace-normal py-2.5'>
        <div className='min-w-0 space-y-1'>
          <RouterLink
            className='break-words font-semibold leading-snug underline-offset-4 hover:underline'
            to={linkPage(link.code)}
          >
            {link.name}
          </RouterLink>
          <div className='flex flex-wrap items-center gap-1'>
            {!link.enabled || link.archived || link.unsafeSince || link.hasPassword || link.expiresAt ? (
              <StatusBadge link={link} />
            ) : null}
            {showGroup && <GroupBadge groupId={link.groupId} groups={groups} />}
          </div>
          {/* On a phone the other columns are hidden: their gist is this line. */}
          <p className='flex flex-wrap gap-x-1.5 text-muted-foreground text-xs md:hidden'>
            <span className='font-mono text-primary'>{link.code}</span>
            <span>· {number.format(link.visits)} lượt mở</span>
          </p>
          <ErrorText>{error}</ErrorText>
        </div>
      </TableCell>

      <TableCell className='hidden md:table-cell'>
        <div className='flex items-center gap-0.5'>
          <span className='font-mono text-primary text-sm'>{link.code}</span>
          <CopyIconButton label='Sao chép link' value={link.url} />
        </div>
      </TableCell>

      <TableCell className='hidden max-w-72 lg:table-cell'>
        <span className='block truncate text-muted-foreground text-sm' title={link.target}>
          {link.target.replace("https://", "")}
        </span>
      </TableCell>

      <TableCell className='hidden text-right font-medium tabular-nums md:table-cell'>
        {number.format(link.visits)}
      </TableCell>

      <TableCell className='w-12 text-right'>
        <span className='hidden md:inline-flex'>
          <RowActions
            busy={busy}
            canEnable={!lockedBySystem}
            link={link}
            onArchive={() =>
              setStatus(() => (link.archived ? api.unarchiveLink(link.code) : api.archiveLink(link.code)))
            }
            onDisable={() => setDisabling(true)}
            onEnable={() => setStatus(() => api.enableLink(link.code))}
          />
        </span>
        <ChevronRightIcon aria-hidden='true' className='inline size-4 text-muted-foreground md:hidden' />
        <DisableLinkDialog
          busy={busy}
          link={link}
          onCancel={() => setDisabling(false)}
          onConfirm={() => setStatus(() => api.disableLink(link.code))}
          open={disabling}
        />
      </TableCell>
    </TableRow>
  );
};

export { LinkRow, LinkTableHeader, linkPage };
