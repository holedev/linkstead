import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  DatabaseBackupIcon,
  ImageIcon,
  KeyRoundIcon,
  Link2Icon,
  LogOutIcon,
  type LucideIcon,
  QrCodeIcon,
  SearchIcon,
  ShieldCheckIcon,
  TagIcon,
  UsersIcon
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar
} from "@/components/ui/sidebar";
import { useSession } from "@/session";

type NavItem = { to: string; label: string; icon: LucideIcon };

/** What a Thành viên works on. The last three are a Quản lý đơn vị's. */
const UNIT_NAV: NavItem[] = [{ icon: Link2Icon, label: "Link", to: "/" }];
const MANAGER_NAV: NavItem[] = [
  { icon: UsersIcon, label: "Thành viên", to: "/members" },
  { icon: KeyRoundIcon, label: "Khóa API", to: "/keys" },
  { icon: QrCodeIcon, label: "Logo QR", to: "/logo" }
];
/** What only a Quản trị hệ thống does, across every Đơn vị. */
const SYSTEM_NAV: NavItem[] = [
  { icon: SearchIcon, label: "Link của mọi đơn vị", to: "/admin/links" },
  { icon: Building2Icon, label: "Đơn vị", to: "/admin/units" },
  { icon: ShieldCheckIcon, label: "Quản trị hệ thống", to: "/admin/admins" },
  { icon: TagIcon, label: "Mã dành riêng", to: "/admin/codes" },
  { icon: ImageIcon, label: "Logo của Trường", to: "/admin/logo" },
  { icon: DatabaseBackupIcon, label: "Xuất dữ liệu", to: "/admin/export" }
];
const ALL_NAV = [...UNIT_NAV, ...MANAGER_NAV, ...SYSTEM_NAV];

const SPACES = /\s+/u;
const ROLE_LABEL = { manager: "Quản lý đơn vị", member: "Thành viên" };

/** Two letters to tell Đơn vị apart at a glance: the first letters of the first two words. */
const initialsOf = (name: string): string =>
  name
    .split(SPACES)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

const Initials = ({ name }: { name: string }) => (
  <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground text-xs'>
    {initialsOf(name)}
  </div>
);

/**
 * Which Đơn vị the screens are about. Everything under "Đơn vị" in the sidebar follows this
 * choice; an account in several Đơn vị switches here.
 */
const UnitSwitcher = () => {
  const { me, unit, selectUnit } = useSession();
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const onSystemScreen = useLocation().pathname.startsWith("/admin");
  const units = me?.units ?? [];

  if (!unit) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton className='cursor-default hover:bg-transparent active:bg-transparent' size='lg'>
            <Initials name='OU' />
            <div className='grid flex-1 text-left text-sm leading-tight'>
              <span className='truncate font-medium'>OU Link</span>
              <span className='truncate text-muted-foreground text-xs'>Chưa thuộc đơn vị nào</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              aria-label={`Đơn vị đang chọn: ${unit.unitName}. Đổi đơn vị`}
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
              size='lg'
            >
              <Initials name={unit.unitName} />
              <div className='grid flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-medium'>{unit.unitName}</span>
                <span className='truncate text-muted-foreground text-xs'>{ROLE_LABEL[unit.role]}</span>
              </div>
              <ChevronsUpDownIcon className='ml-auto' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='start'
            className='w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-lg'
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className='text-muted-foreground text-xs'>Đơn vị của bạn</DropdownMenuLabel>
            {units.map((option) => (
              <DropdownMenuItem
                className='gap-2 p-2'
                key={option.unitId}
                onSelect={() => {
                  selectUnit(option.unitId);
                  // Choosing a Đơn vị from a system-wide screen means "take me to it".
                  if (onSystemScreen) {
                    navigate("/");
                  }
                }}
              >
                <div className='flex size-6 items-center justify-center rounded-md border font-medium text-[0.625rem]'>
                  {initialsOf(option.unitName)}
                </div>
                <div className='grid min-w-0 flex-1 leading-tight'>
                  <span className='truncate'>{option.unitName}</span>
                  <span className='truncate text-muted-foreground text-xs'>{ROLE_LABEL[option.role]}</span>
                </div>
                {option.unitId === unit.unitId && <CheckIcon className='ml-auto' />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

const NavGroup = ({ label, items }: { label: string; items: NavItem[] }) => {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton
              asChild
              className='h-10 md:h-8'
              isActive={item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)}
              tooltip={item.label}
            >
              {/* On a phone the sidebar is a drawer over the page: following a link puts it away. */}
              <NavLink end={item.to === "/"} onClick={() => setOpenMobile(false)} to={item.to}>
                <item.icon />
                <span>{item.label}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
};

/** Who is signed in, and the way out. */
const AccountMenu = () => {
  const { me, signOut } = useSession();
  const { isMobile } = useSidebar();
  const email = me?.email ?? "";
  const name = email.split("@")[0] ?? "";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              aria-label={`Tài khoản ${email}`}
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
              size='lg'
            >
              <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-accent font-medium text-xs uppercase'>
                {name.slice(0, 2)}
              </div>
              <div className='grid flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-medium'>{name}</span>
                <span className='truncate text-muted-foreground text-xs'>
                  {me?.isSystemAdmin ? "Quản trị hệ thống" : email}
                </span>
              </div>
              <ChevronsUpDownIcon className='ml-auto' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            className='w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-lg'
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className='font-normal'>
              <span className='block truncate font-medium'>{email}</span>
              {me?.isSystemAdmin && <span className='block text-muted-foreground text-xs'>Quản trị hệ thống</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOutIcon />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

const AppSidebar = () => {
  const { me, unit } = useSession();
  const unitNav = unit?.role === "manager" || me?.isSystemAdmin ? [...UNIT_NAV, ...MANAGER_NAV] : UNIT_NAV;

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <UnitSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {unit && <NavGroup items={unitNav} label='Đơn vị' />}
        {me?.isSystemAdmin && <NavGroup items={SYSTEM_NAV} label='Toàn hệ thống' />}
      </SidebarContent>
      <SidebarFooter>
        <AccountMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

/** The name of the screen at a path, for the header. */
const screenName = (pathname: string): string =>
  ALL_NAV.find((item) => (item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)))?.label ?? "";

export { AppSidebar, screenName };
