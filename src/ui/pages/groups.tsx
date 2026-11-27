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
import { text } from "../i18n";
import { useLinkDrop } from "../lib/drag";
import { messageOf } from "../messages";

/**
 * A Group as a folder: open it to see its Links; rename or delete it from its menu. Deleting keeps
 * its Links - they come back out to the top, with the Unit's shared ones.
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
  const t = text().groups;
  return (
    <li className='group/folder relative' {...dropProps}>
      <button
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border bg-card p-2 pr-10 text-left outline-none transition hover:border-ring hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
          over && "border-primary bg-primary/10 ring-2 ring-primary/30"
        )}
        onClick={onOpen}
        type='button'
      >
        <span className='flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-primary'>
          <FolderIcon className='size-4' />
        </span>
        <span className='min-w-0'>
          <span className='block truncate font-semibold text-sm'>{group.name}</span>
          <span className='block text-muted-foreground text-xs'>
            {over ? t.dropHere : t.linkCount(group.linkCount)}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <UiButton
            aria-label={t.actionsFor(group.name)}
            className='absolute top-1/2 right-1 size-8 -translate-y-1/2'
            size='icon'
            variant='ghost'
          >
            <EllipsisIcon />
          </UiButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='min-w-44'>
          <DropdownMenuItem onSelect={onRename}>
            <PencilIcon />
            {t.rename}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDelete} variant='destructive'>
            <Trash2Icon />
            {t.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
};

/** A Unit's Groups, shown as folders at the top of its Links. */
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
  /** A Link dropped on a folder: its Link Code, and the Group it goes into. */
  onDropLink: (code: string, group: LinkGroup) => void;
}) => (
  <ul aria-label={text().groups.label} className='grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4'>
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

/** Names a Group, new or renamed. Closes itself once the name is saved. */
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
  const t = text();

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
      <Field hint={t.groups.nameHint} label={t.groups.name}>
        {(props) => (
          <input
            {...props}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.groups.namePlaceholder}
            required
            value={name}
          />
        )}
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>{t.common.cancel}</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? t.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
};

export { FolderGrid, GroupNameForm };
