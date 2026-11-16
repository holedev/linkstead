import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button, ConfirmDialog, ErrorText, Field } from "@/components/app";
import { Button as UiButton } from "@/components/ui/button";
import { api, type LinkGroup } from "../api";
import { messageOf } from "../messages";

/** One Nhóm in the manager: its name, how many Links, and renaming or deleting it in place. */
const GroupRow = ({
  group,
  busy,
  onRename,
  onDelete
}: {
  group: LinkGroup;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (await onRename(name)) {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <li className='p-2'>
        <form className='flex items-center gap-2' onSubmit={save}>
          <input
            aria-label={`Tên mới cho nhóm ${group.name}`}
            className='min-h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base md:text-sm'
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
          <UiButton aria-label='Lưu tên nhóm' disabled={busy} size='icon' type='submit' variant='outline'>
            <CheckIcon />
          </UiButton>
          <UiButton
            aria-label='Hủy đổi tên'
            onClick={() => {
              setName(group.name);
              setEditing(false);
            }}
            size='icon'
            type='button'
            variant='ghost'
          >
            <XIcon />
          </UiButton>
        </form>
      </li>
    );
  }

  return (
    <li className='flex items-center gap-2 p-2'>
      <span className='min-w-0 flex-1 break-words'>{group.name}</span>
      <span className='shrink-0 text-muted-foreground text-xs tabular-nums'>{group.linkCount} link</span>
      <UiButton
        aria-label={`Đổi tên nhóm ${group.name}`}
        disabled={busy}
        onClick={() => setEditing(true)}
        size='icon'
        variant='ghost'
      >
        <PencilIcon />
      </UiButton>
      <UiButton
        aria-label={`Xóa nhóm ${group.name}`}
        className='text-destructive'
        disabled={busy}
        onClick={onDelete}
        size='icon'
        variant='ghost'
      >
        <Trash2Icon />
      </UiButton>
    </li>
  );
};

/**
 * A Đơn vị's Nhóm: make one, rename one, delete one. Deleting keeps its Links, in no Nhóm -
 * nothing printed carries a Nhóm, so it is safe to reorganise at any time.
 */
const GroupManager = ({
  unitId,
  groups,
  onChanged
}: {
  unitId: number;
  groups: LinkGroup[];
  onChanged: () => void;
}) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const deleting = groups.find((group) => group.id === deleteId) ?? null;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      onChanged();
      return true;
    } catch (failure) {
      setError(messageOf(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (await run(() => api.createGroup(unitId, name))) {
      setName("");
    }
  };

  return (
    <div className='space-y-4'>
      <form className='grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end' onSubmit={create}>
        <Field label='Nhóm mới'>
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
        <Button disabled={busy} type='submit' variant='primary'>
          <PlusIcon />
          Tạo nhóm
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
      {groups.length === 0 ? (
        <p className='text-muted-foreground text-sm'>Đơn vị chưa có nhóm nào.</p>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {groups.map((group) => (
            <GroupRow
              busy={busy}
              group={group}
              key={group.id}
              onDelete={() => setDeleteId(group.id)}
              onRename={(next) => run(() => api.renameGroup(unitId, group.id, next))}
            />
          ))}
        </ul>
      )}
      <p className='text-muted-foreground text-xs'>
        Nhóm chỉ để sắp xếp link trong đơn vị. Đổi tên hay xóa nhóm không ảnh hưởng tới địa chỉ link hay QR đã in.
      </p>

      <ConfirmDialog
        busy={busy}
        confirmLabel='Xóa nhóm'
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          const id = deleteId;
          setDeleteId(null);
          if (id !== null) {
            run(() => api.deleteGroup(unitId, id));
          }
        }}
        open={deleting !== null}
        title={`Xóa nhóm "${deleting?.name}"`}
      >
        {deleting?.linkCount
          ? `${deleting.linkCount} link trong nhóm vẫn còn nguyên, chỉ không còn thuộc nhóm nào.`
          : "Nhóm này chưa có link nào."}
      </ConfirmDialog>
    </div>
  );
};

export { GroupManager };
