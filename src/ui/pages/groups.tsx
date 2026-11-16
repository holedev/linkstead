import { EllipsisIcon, FolderIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button, ErrorText, Field } from "@/components/app";
import { Button as UiButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { LinkGroup } from "../api";
import { useLinkDrop } from "../lib/drag";
import { messageOf } from "../messages";

/**
 * A Nhóm as a folder: open it to see its Links; rename or delete it from its menu. Deleting keeps
 * its Links - they come back out to the top, with the Đơn vị's shared ones.
 */
const FolderTile = ({
  group,
  onOpen,
  onRename,
  onDelete,
  onDropLink
}: {
  group: LinkGroup;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDropLink: (code: string) => void;
}) => {
  const { dropProps, over } = useLinkDrop(onDropLink);
  return (
    <li className='group/folder relative' {...dropProps}>
      <button
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border bg-card p-3 pr-12 text-left outline-none transition hover:border-ring hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
          over && "border-primary bg-primary/10 ring-2 ring-primary/30"
        )}
        onClick={onOpen}
        type='button'
      >
        <span className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
          <FolderIcon className='size-5' />
        </span>
        <span className='min-w-0'>
          <span className='block truncate font-medium'>{group.name}</span>
          <span className='block text-muted-foreground text-xs'>
            {over ? "Thả để chuyển vào nhóm" : `${group.linkCount} link`}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <UiButton
            aria-label={`Thao tác với nhóm ${group.name}`}
            className='absolute top-1/2 right-2 size-8 -translate-y-1/2'
            size='icon'
            variant='ghost'
          >
            <EllipsisIcon />
          </UiButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='min-w-44'>
          <DropdownMenuItem onSelect={onRename}>
            <PencilIcon />
            Đổi tên
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDelete} variant='destructive'>
            <Trash2Icon />
            Xóa nhóm
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
};

/** A Đơn vị's Nhóm, shown as folders at the top of its Links. */
const FolderGrid = ({
  groups,
  onOpen,
  onRename,
  onDelete,
  onDropLink
}: {
  groups: LinkGroup[];
  onOpen: (group: LinkGroup) => void;
  onRename: (group: LinkGroup) => void;
  onDelete: (group: LinkGroup) => void;
  /** A Link dropped on a folder: its Mã link, and the Nhóm it goes into. */
  onDropLink: (code: string, group: LinkGroup) => void;
}) => (
  <ul aria-label='Nhóm' className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
    {groups.map((group) => (
      <FolderTile
        group={group}
        key={group.id}
        onDelete={() => onDelete(group)}
        onDropLink={(code) => onDropLink(code, group)}
        onOpen={() => onOpen(group)}
        onRename={() => onRename(group)}
      />
    ))}
  </ul>
);

/** Names a Nhóm, new or renamed. Closes itself once the name is saved. */
const GroupNameForm = ({
  initial = "",
  submitLabel,
  onSave,
  onDone
}: {
  initial?: string;
  submitLabel: string;
  onSave: (name: string) => Promise<unknown>;
  onDone: () => void;
}) => {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(name);
      onDone();
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  };

  return (
    <form className='space-y-4' onSubmit={save}>
      <Field hint='Chỉ để sắp xếp link trong đơn vị. Địa chỉ link và QR đã in không đổi.' label='Tên nhóm'>
        {(props) => (
          <input
            {...props}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder='Hội thảo 2027'
            required
            value={name}
          />
        )}
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>Hủy</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? "Đang lưu..." : submitLabel}
        </Button>
      </div>
    </form>
  );
};

export { FolderGrid, GroupNameForm };
