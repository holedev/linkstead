import { KeyRoundIcon, UserCogIcon, UserMinusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorText,
  Field,
  RowMenu,
  SecretBox,
  TableCardTitle
} from "@/components/app";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type Role } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";
import { exampleEmail } from "../organization";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";

type Issued = { email: string; setupUrl: string | null };

const t = text().members;
const { nav } = text();

/** What to do with a one-time link, said where the link appears - the system sends no mail. */
const IssuedLink = ({ issued }: { issued: Issued }) =>
  issued.setupUrl ? (
    <div className='mt-4 space-y-2 rounded-md border border-ok/30 bg-ok/5 p-3'>
      <p className='text-sm'>{t.sendLink(issued.email)}</p>
      <SecretBox value={issued.setupUrl} />
    </div>
  ) : (
    <p className='mt-4 rounded-md border border-ok/30 bg-ok/5 p-3 text-sm'>{t.added(issued.email)}</p>
  );

/**
 * Who belongs to one Unit, and the changes a Unit Manager - or a System Administrator, for any
 * Unit - may make: add, change a role, remove, issue a one-time link. The server refuses whatever
 * would leave the Unit without a Unit Manager. `onChanged` hears about every change made.
 */
const UnitMembers = ({ unitId, unitName, onChanged }: { unitId: number; unitName: string; onChanged?: () => void }) => {
  const { me, refresh } = useSession();
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
      onChanged?.();
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
      onChanged?.();
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
        <h2 className='font-semibold text-lg'>{t.addTo(unitName)}</h2>
        <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end' onSubmit={add}>
          <Field label={t.email}>
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
          <Field label={t.role}>
            {(props) => (
              <select {...props} onChange={(event) => setRole(event.target.value as Role)} value={role}>
                <option value='member'>{nav.member}</option>
                <option value='manager'>{nav.manager}</option>
              </select>
            )}
          </Field>
          <Button disabled={busy} type='submit' variant='primary'>
            {t.add}
          </Button>
        </form>
        <div className='mt-4'>
          <ErrorText>{formError}</ErrorText>
        </div>
        {issued && <IssuedLink issued={issued} />}
      </Card>

      <Card flush>
        <TableCardTitle count={data?.length} title={t.title} />
        {error && (
          <div className='p-4'>
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {!(data || error) && <p className='p-4 text-muted-foreground'>{text().common.loading}</p>}
        {data && data.length > 0 && (
          <Table>
            <TableHeader className='hidden bg-muted/40 md:table-header-group'>
              <TableRow className='hover:bg-transparent'>
                <TableHead className='pl-5'>{t.email}</TableHead>
                <TableHead>{t.role}</TableHead>
                <TableHead>{t.password}</TableHead>
                <TableHead className='w-12'>
                  <span className='sr-only'>{text().linkRow.actions}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((member) => {
                const roleBadge = <Badge tone='muted'>{member.role === "manager" ? nav.manager : nav.member}</Badge>;
                const passwordBadge = (
                  <Badge tone={member.hasPassword ? "ok" : "danger"}>
                    {member.hasPassword ? t.passwordSet : t.passwordUnset}
                  </Badge>
                );
                return (
                  <TableRow key={member.email}>
                    <TableCell className='whitespace-normal py-3 pl-5'>
                      <p className='break-all font-medium'>
                        {member.email}
                        {member.email === me?.email && (
                          <span className='font-normal text-muted-foreground'>{t.you}</span>
                        )}
                      </p>
                      {/* On a phone the other columns are hidden: their gist is this line. */}
                      <div className='mt-1 flex flex-wrap gap-1 md:hidden'>
                        {roleBadge}
                        {passwordBadge}
                      </div>
                    </TableCell>
                    <TableCell className='hidden md:table-cell'>{roleBadge}</TableCell>
                    <TableCell className='hidden md:table-cell'>{passwordBadge}</TableCell>
                    <TableCell className='w-12 pr-3 text-right'>
                      <RowMenu disabled={busy} label={t.actionsFor(member.email)}>
                        <DropdownMenuItem onSelect={() => run(() => api.reissueSetup(unitId, member.email))}>
                          <KeyRoundIcon />
                          {t.issueLink}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            change(() =>
                              api.setMemberRole(unitId, member.email, member.role === "manager" ? "member" : "manager")
                            )
                          }
                        >
                          <UserCogIcon />
                          {member.role === "manager" ? t.makeMember : t.makeManager}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setRemoveEmail(member.email)} variant='destructive'>
                          <UserMinusIcon />
                          {t.remove}
                        </DropdownMenuItem>
                      </RowMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        busy={busy}
        confirmLabel={t.remove}
        onCancel={() => setRemoveEmail(null)}
        onConfirm={() => change(() => api.removeMember(unitId, removeEmail ?? ""))}
        open={removing !== null}
        title={t.removeTitle}
      >
        {t.removeBody(removing?.email === me?.email ? t.yourself : (removing?.email ?? ""), unitName)}
      </ConfirmDialog>
    </>
  );
};

/** The members of the Unit chosen in the sidebar. */
const MembersPage = () => {
  const { unit } = useSession();
  return unit ? <UnitMembers unitId={unit.unitId} unitName={unit.unitName} /> : null;
};

export { MembersPage, UnitMembers };
