import { type FormEvent, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { Badge, Button, Card, ConfirmDialog, DownloadLink, ErrorText, Field, Modal, SecretBox } from "@/components/app";
import { api, type Link, type UnitOverview } from "../api";
import { messageOf } from "../messages";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";
import { AdminLinkLookup } from "./admin-link";
import { LogoCard } from "./logo-card";

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

/** Renames a Đơn vị. Its Links, their addresses and what is printed do not change. */
const RenameUnitForm = ({
  unit,
  onRenamed,
  onDone
}: {
  unit: UnitOverview;
  onRenamed: () => void;
  onDone: () => void;
}) => {
  const { busy, error, run } = useAction();
  const [name, setName] = useState(unit.name);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const renamed = await run(async () => {
      await api.adminRenameUnit(unit.id, name);
    });
    if (renamed) {
      onRenamed();
      onDone();
    }
  };

  return (
    <form className='space-y-4' onSubmit={save}>
      <Field hint='Link, địa chỉ link và QR đã in của đơn vị giữ nguyên.' label='Tên đơn vị'>
        {(props) => (
          <input {...props} maxLength={100} onChange={(event) => setName(event.target.value)} required value={name} />
        )}
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>Hủy</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>
    </form>
  );
};

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
  const [renameId, setRenameId] = useState<number | null>(null);
  const renaming = units?.find((unit) => unit.id === renameId) ?? null;

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
      <div className='border-border border-b p-4 sm:p-5'>
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

      {!(units || error) && <p className='p-4 text-muted-foreground'>Đang tải...</p>}
      <ul className='divide-y divide-border'>
        {units?.map((unit) => (
          <li className='flex flex-col gap-2 p-4 sm:flex-row sm:items-center' key={unit.id}>
            <div className='min-w-0 flex-1'>
              <p className='break-words font-medium'>{unit.name}</p>
              <p className='text-muted-foreground text-sm'>
                {unit.linkCount} link - Quản lý: <span className='break-all'>{unit.managers.join(", ")}</span>
              </p>
            </div>
            {unit.linkCount > 0 && (
              <p className='text-muted-foreground text-xs sm:max-w-48 sm:text-right'>
                Còn link nên chưa giải thể được. Chuyển hết link đi trước.
              </p>
            )}
            <div className='flex flex-wrap gap-2'>
              <Button disabled={busy} onClick={() => setRenameId(unit.id)}>
                Đổi tên
              </Button>
              {unit.linkCount === 0 && (
                <Button disabled={busy} onClick={() => setDissolveId(unit.id)} variant='danger'>
                  Giải thể
                </Button>
              )}
            </div>
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

      <Modal onClose={() => setRenameId(null)} open={renaming !== null} title='Đổi tên đơn vị'>
        {renaming && <RenameUnitForm onDone={() => setRenameId(null)} onRenamed={onChanged} unit={renaming} />}
      </Modal>
    </Card>
  );
};

/** Who else holds the role. Anyone here can do everything on this screen, for every Đơn vị. */
const AdminsCard = () => {
  const { me, refresh } = useSession();
  const { data, error, reload } = useLoaded(0, () => api.adminAdmins().then((answer) => answer.admins));
  const { busy, error: actionError, run } = useAction();
  const [email, setEmail] = useState("");
  const [granted, setGranted] = useState<{ email: string; setupUrl: string | null } | null>(null);
  const [revokeEmail, setRevokeEmail] = useState<string | null>(null);
  const revoking = data?.find((admin) => admin.email === revokeEmail) ?? null;
  const isSelf = revoking?.email === me?.email;

  const grant = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      setGranted(await api.adminGrant(email));
      setEmail("");
      reload();
    });
  };

  const revoke = () => {
    const target = revokeEmail;
    setRevokeEmail(null);
    if (target !== null) {
      run(async () => {
        await api.adminRevoke(target);
        reload();
        // Giving up one's own role closes this screen; the session says so.
        await refresh();
      });
    }
  };

  return (
    <Card flush>
      <div className='border-border border-b p-4 sm:p-5'>
        <h2 className='font-semibold text-lg'>Quản trị hệ thống</h2>
        <p className='mt-1 text-muted-foreground text-sm'>
          Người có vai trò này làm được mọi việc trên trang này với mọi đơn vị. Vai trò này không đưa họ vào đơn vị nào.
        </p>
        <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end' onSubmit={grant}>
          <Field label='Email người được thêm'>
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
          <Button disabled={busy} type='submit' variant='primary'>
            Thêm Quản trị hệ thống
          </Button>
        </form>
        <div className='mt-4'>
          <ErrorText>{actionError || error}</ErrorText>
        </div>
        {granted && (
          <div className='mt-4 space-y-2 rounded-md border border-ok/30 bg-ok/5 p-3'>
            <p className='text-sm'>
              <strong>{granted.email}</strong> đã là Quản trị hệ thống.{" "}
              {granted.setupUrl
                ? "Hãy tự gửi đường dẫn đặt mật khẩu này cho họ; đường dẫn dùng được một lần, trong 7 ngày, và sẽ không hiện lại."
                : "Người này đã có mật khẩu nên không cần đường dẫn mới."}
            </p>
            {granted.setupUrl && <SecretBox value={granted.setupUrl} />}
          </div>
        )}
      </div>
      {!(data || error) && <p className='p-4 text-muted-foreground'>Đang tải...</p>}
      <ul className='divide-y divide-border'>
        {data?.map((admin) => (
          <li className='flex flex-col gap-2 p-4 sm:flex-row sm:items-center' key={admin.email}>
            <div className='min-w-0 flex-1'>
              <p className='break-all font-medium'>
                {admin.email}
                {admin.email === me?.email && <span className='font-normal text-muted-foreground'> (bạn)</span>}
              </p>
              {!admin.hasPassword && (
                <div className='mt-1'>
                  <Badge tone='danger'>Chưa đặt mật khẩu</Badge>
                </div>
              )}
            </div>
            {data.length > 1 ? (
              <Button disabled={busy} onClick={() => setRevokeEmail(admin.email)} variant='danger'>
                Thu hồi vai trò
              </Button>
            ) : (
              <p className='text-muted-foreground text-xs sm:max-w-48 sm:text-right'>
                Quản trị hệ thống duy nhất nên không thu hồi được.
              </p>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        busy={busy}
        confirmLabel='Thu hồi vai trò'
        onCancel={() => setRevokeEmail(null)}
        onConfirm={revoke}
        open={revoking !== null}
        title='Thu hồi vai trò Quản trị hệ thống'
      >
        {isSelf
          ? "Thu hồi vai trò Quản trị hệ thống của chính bạn? Bạn sẽ rời trang này ngay và không tự lấy lại được vai trò - phải nhờ một Quản trị hệ thống khác thêm lại."
          : `Thu hồi vai trò Quản trị hệ thống của ${revoking?.email}? Họ mất quyền ngay lập tức.`}{" "}
        Tài khoản và các đơn vị họ đang thuộc về vẫn giữ nguyên.
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
      <div className='border-border border-b p-4 sm:p-5'>
        <h2 className='font-semibold text-lg'>Mã dành riêng</h2>
        <p className='mt-1 text-muted-foreground text-sm'>
          Mã không ai tự lấy được - tên khoa, tên chương trình của trường. Chỉ Quản trị hệ thống cấp, bằng mục "Tạo link
          cho đơn vị" ở trang "Link của mọi đơn vị".
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
      {!(data || error) && <p className='p-4 text-muted-foreground'>Đang tải...</p>}
      {data?.length === 0 && <p className='p-4 text-muted-foreground'>Chưa có mã dành riêng nào.</p>}
      <ul className='divide-y divide-border'>
        {data?.map((reserved) => (
          <li className='flex flex-col gap-2 p-4 sm:flex-row sm:items-center' key={reserved.code}>
            <div className='min-w-0 flex-1'>
              <p className='break-all font-mono'>{reserved.code}</p>
              {reserved.note && <p className='break-words text-muted-foreground text-sm'>{reserved.note}</p>}
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
      <p className='mt-1 text-muted-foreground text-sm'>
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

/** The university's logo: what every QR shows unless its Đơn vị or the Link itself chose otherwise. */
const UniversityLogoCard = () => {
  const { data, reload } = useLoaded(0, () => api.adminLogo());
  return (
    <LogoCard
      hasLogo={data?.set ?? false}
      loadPreview={api.adminLogoPreview}
      onRemove={async () => {
        await api.adminRemoveLogo();
        reload();
      }}
      onUpload={async (file) => {
        await api.adminUploadLogo(file);
        reload();
      }}
      removeLabel='Bỏ logo của Trường'
      stamp={String(data?.set)}
      title='Logo của Trường trên QR'
    >
      <p>
        {data?.set
          ? "Mọi QR dùng logo này, trừ khi đơn vị đặt logo riêng hoặc link chọn logo riêng hay không logo."
          : "Chưa có logo chung. QR của đơn vị chưa đặt logo riêng sẽ không có logo."}
      </p>
    </LogoCard>
  );
};

/** Every Đơn vị, for the screens that offer a choice of them. */
const useUnits = () => useLoaded(0, () => api.adminUnits().then((answer) => answer.units));

/** The gate in front of every system-wide screen. The server refuses everyone else regardless. */
const SystemAdminOnly = () => {
  const { me } = useSession();
  return me?.isSystemAdmin ? <Outlet /> : <Navigate replace to='/' />;
};

/** Finds a Link of any Đơn vị, and creates one for any Đơn vị - with a Mã dành riêng if need be. */
const AdminLinksPage = () => {
  const { data: units, reload } = useUnits();
  return (
    <>
      <AdminLinkLookup onMoved={reload} units={units ?? []} />
      <HandOutCard onCreated={reload} units={units ?? []} />
    </>
  );
};

const AdminUnitsPage = () => {
  const { refresh } = useSession();
  const { data: units, error, reload } = useUnits();
  // A Đơn vị created or dissolved changes the administrator's own list of units too.
  const unitsChanged = () => {
    reload();
    refresh();
  };
  return <UnitsCard error={error} onChanged={unitsChanged} units={units} />;
};

const AdminExportPage = () => (
  <Card>
    <h2 className='font-semibold text-lg'>Xuất toàn bộ dữ liệu</h2>
    <p className='mt-1 mb-4 text-muted-foreground text-sm'>
      Một tệp chứa mọi tài khoản, đơn vị, link, lịch sử, lượt mở và logo, để chuyển sang một bản cài đặt khác. Tệp có
      chứa mật khẩu và khóa API ở dạng đã băm - hãy cất giữ như dữ liệu mật và không gửi qua kênh không an toàn.
    </p>
    <DownloadLink href='/api/admin/export'>Tải tệp xuất (JSON)</DownloadLink>
  </Card>
);

export {
  AdminExportPage,
  AdminLinksPage,
  AdminsCard as AdminAdminsPage,
  AdminUnitsPage,
  ReservedCodesCard as AdminCodesPage,
  SystemAdminOnly,
  UniversityLogoCard as AdminLogoPage
};
