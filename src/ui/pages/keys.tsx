import { BookOpenIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorText,
  Field,
  formatDate,
  SecretBox,
  TableCardTitle
} from "@/components/app";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";

const t = text().keys;

const KeysPage = () => {
  const { unit } = useSession();
  const unitId = unit?.unitId ?? 0;
  const { data, error, reload } = useLoaded(unitId, (id) => api.keys(id).then((answer) => answer.keys));
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ name: string; key: string } | null>(null);
  // The id, never the row: the row is read from the live list each render, so the dialog cannot
  // show a key as it was before the list reloaded.
  const [revokeId, setRevokeId] = useState<number | null>(null);
  const revoking = data?.find((key) => key.id === revokeId) ?? null;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      setIssued(await api.createKey(unitId, name));
      setName("");
      reload();
    } catch (failure) {
      setFormError(messageOf(failure));
    }
    setBusy(false);
  };

  const revoke = async () => {
    const id = revokeId;
    setRevokeId(null);
    if (id === null) {
      return;
    }
    setBusy(true);
    try {
      await api.revokeKey(unitId, id);
      reload();
    } catch (failure) {
      setFormError(messageOf(failure));
    }
    setBusy(false);
  };

  return (
    <>
      <Card>
        <h2 className='font-semibold text-lg'>{t.issueFor(unit?.unitName ?? "")}</h2>
        <div className='mt-1 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
          <p className='text-muted-foreground text-sm'>{t.lead}</p>
          <a
            className='inline-flex shrink-0 items-center gap-1 font-medium text-primary text-sm underline-offset-4 hover:underline'
            href='/app/api-docs'
            rel='noreferrer'
            target='_blank'
          >
            <BookOpenIcon className='size-4' />
            {t.docs}
          </a>
        </div>
        <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end' onSubmit={create}>
          <Field label={t.name}>
            {(props) => (
              <input
                {...props}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder={t.namePlaceholder}
                required
                value={name}
              />
            )}
          </Field>
          <Button disabled={busy} type='submit' variant='primary'>
            {t.issue}
          </Button>
        </form>
        <div className='mt-4'>
          <ErrorText>{formError}</ErrorText>
        </div>
        {issued && (
          <div className='mt-4 space-y-2 rounded-md border border-ok/30 bg-ok/5 p-3'>
            <p className='text-sm'>{t.onlyOnce(issued.name)}</p>
            <SecretBox value={issued.key} />
            <p className='text-sm'>
              {t.docsWith} <span className='break-all font-mono'>{window.location.origin}/app/api-docs</span>
            </p>
          </div>
        )}
      </Card>

      <Card flush>
        <TableCardTitle count={data?.length} title={t.title} />
        {error && (
          <div className='p-4'>
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {!(data || error) && <p className='p-4 text-muted-foreground'>{text().common.loading}</p>}
        {data?.length === 0 && <p className='p-4 text-muted-foreground'>{t.none}</p>}
        {data && data.length > 0 && (
          <Table>
            <TableHeader className='hidden bg-muted/40 md:table-header-group'>
              <TableRow className='hover:bg-transparent'>
                <TableHead className='pl-5'>{t.name}</TableHead>
                <TableHead>{t.issued}</TableHead>
                <TableHead>{t.state}</TableHead>
                <TableHead className='w-32'>
                  <span className='sr-only'>{text().linkRow.actions}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((key) => (
                <TableRow className={key.revokedAt ? "text-muted-foreground" : undefined} key={key.id}>
                  <TableCell className='whitespace-normal py-3 pl-5'>
                    <p className='break-words font-medium'>{key.name}</p>
                    <p className='text-muted-foreground text-xs md:hidden'>
                      {t.issuedOn(formatDate(key.createdAt))}
                      {key.revokedAt && t.revokedSuffix(formatDate(key.revokedAt))}
                    </p>
                  </TableCell>
                  <TableCell className='hidden tabular-nums md:table-cell'>{formatDate(key.createdAt)}</TableCell>
                  <TableCell className='hidden md:table-cell'>
                    {key.revokedAt ? (
                      <Badge tone='muted'>{t.revokedOn(formatDate(key.revokedAt))}</Badge>
                    ) : (
                      <Badge tone='ok'>{t.active}</Badge>
                    )}
                  </TableCell>
                  <TableCell className='w-32 pr-4 text-right'>
                    {key.revokedAt ? (
                      <span className='text-xs md:hidden'>{t.revoked}</span>
                    ) : (
                      <Button
                        className='text-destructive hover:text-destructive'
                        disabled={busy}
                        onClick={() => setRevokeId(key.id)}
                      >
                        {t.revoke}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        busy={busy}
        confirmLabel={t.revokeKey}
        onCancel={() => setRevokeId(null)}
        onConfirm={revoke}
        open={revoking !== null}
        title={t.revokeTitle}
      >
        {t.revokeBody(revoking?.name ?? "")}
      </ConfirmDialog>
    </>
  );
};

export { KeysPage };
