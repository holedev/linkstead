import { Outlet, useLocation } from "react-router";
import { PageHeader, TrialBadge } from "@/components/app";
import { AppSidebar, screenOf } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useSession } from "./session";

const OWN_TITLE = /^\/(links|admin\/units)\/[^/]+/u;

/**
 * The frame every signed-in screen sits in: the sidebar says which Đơn vị and which section, the
 * header where you are and that this is still the trial - in full where a QR is downloaded.
 */
const Layout = () => {
  const { unit } = useSession();
  const { pathname } = useLocation();
  // The system-wide screens are about every Đơn vị, so they show without one selected.
  const onSystemScreen = pathname.startsWith("/admin");
  const scope = onSystemScreen ? "Toàn hệ thống" : unit?.unitName;
  const screen = screenOf(pathname);
  // These draw their own title: it carries a Nhóm, a Link, a Đơn vị or the screen's own controls.
  const ownTitle = pathname === "/" || pathname === "/stats" || OWN_TITLE.test(pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className='min-w-0'>
        <header className='sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur'>
          <SidebarTrigger aria-label='Mở hoặc thu gọn thanh bên' className='-ml-1 size-9' />
          <Separator className='mr-2 data-[orientation=vertical]:h-4' orientation='vertical' />
          <nav aria-label='Vị trí' className='flex min-w-0 flex-1 items-center gap-2 text-sm'>
            {scope && <span className='hidden truncate text-muted-foreground sm:inline'>{scope}</span>}
            {scope && <span className='hidden text-muted-foreground sm:inline'>/</span>}
            <span className='truncate font-medium'>{screen?.label}</span>
          </nav>
          <TrialBadge />
        </header>

        {/* A div: the inset around it is already the page's one <main>. */}
        <div className='mx-auto w-full max-w-6xl flex-1 space-y-4 p-4 md:p-6'>
          {screen?.lead && !ownTitle && <PageHeader description={screen.lead} title={screen.label} />}
          {unit || onSystemScreen ? (
            <Outlet />
          ) : (
            <p className='rounded-xl border bg-card p-5 text-muted-foreground'>
              Tài khoản của bạn chưa thuộc đơn vị nào nên chưa tạo được link. Hãy nhờ Quản lý đơn vị thêm bạn vào.
            </p>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export { Layout };
