import { type FormEvent, useState } from "react";
import { api } from "../api";
import { Badge, Button, Card, ConfirmDialog, ErrorText, Field, formatDate, SecretBox } from "../components";
import { messageOf } from "../messages";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";

const KeysPage = () => {
  const { unit } = useSession();
  const unitId = unit?.unitId ?? 0;
  const { data, error, reload } = useLoaded(unitId, (id) => api.keys(id).then((answer) => answer.keys));
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ name: string; key: string } | null>(null);
  // The id, never the row: the row is read from the live list each render, so the dialog cannot
  // show a key as it was before the list reloaded.
  const [revokeId, setRevokeId] = useState<number | null>(null);
  const revoking = data?.find((key) => key.id === revokeId) ?? null;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      setIssued(await api.createKey(unitId, name));
      setName("");
      reload();
    } catch (failure) {
      setFormError(messageOf(failure));
    }
    setBusy(false);
  };

  const revoke = async () => {
    const id = revokeId;
    setRevokeId(null);
    if (id === null) {
      return;
    }
    setBusy(true);
    try {
      await api.revokeKey(unitId, id);
      reload();
    } catch (failure) {
      setFormError(messageOf(failure));
    }
    setBusy(false);
  };

  return (
    <>
      <Card>
        <h2 className='font-semibold text-lg'>Cấp khóa API cho {unit?.unitName}</h2>
        <p className='mt-1 text-muted text-sm'>
          Khóa cho phép một ứng dụng tạo link, đổi đích, tắt, bật và xem link của đơn vị này, không phải của đơn vị
          khác.
        </p>
        <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end' onSubmit={create}>
          <Field label='Tên khóa'>
            {(props) => (
              <input
                {...props}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder='CRM của Tạp chí'
                required
                value={name}
              />
            )}
          </Field>
          <Button disabled={busy} type='submit' variant='primary'>
            Cấp khóa
          </Button>
        </form>
        <div className='mt-4'>
          <ErrorText>{formError}</ErrorText>
        </div>
        {issued && (
          <div className='mt-4 space-y-2 rounded-md border border-ok/30 bg-ok/5 p-3'>
            <p className='text-sm'>
              Khóa "{issued.name}" chỉ hiện <strong>một lần này</strong>. Hãy sao chép và cất ngay; hệ thống không lưu
              lại khóa nên không thể xem lại.
            </p>
            <SecretBox value={issued.key} />
          </div>
        )}
      </Card>

      <Card flush>
        <h2 className='border-line border-b p-4 font-semibold text-lg'>Khóa API</h2>
        {error && (
          <div className='p-4'>
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {!(data || error) && <p className='p-4 text-muted'>Đang tải...</p>}
        {data?.length === 0 && <p className='p-4 text-muted'>Đơn vị chưa có khóa nào.</p>}
        <ul className='divide-y divide-line'>
          {data?.map((key) => (
            <li className='flex flex-col gap-2 p-4 sm:flex-row sm:items-center' key={key.id}>
              <div className='min-w-0 flex-1'>
                <p className='break-words font-medium'>{key.name}</p>
                <p className='text-muted text-xs'>
                  Cấp ngày {formatDate(key.createdAt)}
                  {key.revokedAt && ` - thu hồi ngày ${formatDate(key.revokedAt)}`}
                </p>
              </div>
              {key.revokedAt ? (
                <Badge tone='muted'>Đã thu hồi</Badge>
              ) : (
                <Button disabled={busy} onClick={() => setRevokeId(key.id)} variant='danger'>
                  Thu hồi
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog
        busy={busy}
        confirmLabel='Thu hồi khóa'
        onCancel={() => setRevokeId(null)}
        onConfirm={revoke}
        open={revoking !== null}
        title='Thu hồi khóa API'
      >
        Thu hồi khóa "{revoking?.name}"? Ứng dụng đang dùng khóa này sẽ bị từ chối ngay lập tức, và khóa đã thu hồi
        không khôi phục được - muốn dùng lại phải cấp khóa mới.
      </ConfirmDialog>
    </>
  );
};

export { KeysPage };
