import {
  Building2Icon,
  DatabaseBackupIcon,
  ImageIcon,
  LandmarkIcon,
  LanguagesIcon,
  type LucideIcon,
  SearchIcon,
  ShieldCheckIcon,
  TagIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { text } from "../i18n";
import { useSession } from "../session";
import {
  AdminAdminsPage,
  AdminCodesPage,
  AdminExportPage,
  AdminLinksPage,
  AdminLogoPage,
  AdminUnitPage,
  AdminUnitsPage
} from "./admin";
import { AdminSettingsPage, LanguageForm } from "./settings";
import { isSetupSection, SETUP_PARAM, type SetupSection, UNIT_PARAM } from "./setup-address";

/**
 * Opens and closes the System Administration dialog. Its state is in the address, so a reload,
 * the Back button and a link passed to another administrator all land on the same section.
 */
const useSystemSetup = () => {
  const [params, setParams] = useSearchParams();
  const value = params.get(SETUP_PARAM);
  const unitId = Number(params.get(UNIT_PARAM));
  const show = (section: SetupSection | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete(UNIT_PARAM);
      if (section) {
        next.set(SETUP_PARAM, section);
      } else {
        next.delete(SETUP_PARAM);
      }
      return next;
    });
  return {
    open: show,
    section: isSetupSection(value) ? value : null,
    unitId: Number.isInteger(unitId) && unitId > 0 ? unitId : null
  };
};

type Section = { value: SetupSection; label: string; lead: string; icon: LucideIcon; content: ReactNode };

/** The sections, in groups: who the Organization is; its Units and Links; who may do what. */
const sectionsOf = (unitId: number | null): Section[][] => {
  const t = text().nav;
  return [
    [
      {
        content: <AdminSettingsPage />,
        icon: LandmarkIcon,
        label: t.organization,
        lead: t.organizationLead,
        value: "organization"
      },
      { content: <LanguageForm />, icon: LanguagesIcon, label: t.language, lead: t.languageLead, value: "language" },
      {
        content: <AdminLogoPage />,
        icon: ImageIcon,
        label: t.organizationQrLogo,
        lead: t.organizationQrLogoLead,
        value: "qr-logo"
      }
    ],
    [
      {
        // One Unit's own page, or the list of them.
        content: unitId ? <AdminUnitPage key={unitId} unitId={unitId} /> : <AdminUnitsPage />,
        icon: Building2Icon,
        label: t.units,
        lead: t.unitsLead,
        value: "units"
      },
      { content: <AdminLinksPage />, icon: SearchIcon, label: t.allLinks, lead: t.allLinksLead, value: "links" }
    ],
    [
      { content: <AdminAdminsPage />, icon: ShieldCheckIcon, label: t.admins, lead: t.adminsLead, value: "admins" },
      { content: <AdminCodesPage />, icon: TagIcon, label: t.codes, lead: t.codesLead, value: "codes" },
      {
        content: <AdminExportPage />,
        icon: DatabaseBackupIcon,
        label: t.export,
        lead: t.exportLead,
        value: "export"
      }
    ]
  ];
};

/**
 * Everything a System Administrator does for the whole Organization, out of the sidebar: its
 * settings and logos, its Units, any Link, the other administrators, the Reserved Codes, the
 * export. A dialog over whichever screen is open, reached from the account menu - the sections
 * down the left, the one chosen on the right.
 */
const SystemSetupDialog = () => {
  const { me } = useSession();
  const { section, unitId, open } = useSystemSetup();
  const t = text().nav;
  if (!me?.isSystemAdmin) {
    return null;
  }
  const groups = sectionsOf(unitId);
  const current = groups.flat().find((item) => item.value === section);

  return (
    <Dialog onOpenChange={(next) => !next && open(null)} open={current !== undefined}>
      <DialogContent className='flex h-[min(calc(100dvh-2rem),52rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl'>
        <DialogHeader className='border-b px-5 py-4 text-left'>
          <DialogTitle>{t.systemAdministration}</DialogTitle>
          <DialogDescription className='sr-only'>{t.systemAdministrationLead}</DialogDescription>
        </DialogHeader>
        <div className='flex min-h-0 flex-1 flex-col md:flex-row'>
          <nav
            aria-label={t.systemAdministration}
            className='flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-60 md:flex-col md:gap-0 md:overflow-y-auto md:border-r md:border-b-0 md:p-3'
          >
            {groups.map((group, index) => (
              <ul
                className={cn(
                  "flex shrink-0 gap-1 md:flex-col",
                  index > 0 && "border-l pl-1 md:mt-2 md:border-t md:border-l-0 md:pt-2 md:pl-0"
                )}
                key={group[0]?.value}
              >
                {group.map((item) => (
                  <li key={item.value}>
                    <button
                      aria-current={item.value === section ? "page" : undefined}
                      className='flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-muted aria-[current=page]:font-semibold [&_svg]:size-4 [&_svg]:shrink-0'
                      onClick={() => open(item.value)}
                      type='button'
                    >
                      <item.icon />
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            ))}
          </nav>
          {current && (
            <div className='min-w-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-6'>
              <div>
                <h2 className='font-semibold text-xl tracking-tight'>{current.label}</h2>
                <p className='mt-1 text-muted-foreground text-sm'>{current.lead}</p>
              </div>
              {current.content}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { SystemSetupDialog, useSystemSetup };
