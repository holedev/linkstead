import { CheckCircle2Icon, DownloadIcon, FileUpIcon, XCircleIcon } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { Button, ErrorText, Modal } from "@/components/app";
import { parseCsv, toCsv } from "../../domain/csv";
import { api, type Link, type LinkGroup } from "../api";
import { text } from "../i18n";
import { MAX_ROWS, type PlannedRow, planRows, template } from "../lib/bulk";
import { downloadQrZip, type QrFormat } from "../lib/qr-zip";
import { messageOf } from "../messages";
import { save } from "../qr";

/**
 * Many Links from one CSV file: choose it, review every row, make the good ones one after another,
 * then take the QR of all that were made in one zip. Rows that fail stay listed with the reason, so
 * the file can be fixed and the rest tried again - the ones made already will say their code is taken.
 */

type Outcome = { row: PlannedRow; link: Link | null; error: string };

const t = text().bulk;

const PLAN_ERRORS = {
  "missing-columns": t.missingColumns,
  "no-rows": t.noRows,
  "too-many-rows": t.tooManyRows(MAX_ROWS)
};

const downloadTemplate = () => {
  const { header, row } = template();
  save(new Blob([toCsv(header, [row])], { type: "text/csv" }), t.templateFile);
};

/** The Group each row names, made first when the Unit does not have it yet. */
const groupIdsFor = async (unitId: number, groups: LinkGroup[], rows: PlannedRow[]) => {
  const ids = new Map(groups.map((group) => [group.name, group.id]));
  for (const name of new Set(rows.map((row) => row.group).filter(Boolean))) {
    if (!ids.has(name)) {
      ids.set(name, (await api.createGroup(unitId, name)).id);
    }
  }
  return ids;
};

const ChooseStep = ({ onRead }: { onRead: (text: string) => void }) => {
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onRead(await file.text());
    }
    event.target.value = "";
  };
  return (
    <div className='space-y-4 text-sm'>
      <p>{t.intro}</p>
      <p className='text-muted-foreground'>{t.formats(MAX_ROWS)}</p>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <label className='inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-primary/90 md:h-9'>
          <FileUpIcon className='size-4' />
          {t.chooseFile}
          <input accept='.csv,text/csv' className='sr-only' onChange={choose} type='file' />
        </label>
        <Button onClick={downloadTemplate}>
          <DownloadIcon />
          {t.template}
        </Button>
      </div>
    </div>
  );
};

const RowTable = ({ rows }: { rows: { row: PlannedRow; note: string; ok: boolean }[] }) => (
  <div className='max-h-80 overflow-auto rounded-lg border'>
    <table className='w-full text-left text-sm'>
      <thead className='sticky top-0 bg-muted text-muted-foreground text-xs'>
        <tr>
          <th className='px-2 py-1.5 font-medium'>{t.line}</th>
          <th className='px-2 py-1.5 font-medium'>{t.columnName}</th>
          <th className='px-2 py-1.5 font-medium'>{t.result}</th>
        </tr>
      </thead>
      <tbody className='divide-y'>
        {rows.map(({ row, note, ok }) => (
          <tr className='align-top' key={row.line}>
            <td className='px-2 py-1.5 text-muted-foreground tabular-nums'>{row.line}</td>
            <td className='px-2 py-1.5'>
              <p className='break-words'>{row.name || <span className='text-muted-foreground'>{t.empty}</span>}</p>
              <p className='break-all text-muted-foreground text-xs'>{row.target}</p>
              {row.group && <p className='text-muted-foreground text-xs'>{t.groupOf(row.group)}</p>}
            </td>
            <td className='px-2 py-1.5'>
              <span className={ok ? "flex items-start gap-1" : "flex items-start gap-1 text-destructive"}>
                {ok ? (
                  <CheckCircle2Icon aria-hidden='true' className='mt-0.5 size-3.5 shrink-0 text-ok' />
                ) : (
                  <XCircleIcon aria-hidden='true' className='mt-0.5 size-3.5 shrink-0' />
                )}
                <span className='break-all'>{note}</span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** The QR of every Link just made, as one zip, in either format. */
const ZipButtons = ({ codes }: { codes: string[] }) => {
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState("");
  const run = async (format: QrFormat) => {
    setError("");
    setDone(0);
    try {
      await downloadQrZip(codes, format, `linkstead-qr-${format}.zip`, setDone);
    } catch (failure) {
      setError(messageOf(failure));
    }
    setDone(null);
  };
  return (
    <div className='space-y-2'>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Button disabled={done !== null} onClick={() => run("svg")}>
          <DownloadIcon />
          {t.svgZip}
        </Button>
        <Button disabled={done !== null} onClick={() => run("png")}>
          <DownloadIcon />
          {t.pngZip}
        </Button>
      </div>
      {done !== null && <p className='text-muted-foreground text-xs'>{t.preparing(done, codes.length)}</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  );
};

const BulkCreateDialog = ({
  open,
  unitId,
  unitName,
  groups,
  onCreated,
  onClose
}: {
  open: boolean;
  unitId: number;
  unitName: string;
  groups: LinkGroup[];
  /** Links made, as they are made; and once at the end so the Groups are read again. */
  onCreated: (links: Link[]) => void;
  onClose: () => void;
}) => {
  const [rows, setRows] = useState<PlannedRow[] | null>(null);
  const [fileError, setFileError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const good = rows?.filter((row) => !row.problem) ?? [];

  const reset = () => {
    setRows(null);
    setFileError("");
    setProgress(null);
    setOutcomes(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const read = (content: string) => {
    const plan = planRows(parseCsv(content), window.location.hostname);
    if ("error" in plan) {
      setFileError(PLAN_ERRORS[plan.error]);
      return;
    }
    setFileError("");
    setRows(plan.rows);
  };

  const create = async () => {
    setProgress(0);
    const made: Outcome[] = [];
    let ids = new Map<string, number>();
    try {
      ids = await groupIdsFor(unitId, groups, good);
    } catch (failure) {
      setFileError(messageOf(failure));
      setProgress(null);
      return;
    }
    for (const row of good) {
      try {
        const link = await api.createLink({
          code: row.code,
          groupId: row.group ? (ids.get(row.group) ?? null) : null,
          name: row.name,
          note: row.note,
          target: row.target,
          unitId
        });
        made.push({ error: "", link, row });
        onCreated([link]);
      } catch (failure) {
        made.push({ error: messageOf(failure), link: null, row });
      }
      setProgress(made.length);
    }
    onCreated([]);
    setOutcomes(made);
    setProgress(null);
  };

  const created = outcomes?.filter((outcome) => outcome.link) ?? [];

  return (
    <Modal
      description={t.description(unitName)}
      onClose={progress === null ? close : () => undefined}
      open={open}
      title={t.title}
      wide
    >
      {!(rows || outcomes) && (
        <>
          <ChooseStep onRead={read} />
          <ErrorText>{fileError}</ErrorText>
        </>
      )}

      {rows && !outcomes && (
        <div className='space-y-4 text-sm'>
          <p>
            {t.readable(good.length, rows.length)}
            {good.length < rows.length && t.skipped}
          </p>
          <RowTable
            rows={rows.map((row) => ({
              note: row.problem ? messageOf(row.problem) : row.code || t.autoCode,
              ok: !row.problem,
              row
            }))}
          />
          <ErrorText>{fileError}</ErrorText>
          {progress !== null && <p className='text-muted-foreground'>{t.creatingProgress(progress, good.length)}</p>}
          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
            <Button disabled={progress !== null} onClick={reset}>
              {t.chooseAnother}
            </Button>
            <Button disabled={progress !== null || good.length === 0} onClick={create} variant='primary'>
              {progress === null ? t.create(good.length) : t.creating}
            </Button>
          </div>
        </div>
      )}

      {outcomes && (
        <div className='space-y-4 text-sm'>
          <p>
            {t.created(created.length)}
            {created.length < outcomes.length && t.failedRows(outcomes.length - created.length)}.
          </p>
          <RowTable
            rows={outcomes.map((outcome) => ({
              note: outcome.link ? outcome.link.url : outcome.error,
              ok: Boolean(outcome.link),
              row: outcome.row
            }))}
          />
          {created.length > 0 && <ZipButtons codes={created.map((outcome) => outcome.link?.code ?? "")} />}
          <div className='flex justify-end'>
            <Button onClick={close} variant='primary'>
              {t.done}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export { BulkCreateDialog, ZipButtons };
