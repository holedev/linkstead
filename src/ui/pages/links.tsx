import { type FormEvent, useState } from "react";
import { api, type Link } from "../api";
import { Button, Card, ErrorText, Field, SecretBox } from "../components";
import { messageOf } from "../messages";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";
import { LinkRow } from "./link-row";

const EMPTY = { code: "", name: "", note: "", target: "" };

/** The form for a new Link. It stays open after a save so several can be made in a row. */
const CreateLink = ({ unitId, onCreated }: { unitId: number; onCreated: (link: Link) => void }) => {
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

  return (
    <Card>
      <h2 className='font-semibold text-lg'>Tạo link</h2>
      <form className='mt-4 space-y-4' onSubmit={submit}>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
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
          <Field hint='Bỏ trống để hệ thống tự sinh. Mã không đổi được sau khi tạo.' label='Mã link'>
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
        </div>
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
        <Field label='Ghi chú (không bắt buộc)'>
          {(props) => <textarea {...props} maxLength={1000} onChange={set("note")} rows={2} value={form.note} />}
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? "Đang tạo..." : "Tạo link"}
        </Button>
      </form>

      {created && (
        <div className='mt-4 space-y-2 rounded-md border border-ok/30 bg-ok/5 p-3'>
          <p className='font-medium text-ok text-sm'>Đã tạo link "{created.name}".</p>
          <SecretBox value={created.url} />
        </div>
      )}
    </Card>
  );
};

const LinksPage = () => {
  const { unit } = useSession();
  const unitId = unit?.unitId ?? 0;
  const { data, error, setData } = useLoaded(unitId, (id) => api.links(id).then((answer) => answer.links));

  return (
    <>
      <CreateLink key={unitId} onCreated={(link) => setData((links) => [link, ...(links ?? [])])} unitId={unitId} />
      <Card flush>
        <h2 className='border-line border-b p-4 font-semibold text-lg'>
          Link của {unit?.unitName}
          {data && <span className='ml-2 font-normal text-muted text-sm'>({data.length})</span>}
        </h2>
        {error && (
          <div className='p-4'>
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {!(data || error) && <p className='p-4 text-muted'>Đang tải...</p>}
        {data?.length === 0 && <p className='p-4 text-muted'>Đơn vị chưa có link nào.</p>}
        {data && data.length > 0 && (
          <ul className='divide-y divide-line'>
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
        )}
      </Card>
    </>
  );
};

export { LinksPage };
