import { CheckCircle2Icon, DownloadIcon, FileUpIcon, XCircleIcon } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { Button, ErrorText, Modal } from "@/components/app";
import { parseCsv, toCsv } from "../../domain/csv";
import { api, type Link, type LinkGroup } from "../api";
import { MAX_ROWS, type PlannedRow, planRows, TEMPLATE_HEADER, TEMPLATE_ROW } from "../lib/bulk";
import { downloadQrZip, type QrFormat } from "../lib/qr-zip";
import { messageOf } from "../messages";
import { save } from "../qr";

/**
 * Many Links from one CSV file: choose it, review every row, make the good ones one after another,
 * then take the QR of all that were made in one zip. Rows that fail stay listed with the reason, so
 * the file can be fixed and the rest tried again - the ones made already will say their code is taken.
 */

type Outcome = { row: PlannedRow; link: Link | null; error: string };

const PLAN_ERRORS = {
  "missing-columns": "Tệp cần có ít nhất hai cột Tên link và Đích ở dòng đầu tiên.",
  "no-rows": "Tệp không có dòng nào dưới dòng tiêu đề.",
  "too-many-rows": `Mỗi lần nhập tối đa ${MAX_ROWS} link. Hãy chia tệp ra.`
};

const downloadTemplate = () =>
  save(new Blob([toCsv(TEMPLATE_HEADER, [TEMPLATE_ROW])], { type: "text/csv" }), "ou-link-mau-nhap.csv");

/** The Nhóm each row names, made first when the Đơn vị does not have it yet. */
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
      <p>
        Dòng đầu tiên của tệp là tên cột. Cần có <strong>Tên link</strong> và <strong>Đích</strong>; có thể thêm{" "}
        <strong>Mã link</strong> (bỏ trống để hệ thống tự sinh), <strong>Nhóm</strong> (nhóm chưa có sẽ được tạo) và{" "}
        <strong>Ghi chú</strong>. Cột khác được bỏ qua, nên tệp "Danh sách link" tải về từ đây cũng dùng được.
      </p>
      <p className='text-muted-foreground'>
        Lưu từ Excel hoặc Google Sheets dưới dạng CSV (UTF-8). Dấu phẩy hay chấm phẩy đều được. Tối đa {MAX_ROWS} link
        mỗi lần.
      </p>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <label className='inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-primary/90 md:h-9'>
          <FileUpIcon className='size-4' />
          Chọn tệp CSV
          <input accept='.csv,text/csv' className='sr-only' onChange={choose} type='file' />
        </label>
        <Button onClick={downloadTemplate}>
          <DownloadIcon />
          Tải tệp mẫu
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
          <th className='px-2 py-1.5 font-medium'>Dòng</th>
          <th className='px-2 py-1.5 font-medium'>Tên link</th>
          <th className='px-2 py-1.5 font-medium'>Mã / kết quả</th>
        </tr>
      </thead>
      <tbody className='divide-y'>
        {rows.map(({ row, note, ok }) => (
          <tr className='align-top' key={row.line}>
            <td className='px-2 py-1.5 text-muted-foreground tabular-nums'>{row.line}</td>
            <td className='px-2 py-1.5'>
              <p className='break-words'>{row.name || <span className='text-muted-foreground'>(trống)</span>}</p>
              <p className='break-all text-muted-foreground text-xs'>{row.target}</p>
              {row.group && <p className='text-muted-foreground text-xs'>Nhóm: {row.group}</p>}
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
      await downloadQrZip(codes, format, `ou-link-qr-${format}.zip`, setDone);
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
          QR dạng SVG (.zip)
        </Button>
        <Button disabled={done !== null} onClick={() => run("png")}>
          <DownloadIcon />
          QR dạng PNG (.zip)
        </Button>
      </div>
      {done !== null && (
        <p className='text-muted-foreground text-xs'>
          Đang chuẩn bị {done}/{codes.length} mã QR...
        </p>
      )}
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
  /** Links made, as they are made; and once at the end so the Nhóm are read again. */
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

  const read = (text: string) => {
    const plan = planRows(parseCsv(text), window.location.hostname);
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
      description={`Các link mới thuộc về ${unitName}.`}
      onClose={progress === null ? close : () => undefined}
      open={open}
      title='Tạo nhiều link từ CSV'
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
            <strong>{good.length}</strong> trong {rows.length} dòng tạo được.
            {good.length < rows.length && " Các dòng có lỗi sẽ được bỏ qua - sửa tệp rồi nhập lại nếu cần."}
          </p>
          <RowTable
            rows={rows.map((row) => ({
              note: row.problem ? messageOf(row.problem) : row.code || "tự sinh mã",
              ok: !row.problem,
              row
            }))}
          />
          <ErrorText>{fileError}</ErrorText>
          {progress !== null && (
            <p className='text-muted-foreground'>
              Đang tạo {progress}/{good.length} link...
            </p>
          )}
          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
            <Button disabled={progress !== null} onClick={reset}>
              Chọn tệp khác
            </Button>
            <Button disabled={progress !== null || good.length === 0} onClick={create} variant='primary'>
              {progress === null ? `Tạo ${good.length} link` : "Đang tạo..."}
            </Button>
          </div>
        </div>
      )}

      {outcomes && (
        <div className='space-y-4 text-sm'>
          <p>
            Đã tạo <strong>{created.length}</strong> link
            {created.length < outcomes.length && `, ${outcomes.length - created.length} dòng không tạo được`}.
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
              Xong
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export { BulkCreateDialog, ZipButtons };
