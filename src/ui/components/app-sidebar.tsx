import {
  Building2Icon,
  ChartNoAxesColumnIcon,
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
  Settings2Icon,
  ShieldCheckIcon,
  TagIcon,
  UsersIcon
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { OrganizationMark } from "@/components/app";
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
import { text } from "@/i18n";
import { cn } from "@/lib/utils";
import { organization } from "@/organization";
import { useSession } from "@/session";

/** A section of the UI. `lead` is the line under its title, for the screens whose title the frame draws. */
type NavItem = { to: string; label: string; icon: LucideIcon; lead?: string };

const t = text().nav;

/** What a Member works on. The last three are a Unit Manager's. */
const UNIT_NAV: NavItem[] = [
  { icon: Link2Icon, label: t.links, to: "/" },
  { icon: ChartNoAxesColumnIcon, label: t.visits, to: "/stats" }
];
const MANAGER_NAV: NavItem[] = [
  { icon: UsersIcon, label: t.members, lead: t.membersLead, to: "/members" },
  { icon: KeyRoundIcon, label: t.keys, lead: t.keysLead, to: "/keys" },
  { icon: QrCodeIcon, label: t.logo, lead: t.logoLead, to: "/logo" }
];
/** What only a System Administrator does, across every Unit. */
const SYSTEM_NAV: NavItem[] = [
  { icon: SearchIcon, label: t.allLinks, lead: t.allLinksLead, to: "/admin/links" },
  { icon: Building2Icon, label: t.units, lead: t.unitsLead, to: "/admin/units" },
  { icon: ShieldCheckIcon, label: t.admins, lead: t.adminsLead, to: "/admin/admins" },
  { icon: TagIcon, label: t.codes, lead: t.codesLead, to: "/admin/codes" },
  { icon: Settings2Icon, label: t.settings, lead: t.settingsLead, to: "/admin/settings" },
  { icon: ImageIcon, label: t.organizationLogo, lead: t.organizationLogoLead, to: "/admin/logo" },
  { icon: DatabaseBackupIcon, label: t.export, lead: t.exportLead, to: "/admin/export" }
];
const ALL_NAV = [...UNIT_NAV, ...MANAGER_NAV, ...SYSTEM_NAV];

/** Whether a path is under a section. A Link's own page (`/links/:code`) is under "Link". */
const isAt = (to: string, pathname: string): boolean =>
  to === "/" ? pathname === "/" || pathname.startsWith("/links/") : pathname.startsWith(to);

const SPACES = /\s+/u;
const ROLE_LABEL = { manager: t.manager, member: t.member };

/** Two letters to tell Units apart at a glance: the first letters of the first two words. */
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
 * Which Unit the screens are about. Everything under "Unit" in the sidebar follows this choice;
 * an account in several Units switches here.
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
            <div className='grid flex-1 text-left text-sm leading-tight'>
              <span className='truncate font-medium'>{organization().name}</span>
              <span className='truncate text-sidebar-foreground/70 text-xs'>{t.noUnit}</span>
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
              aria-label={t.currentUnit(unit.unitName)}
              className='border border-sidebar-border bg-sidebar-accent/60 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent'
              size='lg'
            >
              <Initials name={unit.unitName} />
              <div className='grid flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-medium'>{unit.unitName}</span>
                <span className='truncate text-sidebar-foreground/70 text-xs'>{ROLE_LABEL[unit.role]}</span>
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
            <DropdownMenuLabel className='text-muted-foreground text-xs'>{t.yourUnits}</DropdownMenuLabel>
            {units.map((option) => (
              <DropdownMenuItem
                className='gap-2 p-2'
                key={option.unitId}
                onSelect={() => {
                  selectUnit(option.unitId);
                  // Choosing a Unit from a system-wide screen means "take me to it".
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

/** The screen being looked at is a white tab on the Organization's colour. */
const ACTIVE = cn(
  "h-10 md:h-8",
  "data-[active=true]:bg-sidebar-primary data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary-foreground"
);

/** The Organization's mark at the top of the sidebar. Folded to icons, only its logo or letter shows. */
const SidebarMark = () => (
  <NavLink
    aria-label={t.backToLinks(organization().name)}
    className='flex h-12 items-center overflow-hidden rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:px-0 [&_span.truncate]:group-data-[collapsible=icon]:hidden'
    to='/'
  >
    <OrganizationMark />
  </NavLink>
);

const NavGroup = ({ label, items }: { label: string; items: NavItem[] }) => {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton asChild className={ACTIVE} isActive={isAt(item.to, pathname)} tooltip={item.label}>
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
              aria-label={t.account(email)}
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
              size='lg'
            >
              <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-accent font-medium text-xs uppercase'>
                {name.slice(0, 2)}
              </div>
              <div className='grid flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-medium'>{name}</span>
                <span className='truncate text-sidebar-foreground/70 text-xs'>
                  {me?.isSystemAdmin ? t.systemAdmin : email}
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
              {me?.isSystemAdmin && <span className='block text-muted-foreground text-xs'>{t.systemAdmin}</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOutIcon />
              {t.signOut}
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
      <SidebarHeader className='gap-3'>
        <SidebarMark />
        <UnitSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {unit && <NavGroup items={unitNav} label={t.unitSection} />}
        {me?.isSystemAdmin && <NavGroup items={SYSTEM_NAV} label={t.systemSection} />}
      </SidebarContent>
      <SidebarFooter>
        <AccountMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

/** The section a path is in, for the header and the title. */
const screenOf = (pathname: string): NavItem | undefined => ALL_NAV.find((item) => isAt(item.to, pathname));

export { AppSidebar, screenOf };
