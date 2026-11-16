import { type FormEvent, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, ErrorText, Field, SecretBox } from "@/components/app";
import { api, type Role } from "../api";
import { messageOf } from "../messages";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";

type Issued = { email: string; setupUrl: string | null };

/** What to do with a one-time link, said where the link appears - the system sends no mail. */
const IssuedLink = ({ issued }: { issued: Issued }) =>
  issued.setupUrl ? (
    <div className='mt-4 space-y-2 rounded-md border border-ok/30 bg-ok/5 p-3'>
      <p className='text-sm'>
        Hãy tự gửi đường dẫn này cho <strong>{issued.email}</strong> (qua Zalo, email...). Đường dẫn dùng được{" "}
        <strong>một lần</strong>, trong <strong>7 ngày</strong>, và sẽ không hiện lại ở đây.
      </p>
      <SecretBox value={issued.setupUrl} />
    </div>
  ) : (
    <p className='mt-4 rounded-md border border-ok/30 bg-ok/5 p-3 text-sm'>
      Đã thêm <strong>{issued.email}</strong>. Người này đã có mật khẩu nên không cần đường dẫn mới.
    </p>
  );

const MembersPage = () => {
  const { unit, me, refresh } = useSession();
  const unitId = unit?.unitId ?? 0;
  const { data, error, reload } = useLoaded(unitId, (id) => api.members(id).then((answer) => answer.members));
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);

  // The email, never the row: the dialog reads the live list, as on the keys screen.
  const [removeEmail, setRemoveEmail] = useState<string | null>(null);
  const removing = data?.find((member) => member.email === removeEmail) ?? null;

  /** A change to who belongs here. It may be about the person looking, so their own units reload too. */
  const change = async (work: () => Promise<void>) => {
    setRemoveEmail(null);
    setBusy(true);
    setFormError("");
    setIssued(null);
    try {
      await work();
      reload();
      await refresh();
    } catch (failure) {
      setFormError(messageOf(failure));
    }
    setBusy(false);
  };

  const run = async (work: () => Promise<Issued>) => {
    setBusy(true);
    setFormError("");
    try {
      setIssued(await work());
      reload();
    } catch (failure) {
      setFormError(messageOf(failure));
    }
    setBusy(false);
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      const added = await api.addMember(unitId, email, role);
      setEmail("");
      return added;
    });
  };

  return (
    <>
      <Card>
        <h2 className='font-semibold text-lg'>Thêm thành viên vào {unit?.unitName}</h2>
        <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end' onSubmit={add}>
          <Field label='Email'>
            {(props) => (
              <input
                {...props}
                onChange={(event) => setEmail(event.target.value)}
                placeholder='ten@ou.edu.vn'
                required
                type='email'
                value={email}
              />
            )}
          </Field>
          <Field label='Vai trò'>
            {(props) => (
              <select {...props} onChange={(event) => setRole(event.target.value as Role)} value={role}>
                <option value='member'>Thành viên</option>
                <option value='manager'>Quản lý đơn vị</option>
              </select>
            )}
          </Field>
          <Button disabled={busy} type='submit' variant='primary'>
            Thêm
          </Button>
        </form>
        <div className='mt-4'>
          <ErrorText>{formError}</ErrorText>
        </div>
        {issued && <IssuedLink issued={issued} />}
      </Card>

      <Card flush>
        <h2 className='border-border border-b p-4 font-semibold text-lg'>Thành viên</h2>
        {error && (
          <div className='p-4'>
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {!(data || error) && <p className='p-4 text-muted-foreground'>Đang tải...</p>}
        <ul className='divide-y divide-border'>
          {data?.map((member) => (
            <li className='flex flex-col gap-3 p-4' key={member.email}>
              <div className='min-w-0 flex-1'>
                <p className='break-all font-medium'>{member.email}</p>
                <div className='mt-1 flex flex-wrap gap-2'>
                  <Badge tone='muted'>{member.role === "manager" ? "Quản lý đơn vị" : "Thành viên"}</Badge>
                  <Badge tone={member.hasPassword ? "ok" : "danger"}>
                    {member.hasPassword ? "Đã đặt mật khẩu" : "Chưa đặt mật khẩu"}
                  </Badge>
                </div>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button disabled={busy} onClick={() => run(() => api.reissueSetup(unitId, member.email))}>
                  Cấp đường dẫn đặt mật khẩu
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    change(() =>
                      api.setMemberRole(unitId, member.email, member.role === "manager" ? "member" : "manager")
                    )
                  }
                >
                  {member.role === "manager" ? "Chuyển thành Thành viên" : "Đặt làm Quản lý đơn vị"}
                </Button>
                <Button disabled={busy} onClick={() => setRemoveEmail(member.email)} variant='danger'>
                  Xóa khỏi đơn vị
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog
        busy={busy}
        confirmLabel='Xóa khỏi đơn vị'
        onCancel={() => setRemoveEmail(null)}
        onConfirm={() => change(() => api.removeMember(unitId, removeEmail ?? ""))}
        open={removing !== null}
        title='Xóa thành viên khỏi đơn vị'
      >
        Xóa {removing?.email === me?.email ? "chính bạn" : removing?.email} khỏi {unit?.unitName}? Người này sẽ không
        còn tạo hay sửa được link của đơn vị. Các link họ đã tạo vẫn thuộc đơn vị và tiếp tục hoạt động; tài khoản của
        họ vẫn còn và có thể được thêm lại.
      </ConfirmDialog>
    </>
  );
};

export { MembersPage };
