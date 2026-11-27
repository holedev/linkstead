import { Outlet, useLocation } from "react-router";
import { PageHeader } from "@/components/app";
import { AppSidebar, screenOf } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { text } from "@/i18n";
import { useSession } from "./session";

const OWN_TITLE = /^\/(links|admin\/units)\/[^/]+/u;

/**
 * The frame every signed-in screen sits in: the sidebar says which Unit and which section, the
 * header where you are.
 */
const Layout = () => {
  const { unit } = useSession();
  const { pathname } = useLocation();
  const t = text().layout;
  // The system-wide screens are about every Unit, so they show without one selected.
  const onSystemScreen = pathname.startsWith("/admin");
  const scope = onSystemScreen ? t.systemWide : unit?.unitName;
  const screen = screenOf(pathname);
  // These draw their own title: it carries a Group, a Link, a Unit or the screen's own controls.
  const ownTitle = pathname === "/" || pathname === "/stats" || OWN_TITLE.test(pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className='min-w-0'>
        <header className='sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur'>
          <SidebarTrigger aria-label={t.toggleSidebar} className='-ml-1 size-9' />
          <Separator className='mr-2 data-[orientation=vertical]:h-4' orientation='vertical' />
          <nav aria-label={t.breadcrumb} className='flex min-w-0 flex-1 items-center gap-2 text-sm'>
            {scope && <span className='hidden truncate text-muted-foreground sm:inline'>{scope}</span>}
            {scope && <span className='hidden text-muted-foreground sm:inline'>/</span>}
            <span className='truncate font-medium'>{screen?.label}</span>
          </nav>
        </header>

        {/* A div: the inset around it is already the page's one <main>. */}
        <div className='mx-auto w-full max-w-6xl flex-1 space-y-4 p-4 md:p-6'>
          {screen?.lead && !ownTitle && <PageHeader description={screen.lead} title={screen.label} />}
          {unit || onSystemScreen ? (
            <Outlet />
          ) : (
            <p className='rounded-xl border bg-card p-5 text-muted-foreground'>{t.noUnit}</p>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export { Layout };
