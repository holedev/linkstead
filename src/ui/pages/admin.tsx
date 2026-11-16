import { type FormEvent, useState } from "react";
import { Navigate } from "react-router";
import { api, type Link, type UnitOverview } from "../api";
import { Button, Card, ConfirmDialog, ErrorText, Field, SecretBox } from "../components";
import { messageOf } from "../messages";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";
import { AdminLinkLookup } from "./admin-link";

/** One busy flag and one error line for a card's writes. `run` answers whether the write went through. */
const useAction = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      return true;
    } catch (failure) {
      setError(messageOf(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
};

type CreatedUnit = { name: string; managerEmail: string; setupUrl: string | null };

const UnitsCard = ({
  units,
  error,
  onChanged
}: {
  units: UnitOverview[] | null;
  error: string;
  onChanged: () => void;
}) => {
  const { busy, error: actionError, run } = useAction();
  const [name, setName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [created, setCreated] = useState<CreatedUnit | null>(null);
  const [dissolveId, setDissolveId] = useState<number | null>(null);
  const dissolving = units?.find((unit) => unit.id === dissolveId) ?? null;

  const create = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      setCreated(await api.adminCreateUnit(name, managerEmail));
      setName("");
      setManagerEmail("");
      onChanged();
    });
  };

  const dissolve = () => {
    const id = dissolveId;
    setDissolveId(null);
    if (id !== null) {
      run(async () => {
        await api.adminDissolveUnit(id);
        onChanged();
      });
    }
  };

  return (
    <Card flush>
      <div className='border-line border-b p-4 sm:p-5'>
        <h2 className='font-semibold text-lg'>Đơn vị</h2>
        <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end' onSubmit={create}>
          <Field label='Tên đơn vị mới'>
            {(props) => (
              <input
                {...props}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder='Khoa Công nghệ thông tin'
                required
                value={name}
              />
            )}
          </Field>
          <Field label='Email Quản lý đơn vị đầu tiên'>
            {(props) => (
              <input
                {...props}
                onChange={(event) => setManagerEmail(event.target.value)}
                placeholder='ten@ou.edu.vn'
                required
                type='email'
                value={managerEmail}
              />
            )}
          </Field>
          <Button disabled={busy} type='submit' variant='primary'>
            Tạo đơn vị
          </Button>
        </form>
        <div className='mt-4'>
          <ErrorText>{actionError || error}</ErrorText>
        </div>
        {created && (
          <div className='mt-4 space-y-2 rounded-md border border-ok/30 bg-ok/5 p-3'>
            <p className='text-sm'>
              Đã tạo đơn vị "{created.name}" với Quản lý đơn vị <strong>{created.managerEmail}</strong>.{" "}
              {created.setupUrl
                ? "Hãy tự gửi đường dẫn đặt mật khẩu này cho họ; đường dẫn dùng được một lần, trong 7 ngày, và sẽ không hiện lại."
                : "Người này đã có mật khẩu nên không cần đường dẫn mới."}
            </p>
            {created.setupUrl && <SecretBox value={created.setupUrl} />}
          </div>
        )}
      </div>

      {!(units || error) && <p className='p-4 text-muted'>Đang tải...</p>}
      <ul className='divide-y divide-line'>
        {units?.map((unit) => (
          <li className='flex flex-col gap-2 p-4 sm:flex-row sm:items-center' key={unit.id}>
            <div className='min-w-0 flex-1'>
              <p className='break-words font-medium'>{unit.name}</p>
              <p className='text-muted text-sm'>
                {unit.linkCount} link - Quản lý: <span className='break-all'>{unit.managers.join(", ")}</span>
              </p>
            </div>
            {unit.linkCount === 0 ? (
              <Button disabled={busy} onClick={() => setDissolveId(unit.id)} variant='danger'>
                Giải thể
              </Button>
            ) : (
              <p className='text-muted text-xs sm:max-w-48 sm:text-right'>
                Còn link nên chưa giải thể được. Chuyển hết link đi trước.
              </p>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        busy={busy}
        confirmLabel='Giải thể đơn vị'
        onCancel={() => setDissolveId(null)}
        onConfirm={dissolve}
        open={dissolving !== null}
        title={`Giải thể "${dissolving?.name}"`}
      >
        Mọi thành viên sẽ rời đơn vị và mọi khóa API của đơn vị ngừng hoạt động ngay. Việc này không hoàn tác được, và
        tên "{dissolving?.name}" không dùng lại được cho đơn vị mới.
      </ConfirmDialog>
    </Card>
  );
};

const ReservedCodesCard = () => {
  const { data, error, reload } = useLoaded(0, () => api.adminReservedCodes().then((answer) => answer.codes));
  const { busy, error: actionError, run } = useAction();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");

  const add = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      await api.adminReserve(code, note);
      setCode("");
      setNote("");
      reload();
    });
  };

  return (
    <Card flush>
      <div className='border-line border-b p-4 sm:p-5'>
        <h2 className='font-semibold text-lg'>Mã dành riêng</h2>
        <p className='mt-1 text-muted text-sm'>
          Mã không ai tự lấy được - tên khoa, tên chương trình của trường. Chỉ Quản trị hệ thống cấp, bằng mục "Tạo link
          cho đơn vị" bên dưới.
        </p>
        <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end' onSubmit={add}>
          <Field label='Mã'>
            {(props) => (
              <input
                {...props}
                autoCapitalize='none'
                maxLength={50}
                onChange={(event) => setCode(event.target.value)}
                placeholder='tuyensinh'
                required
                spellCheck={false}
                value={code}
              />
            )}
          </Field>
          <Field label='Dành cho (không bắt buộc)'>
            {(props) => (
              <input
                {...props}
                maxLength={200}
                onChange={(event) => setNote(event.target.value)}
                placeholder='Phòng Quản lý đào tạo'
                value={note}
              />
            )}
          </Field>
          <Button disabled={busy} type='submit' variant='primary'>
            Dành riêng
          </Button>
        </form>
        <div className='mt-4'>
          <ErrorText>{actionError || error}</ErrorText>
        </div>
      </div>
      {!(data || error) && <p className='p-4 text-muted'>Đang tải...</p>}
      {data?.length === 0 && <p className='p-4 text-muted'>Chưa có mã dành riêng nào.</p>}
      <ul className='divide-y divide-line'>
        {data?.map((reserved) => (
          <li className='flex flex-col gap-2 p-4 sm:flex-row sm:items-center' key={reserved.code}>
            <div className='min-w-0 flex-1'>
              <p className='break-all font-mono'>{reserved.code}</p>
              {reserved.note && <p className='break-words text-muted text-sm'>{reserved.note}</p>}
            </div>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api.adminUnreserve(reserved.code);
                  reload();
                })
              }
            >
              Bỏ dành riêng
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
};

const EMPTY = { code: "", name: "", target: "", unitId: "" };

/** Creates a Link for any Đơn vị - the one way a Mã dành riêng is handed out. */
const HandOutCard = ({ units, onCreated }: { units: UnitOverview[]; onCreated: () => void }) => {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState(EMPTY);
  const [created, setCreated] = useState<Link | null>(null);
  const set = (field: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setForm((previous) => ({ ...previous, [field]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      setCreated(await api.adminCreateLink({ ...form, note: "", unitId: Number(form.unitId) }));
      setForm(EMPTY);
      onCreated();
    });
  };

  return (
    <Card>
      <h2 className='font-semibold text-lg'>Tạo link cho đơn vị</h2>
      <p className='mt-1 text-muted text-sm'>
        Link thuộc về đơn vị được chọn ngay từ đầu. Ở đây dùng được cả mã dành riêng; mã vẫn không đổi được sau khi tạo.
      </p>
      <form className='mt-4 space-y-4' onSubmit={submit}>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <Field label='Đơn vị nhận link'>
            {(props) => (
              <select {...props} onChange={set("unitId")} required value={form.unitId}>
                <option value=''>Chọn đơn vị</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label='Mã link'>
            {(props) => (
              <input
                {...props}
                autoCapitalize='none'
                maxLength={50}
                onChange={set("code")}
                placeholder='tuyensinh'
                required
                spellCheck={false}
                value={form.code}
              />
            )}
          </Field>
        </div>
        <Field label='Tên link'>
          {(props) => (
            <input
              {...props}
              maxLength={200}
              onChange={set("name")}
              placeholder='Trang tuyển sinh'
              required
              value={form.name}
            />
          )}
        </Field>
        <Field label='Đích'>
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

/** What only a Quản trị hệ thống does. The server refuses everyone else whatever this screen shows. */
const AdminPage = () => {
  const { me, refresh } = useSession();
  const { data: units, error, reload } = useLoaded(0, () => api.adminUnits().then((answer) => answer.units));
  if (!me?.isSystemAdmin) {
    return <Navigate replace to='/' />;
  }
  // A Đơn vị created or dissolved changes the administrator's own list of units too.
  const unitsChanged = () => {
    reload();
    refresh();
  };

  return (
    <>
      <AdminLinkLookup onMoved={reload} units={units ?? []} />
      <UnitsCard error={error} onChanged={unitsChanged} units={units} />
      <ReservedCodesCard />
      <HandOutCard onCreated={reload} units={units ?? []} />
    </>
  );
};

export { AdminPage };
