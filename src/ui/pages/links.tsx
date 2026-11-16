import { DownloadIcon, Link2Icon, PlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button, Card, ErrorText, Field, Modal, SecretBox } from "@/components/app";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { api, type Link } from "../api";
import { messageOf } from "../messages";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";
import { LinkRow } from "./link-row";

const EMPTY = { code: "", name: "", note: "", target: "" };

/**
 * The form for a new Link. After a save it shows the address to copy, and offers to make another
 * - several are often made in a row.
 */
const CreateLinkForm = ({
  unitId,
  onCreated,
  onDone
}: {
  unitId: number;
  onCreated: (link: Link) => void;
  onDone: () => void;
}) => {
  const [form, setForm] = useState(EMPTY);
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
      const link = await api.createLink({ ...form, unitId });
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

/** The Đơn vị's Links first; making a new one is a button away. */
const LinksPage = () => {
  const { unit } = useSession();
  const unitId = unit?.unitId ?? 0;
  const { data, error, setData } = useLoaded(unitId, (id) => api.links(id).then((answer) => answer.links));
  const [creating, setCreating] = useState(false);
  const hasLinks = (data?.length ?? 0) > 0;

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
        <Card flush>
          <ul className='divide-y divide-border'>
            {data.map((link) => (
              <LinkRow
                key={link.code}
                link={link}
                onChanged={(changed) =>
                  setData((links) => (links ?? []).map((other) => (other.code === changed.code ? changed : other)))
                }
              />
            ))}
          </ul>
        </Card>
      )}

      <Modal
        description={`Link mới thuộc về ${unit?.unitName}.`}
        onClose={() => setCreating(false)}
        open={creating}
        title='Tạo link'
      >
        <CreateLinkForm
          onCreated={(link) => setData((links) => [link, ...(links ?? [])])}
          onDone={() => setCreating(false)}
          unitId={unitId}
        />
      </Modal>
    </>
  );
};

export { LinksPage };
