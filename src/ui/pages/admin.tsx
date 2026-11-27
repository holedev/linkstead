import { ArrowLeftIcon, ChevronRightIcon, MergeIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DownloadLink,
  ErrorText,
  Field,
  Modal,
  Notice,
  RowMenu,
  SecretBox
} from "@/components/app";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type Link, type UnitOverview } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";
import { exampleEmail } from "../organization";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";
import { AdminLinkLookup } from "./admin-link";
import { LogoCard } from "./logo-card";
import { UnitMembers } from "./members";
import { setupSearch } from "./setup-address";

const t = text().admin;
const { common } = text();

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

type MergeResult = Awaited<ReturnType<typeof api.adminMergeUnit>>;

type CreatedUnit = { name: string; managerEmail: string; setupUrl: string | null };

/** The form inside the rename dialog: drawn afresh each time it opens, with the name as it is. */
const RenameUnitForm = ({
  unit,
  onClose,
  onRenamed
}: {
  unit: { id: number; name: string };
  onClose: () => void;
  onRenamed: () => void;
}) => {
  const [name, setName] = useState(unit.name);
  const { busy, error, run } = useAction();
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const renamed = await run(async () => {
      await api.adminRenameUnit(unit.id, name);
    });
    if (renamed) {
      onRenamed();
      onClose();
    }
  };
  return (
    <form className='space-y-4' onSubmit={save}>
      <Field label={t.unit}>
        {(props) => (
          <input {...props} maxLength={100} onChange={(event) => setName(event.target.value)} required value={name} />
        )}
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onClose}>{common.cancel}</Button>
        <Button disabled={busy || name.trim() === unit.name} type='submit' variant='primary'>
          {busy ? common.saving : common.save}
        </Button>
      </div>
    </form>
  );
};

/** Renames a Unit. Nothing printed carries its name, so nothing outside changes. */
const RenameUnitDialog = ({
  unit,
  onClose,
  onRenamed
}: {
  unit: { id: number; name: string } | null;
  onClose: () => void;
  onRenamed: () => void;
}) => (
  <Modal description={t.renameLead} onClose={onClose} open={unit !== null} title={t.renameTitle(unit?.name ?? "")}>
    {unit && <RenameUnitForm onClose={onClose} onRenamed={onRenamed} unit={unit} />}
  </Modal>
);

/** Dissolving, offered always: a Unit that still owns Links says why it cannot be, and what to do. */
const DissolveItem = ({ unit, onDissolve }: { unit: UnitOverview; onDissolve: (unitId: number) => void }) => (
  <DropdownMenuItem disabled={unit.linkCount > 0} onSelect={() => onDissolve(unit.id)} variant='destructive'>
    <Trash2Icon />
    <span className='grid'>
      {t.dissolve}
      {unit.linkCount > 0 && (
        <span className='whitespace-normal text-muted-foreground text-xs'>{t.dissolveBlocked(unit.linkCount)}</span>
      )}
    </span>
  </DropdownMenuItem>
);

/**
 * Every Unit: its name (to its own screen), how many Links it owns, its managers, and merging or
 * dissolving it. Only one that owns no Link is offered dissolving; one that does is merged instead.
 */
const UnitsTable = ({
  units,
  busy,
  onRename,
  onMerge,
  onDissolve
}: {
  units: UnitOverview[];
  busy: boolean;
  onRename: (unitId: number) => void;
  onMerge: (unitId: number) => void;
  onDissolve: (unitId: number) => void;
}) => (
  <Table>
    <TableHeader className='hidden bg-muted/40 md:table-header-group'>
      <TableRow className='hover:bg-transparent'>
        <TableHead className='pl-5'>{t.unit}</TableHead>
        <TableHead className='text-right'>{t.links}</TableHead>
        <TableHead>{t.managers}</TableHead>
        <TableHead className='w-12'>
          <span className='sr-only'>{text().linkRow.actions}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {units.map((unit) => (
        <TableRow key={unit.id}>
          <TableCell className='whitespace-normal py-3 pl-5'>
            <RouterLink
              className='inline-flex items-center gap-1 break-words font-semibold underline-offset-4 hover:underline'
              to={{ search: setupSearch("units", unit.id) }}
            >
              {unit.name}
              <ChevronRightIcon aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
            </RouterLink>
            <p className='break-all text-muted-foreground text-xs md:hidden'>
              {t.linkCount(unit.linkCount, unit.managers.join(", "))}
            </p>
          </TableCell>
          <TableCell className='hidden text-right tabular-nums md:table-cell'>{unit.linkCount}</TableCell>
          <TableCell className='hidden whitespace-normal text-muted-foreground md:table-cell'>
            <span className='break-all'>{unit.managers.join(", ")}</span>
          </TableCell>
          <TableCell className='w-12 pr-3 text-right'>
            <RowMenu disabled={busy} label={t.actionsForUnit(unit.name)}>
              <DropdownMenuItem onSelect={() => onRename(unit.id)}>
                <PencilIcon />
                {t.rename}
              </DropdownMenuItem>
              {units.length > 1 && (
                <DropdownMenuItem onSelect={() => onMerge(unit.id)}>
                  <MergeIcon />
                  {t.merge}
                </DropdownMenuItem>
              )}
              {/* A Unit that still owns Links is merged, never dissolved. */}
              <DissolveItem onDissolve={onDissolve} unit={unit} />
            </RowMenu>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

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
  // Merging is two steps: choose the Unit to merge into, then confirm on its own dialog.
  const [mergeId, setMergeId] = useState<number | null>(null);
  const [mergeInto, setMergeInto] = useState("");
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [merged, setMerged] = useState<MergeResult | null>(null);
  const merging = units?.find((unit) => unit.id === mergeId) ?? null;
  const mergeTarget = units?.find((unit) => String(unit.id) === mergeInto) ?? null;
  const mergeTargets = units?.filter((unit) => unit.id !== mergeId) ?? [];
  // Named once for the dialogs, which are drawn whether or not one is open.
  const names = { dissolving: dissolving?.name ?? "", from: merging?.name ?? "", into: mergeTarget?.name ?? "" };
  const stopMerging = () => {
    setMergeId(null);
    setMergeInto("");
    setConfirmingMerge(false);
  };

  const merge = () => {
    const from = merging;
    const into = mergeTarget;
    stopMerging();
    if (from && into) {
      run(async () => {
        setMerged(await api.adminMergeUnit(from.id, into.id));
        onChanged();
      });
    }
  };

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
        <h2 className='font-semibold text-lg'>{t.createUnit}</h2>
        <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end' onSubmit={create}>
          <Field label={t.newUnitName}>
            {(props) => (
              <input
                {...props}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder={t.newUnitPlaceholder}
                required
                value={name}
              />
            )}
          </Field>
          <Field label={t.firstManager}>
            {(props) => (
              <input
                {...props}
                onChange={(event) => setManagerEmail(event.target.value)}
                placeholder={exampleEmail()}
                required
                type='email'
                value={managerEmail}
              />
            )}
          </Field>
          <Button disabled={busy} type='submit' variant='primary'>
            {t.createUnit}
          </Button>
        </form>
        <div className='mt-4'>
          <ErrorText>{actionError || error}</ErrorText>
        </div>
        {created && (
          <div className='mt-4 space-y-2 rounded-md border border-ok/30 bg-ok/5 p-3'>
            <p className='text-sm'>
              {t.unitCreated(created.name, created.managerEmail)} {created.setupUrl ? t.sendSetup : t.hasPassword}
            </p>
            {created.setupUrl && <SecretBox value={created.setupUrl} />}
          </div>
        )}
      </div>

      {merged && (
        <div className='border-border border-b p-4 sm:p-5'>
          <Notice>
            <p>
              {t.mergeDone(merged.from, merged.into.name, merged.moved.links, merged.moved.members, merged.moved.keys)}
            </p>
          </Notice>
        </div>
      )}
      {!(units || error) && <p className='p-4 text-muted-foreground'>{common.loading}</p>}
      {units && units.length > 0 && (
        <UnitsTable busy={busy} onDissolve={setDissolveId} onMerge={setMergeId} onRename={setRenameId} units={units} />
      )}

      <Modal
        description={t.mergeLead}
        onClose={stopMerging}
        open={merging !== null && !confirmingMerge}
        title={t.mergeTitle(names.from)}
      >
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            setConfirmingMerge(true);
          }}
        >
          <Field label={t.mergeInto}>
            {(props) => (
              <select {...props} onChange={(event) => setMergeInto(event.target.value)} required value={mergeInto}>
                <option value=''>{t.pickReceiving}</option>
                {mergeTargets.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
            <Button onClick={stopMerging}>{common.cancel}</Button>
            <Button disabled={!mergeTarget} type='submit' variant='primary'>
              {t.continue}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        busy={busy}
        confirmLabel={t.mergeConfirm}
        onCancel={() => setConfirmingMerge(false)}
        onConfirm={merge}
        open={confirmingMerge && merging !== null && mergeTarget !== null}
        title={t.mergeConfirmTitle(names.from, names.into)}
      >
        <ul className='list-disc space-y-1 pl-5'>
          <li>{t.mergeBodyLinks(merging?.linkCount ?? 0, names.into)}</li>
          <li>{t.mergeBodyMembers(names.from, names.into)}</li>
          <li>{t.mergeBodyKeys(names.from, names.into)}</li>
          <li>
            <strong>{t.mergeBodyName(names.from)}</strong>
          </li>
        </ul>
      </ConfirmDialog>

      <RenameUnitDialog onClose={() => setRenameId(null)} onRenamed={onChanged} unit={renaming} />

      <ConfirmDialog
        busy={busy}
        confirmLabel={t.dissolveUnit}
        onCancel={() => setDissolveId(null)}
        onConfirm={dissolve}
        open={dissolving !== null}
        title={t.dissolveTitle(names.dissolving)}
      >
        {t.dissolveBody(names.dissolving)}
      </ConfirmDialog>
    </Card>
  );
};

/** Who else holds the role. Anyone here can do everything on this screen, for every Unit. */
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
        <h2 className='font-semibold text-lg'>{t.admins}</h2>
        <p className='mt-1 text-muted-foreground text-sm'>{t.adminsLead}</p>
        <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end' onSubmit={grant}>
          <Field label={t.adminEmail}>
            {(props) => (
              <input
                {...props}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={exampleEmail()}
                required
                type='email'
                value={email}
              />
            )}
          </Field>
          <Button disabled={busy} type='submit' variant='primary'>
            {t.addAdmin}
          </Button>
        </form>
        <div className='mt-4'>
          <ErrorText>{actionError || error}</ErrorText>
        </div>
        {granted && (
          <div className='mt-4 space-y-2 rounded-md border border-ok/30 bg-ok/5 p-3'>
            <p className='text-sm'>
              {t.granted(granted.email)} {granted.setupUrl ? t.sendSetup : t.hasPassword}
            </p>
            {granted.setupUrl && <SecretBox value={granted.setupUrl} />}
          </div>
        )}
      </div>
      {!(data || error) && <p className='p-4 text-muted-foreground'>{common.loading}</p>}
      <ul className='divide-y divide-border'>
        {data?.map((admin) => (
          <li className='flex flex-col gap-2 p-4 sm:flex-row sm:items-center' key={admin.email}>
            <div className='min-w-0 flex-1'>
              <p className='break-all font-medium'>
                {admin.email}
                {admin.email === me?.email && <span className='font-normal text-muted-foreground'>{t.you}</span>}
              </p>
              {!admin.hasPassword && (
                <div className='mt-1'>
                  <Badge tone='danger'>{t.passwordUnset}</Badge>
                </div>
              )}
            </div>
            {data.length > 1 ? (
              <Button disabled={busy} onClick={() => setRevokeEmail(admin.email)} variant='danger'>
                {t.revokeRole}
              </Button>
            ) : (
              <p className='text-muted-foreground text-xs sm:max-w-48 sm:text-right'>{t.onlyAdmin}</p>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        busy={busy}
        confirmLabel={t.revokeRole}
        onCancel={() => setRevokeEmail(null)}
        onConfirm={revoke}
        open={revoking !== null}
        title={t.revokeTitle}
      >
        {isSelf ? t.revokeSelf : t.revokeOther(revoking?.email ?? "")} {t.revokeTrail}
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
        <h2 className='font-semibold text-lg'>{t.reservedTitle}</h2>
        <p className='mt-1 text-muted-foreground text-sm'>{t.reservedLead}</p>
        <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end' onSubmit={add}>
          <Field label={t.codeLabel}>
            {(props) => (
              <input
                {...props}
                autoCapitalize='none'
                maxLength={50}
                onChange={(event) => setCode(event.target.value)}
                placeholder={t.codePlaceholder}
                required
                spellCheck={false}
                value={code}
              />
            )}
          </Field>
          <Field label={t.reservedFor}>
            {(props) => (
              <input
                {...props}
                maxLength={200}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t.reservedForPlaceholder}
                value={note}
              />
            )}
          </Field>
          <Button disabled={busy} type='submit' variant='primary'>
            {t.reserve}
          </Button>
        </form>
        <div className='mt-4'>
          <ErrorText>{actionError || error}</ErrorText>
        </div>
      </div>
      {!(data || error) && <p className='p-4 text-muted-foreground'>{common.loading}</p>}
      {data?.length === 0 && <p className='p-4 text-muted-foreground'>{t.noReserved}</p>}
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
              {t.unreserve}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
};

const EMPTY = { code: "", name: "", target: "", unitId: "" };

/** Creates a Link for any Unit - the one way a Reserved Code is handed out. */
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
      <h2 className='font-semibold text-lg'>{t.handOut}</h2>
      <p className='mt-1 text-muted-foreground text-sm'>{t.handOutLead}</p>
      <form className='mt-4 space-y-4' onSubmit={submit}>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <Field label={t.receivingUnit}>
            {(props) => (
              <select {...props} onChange={set("unitId")} required value={form.unitId}>
                <option value=''>{t.pickUnit}</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t.linkCode}>
            {(props) => (
              <input
                {...props}
                autoCapitalize='none'
                maxLength={50}
                onChange={set("code")}
                placeholder={t.codePlaceholder}
                required
                spellCheck={false}
                value={form.code}
              />
            )}
          </Field>
        </div>
        <Field label={t.linkName}>
          {(props) => (
            <input
              {...props}
              maxLength={200}
              onChange={set("name")}
              placeholder={t.linkNamePlaceholder}
              required
              value={form.name}
            />
          )}
        </Field>
        <Field label={t.target}>
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
          {busy ? t.creating : t.create}
        </Button>
      </form>
      {created && (
        <div className='mt-4 space-y-2 rounded-md border border-ok/30 bg-ok/5 p-3'>
          <p className='font-medium text-ok text-sm'>{t.created(created.name)}</p>
          <SecretBox value={created.url} />
        </div>
      )}
    </Card>
  );
};

/**
 * The Organization's logo on QR: what every QR shows unless its Unit or the Link itself chose
 * otherwise. Until one is uploaded, QR carry no logo - nothing is built in.
 */
const OrganizationLogoCard = () => {
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
      removeLabel={t.removeLogo}
      stamp={String(data?.set)}
      title={t.organizationLogo}
    >
      <p>{data?.set ? t.organizationLogoSet : t.organizationLogoUnset}</p>
      <p>{t.organizationLogoApplies}</p>
    </LogoCard>
  );
};

/** Every Unit, for the screens that offer a choice of them. */
const useUnits = () => useLoaded(0, () => api.adminUnits().then((answer) => answer.units));

/** Finds a Link of any Unit, and creates one for any Unit - with a Reserved Code if need be. */
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
  // A Unit created or dissolved changes the administrator's own list of units too.
  const unitsChanged = () => {
    reload();
    refresh();
  };
  return <UnitsCard error={error} onChanged={unitsChanged} units={units} />;
};

/**
 * One Unit seen from the whole system: who manages it, how many Links it owns, and every one of
 * its members - to add, change the role of, or remove - whether or not the administrator belongs.
 */
const AdminUnitPage = ({ unitId }: { unitId: number }) => {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const { data: units, error, reload } = useUnits();
  const unit = units?.find((candidate) => candidate.id === unitId) ?? null;
  const { busy, error: actionError, run } = useAction();
  const [renaming, setRenaming] = useState(false);
  const [dissolving, setDissolving] = useState(false);
  // A Unit renamed or dissolved changes the administrator's own list of units too.
  const changed = () => {
    reload();
    refresh();
  };
  const dissolve = async () => {
    setDissolving(false);
    if (await run(() => api.adminDissolveUnit(unitId))) {
      refresh();
      navigate({ search: setupSearch("units") }, { replace: true });
    }
  };

  return (
    <>
      <RouterLink
        className='inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground'
        to={{ search: setupSearch("units") }}
      >
        <ArrowLeftIcon className='size-4' />
        {t.allUnits}
      </RouterLink>
      <ErrorText>{error}</ErrorText>
      {!(units || error) && <p className='text-muted-foreground'>{common.loading}</p>}
      {units && !unit && (
        <Card>
          <p className='text-muted-foreground'>{t.noUnit}</p>
        </Card>
      )}
      {unit && (
        <>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
            <div className='min-w-0'>
              <h1 className='break-words font-bold text-2xl tracking-tight'>{unit.name}</h1>
              <p className='break-all text-muted-foreground text-sm'>
                {t.linkCount(unit.linkCount, unit.managers.join(", "))}
              </p>
            </div>
            <div className='flex shrink-0 gap-2'>
              <Button disabled={busy} onClick={() => setRenaming(true)}>
                <PencilIcon />
                {t.rename}
              </Button>
              <Button disabled={busy || unit.linkCount > 0} onClick={() => setDissolving(true)} variant='danger'>
                <Trash2Icon />
                {t.dissolveUnit}
              </Button>
            </div>
          </div>
          {unit.linkCount > 0 && <p className='text-muted-foreground text-sm'>{t.dissolveBlocked(unit.linkCount)}</p>}
          <ErrorText>{actionError}</ErrorText>
          <RenameUnitDialog onClose={() => setRenaming(false)} onRenamed={changed} unit={renaming ? unit : null} />
          <ConfirmDialog
            busy={busy}
            confirmLabel={t.dissolveUnit}
            onCancel={() => setDissolving(false)}
            onConfirm={dissolve}
            open={dissolving}
            title={t.dissolveTitle(unit.name)}
          >
            {t.dissolveBody(unit.name)}
          </ConfirmDialog>
          {/* Keyed by the Unit, so moving from one to another starts afresh. */}
          <UnitMembers key={unit.id} onChanged={reload} unitId={unit.id} unitName={unit.name} />
        </>
      )}
    </>
  );
};

const AdminExportPage = () => (
  <Card>
    <h2 className='font-semibold text-lg'>{t.export}</h2>
    <p className='mt-1 mb-4 text-muted-foreground text-sm'>{t.exportLead}</p>
    <DownloadLink href='/api/admin/export'>{t.exportDownload}</DownloadLink>
  </Card>
);

export {
  AdminExportPage,
  AdminLinksPage,
  AdminsCard as AdminAdminsPage,
  AdminUnitPage,
  AdminUnitsPage,
  OrganizationLogoCard as AdminLogoPage,
  ReservedCodesCard as AdminCodesPage
};
