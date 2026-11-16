import { NavLink, Outlet } from "react-router";
import { Button } from "./components";
import { useSession } from "./session";

const TAB = "inline-flex min-h-11 items-center border-b-2 px-3 font-medium text-sm";
const tabClass = ({ isActive }: { isActive: boolean }) =>
  `${TAB} ${isActive ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`;

/** The frame every signed-in screen sits in: which Đơn vị, which section, who, and the way out. */
const Layout = () => {
  const { me, unit, selectUnit, signOut } = useSession();
  const units = me?.units ?? [];
  // Members and keys are a Quản lý đơn vị's to manage; the server refuses anyone else regardless.
  const manages = unit?.role === "manager" || (me?.isSystemAdmin ?? false);

  return (
    <div className='min-h-dvh'>
      <p className='bg-amber-100 px-4 py-2 text-center text-amber-900 text-sm'>
        Bản thử nghiệm trên tên miền tạm. <strong>Chưa in QR hay tài liệu nào từ các link này</strong> - chúng sẽ ngừng
        hoạt động khi đổi sang tên miền chính thức.
      </p>

      <header className='border-line border-b bg-surface'>
        <div className='mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3'>
          <span className='font-semibold text-brand text-lg'>OU Link</span>

          {units.length > 0 && (
            <label className='flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none'>
              <span className='text-muted'>Đơn vị</span>
              <select
                className='min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 sm:w-56 sm:flex-none'
                onChange={(event) => selectUnit(Number(event.target.value))}
                value={unit?.unitId ?? ""}
              >
                {units.map((option) => (
                  <option key={option.unitId} value={option.unitId}>
                    {option.unitName}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className='flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto'>
            <span className='min-w-0 truncate text-muted text-sm'>{me?.email}</span>
            <Button onClick={signOut}>Đăng xuất</Button>
          </div>
        </div>

        <nav aria-label='Mục' className='mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4'>
          <NavLink className={tabClass} end to='/'>
            Link
          </NavLink>
          {manages && (
            <>
              <NavLink className={tabClass} to='/members'>
                Thành viên
              </NavLink>
              <NavLink className={tabClass} to='/keys'>
                Khóa API
              </NavLink>
            </>
          )}
        </nav>
      </header>

      <main className='mx-auto max-w-5xl space-y-4 px-4 py-6'>
        {unit ? (
          <Outlet />
        ) : (
          <p className='rounded-lg border border-line bg-surface p-5 text-muted'>
            Tài khoản của bạn chưa thuộc đơn vị nào nên chưa tạo được link. Hãy nhờ Quản lý đơn vị thêm bạn vào.
          </p>
        )}
      </main>
    </div>
  );
};

export { Layout };
