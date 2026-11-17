import { type FormEvent, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, ErrorText, Field, formatDate } from "@/components/app";
import { api, type FoundLink, type UnitOverview } from "../api";
import { messageOf } from "../messages";
import { HistoryList } from "./link-forms";

const number = new Intl.NumberFormat("vi-VN");
const TRAILING_SLASHES = /\/+$/;

/**
 * Finds a Link of any Đơn vị by its Mã link, to switch it off or on or to give it to another Đơn
 * vị. Its Đích stays its Đơn vị's to change.
 */
const AdminLinkLookup = ({ units, onMoved }: { units: UnitOverview[]; onMoved: () => void }) => {
  const [code, setCode] = useState("");
  const [link, setLink] = useState<FoundLink | null>(null);
  const [toUnit, setToUnit] = useState("");
  const [confirming, setConfirming] = useState<"disable" | "move" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const others = units.filter((unit) => unit.id !== link?.unitId);
  const destination = others.find((unit) => String(unit.id) === toUnit) ?? null;

  /** Runs a step, then reads the Link again so the history on screen includes what was just done. */
  const run = async (work: (found: string) => Promise<unknown>, found: string) => {
    setConfirming(null);
    setBusy(true);
    setError("");
    try {
      await work(found);
      setLink(await api.adminFindLink(found));
    } catch (failure) {
      setError(messageOf(failure));
    }
    setBusy(false);
  };

  const find = (event: FormEvent) => {
    event.preventDefault();
    setLink(null);
    setToUnit("");
    // Accepts the whole address as printed, or only its last part.
    run(() => Promise.resolve(), code.trim().replace(TRAILING_SLASHES, "").split("/").at(-1) ?? "");
  };

  const move = () => {
    if (link && destination) {
      run(async (found) => {
        await api.adminMoveLink(found, destination.id);
        setToUnit("");
        onMoved();
      }, link.code);
    }
  };

  return (
    <Card>
      <h2 className='font-semibold text-lg'>Tra cứu link</h2>
      <p className='mt-1 text-muted-foreground text-sm'>
        Tìm link của bất kỳ đơn vị nào theo mã link, để tắt, bật hoặc chuyển sang đơn vị khác.
      </p>
      <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end' onSubmit={find}>
        <Field label='Mã link hoặc địa chỉ link'>
          {(props) => (
            <input
              {...props}
              autoCapitalize='none'
              onChange={(event) => setCode(event.target.value)}
              placeholder='hoi-thao-2027'
              required
              spellCheck={false}
              value={code}
            />
          )}
        </Field>
        <Button disabled={busy} type='submit' variant='primary'>
          Tìm
        </Button>
      </form>
      <div className='mt-4'>
        <ErrorText>{error}</ErrorText>
      </div>

      {link && (
        <div className='mt-4 space-y-3 rounded-md border border-border p-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='min-w-0 flex-1 break-words font-medium'>{link.name}</h3>
            {link.deletedAt && <Badge tone='danger'>Đã xóa</Badge>}
            {!link.deletedAt && link.enabled && <Badge tone='ok'>Đang bật</Badge>}
            {!(link.deletedAt || link.enabled) && (
              <Badge tone={link.disabledBySystem ? "danger" : "muted"}>
                {link.disabledBySystem ? "Quản trị hệ thống đã tắt" : "Đơn vị đã tắt"}
              </Badge>
            )}
          </div>
          <dl className='space-y-1 text-sm'>
            <div>
              <dt className='inline text-muted-foreground'>Đơn vị: </dt>
              <dd className='inline font-medium'>{link.unitName}</dd>
            </div>
            <div>
              <dt className='inline text-muted-foreground'>Link: </dt>
              <dd className='inline break-all font-mono text-primary'>{link.url}</dd>
            </div>
            <div>
              <dt className='inline text-muted-foreground'>Đích: </dt>
              <dd className='inline break-all'>
                <a className='underline' href={link.target} rel='noreferrer' target='_blank'>
                  {link.target}
                </a>
              </dd>
            </div>
          </dl>
          <p className='text-muted-foreground text-xs'>
            Tạo ngày {formatDate(link.createdAt)} - khoảng {number.format(link.visits)} lượt mở
          </p>

          {link.deletedAt && (
            <p className='text-sm'>
              Link đã bị xóa ngày {formatDate(link.deletedAt)}: không mở được, không hiện ở đâu, và mã của nó không bao
              giờ được cấp lại. Ai xóa có trong lịch sử bên dưới.
            </p>
          )}

          <div className={link.deletedAt ? "hidden" : "flex flex-wrap gap-2"}>
            {link.enabled || !link.disabledBySystem ? (
              <Button disabled={busy} onClick={() => setConfirming("disable")} variant='danger'>
                {link.enabled ? "Tắt link" : "Giữ link ở trạng thái tắt"}
              </Button>
            ) : null}
            {!link.enabled && (
              <Button disabled={busy} onClick={() => run(api.enableLink, link.code)}>
                Bật lại link
              </Button>
            )}
          </div>

          {others.length > 0 && !link.deletedAt && (
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end'>
              <Field hint='Địa chỉ, đích và lượt mở của link giữ nguyên.' label='Chuyển sang đơn vị'>
                {(props) => (
                  <select {...props} onChange={(event) => setToUnit(event.target.value)} value={toUnit}>
                    <option value=''>Chọn đơn vị nhận</option>
                    {others.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Button disabled={busy || !destination} onClick={() => setConfirming("move")}>
                Chuyển link
              </Button>
            </div>
          )}

          <div className='rounded-md border border-border bg-muted/50 p-3'>
            <h4 className='font-medium text-sm'>Lịch sử thay đổi</h4>
            <HistoryList createdAt={link.createdAt} entries={link.history} />
          </div>
        </div>
      )}

      <ConfirmDialog
        busy={busy}
        confirmLabel='Tắt link'
        onCancel={() => setConfirming(null)}
        onConfirm={() => link && run(api.disableLink, link.code)}
        open={confirming === "disable"}
        title={`Tắt link "${link?.name}" của ${link?.unitName}`}
      >
        Người mở {link?.url} - kể cả từ QR đã in - sẽ thấy trang thông báo link đã bị tắt. Vì bạn tắt với tư cách Quản
        trị hệ thống, {link?.unitName} sẽ không tự bật lại được; chỉ Quản trị hệ thống bật lại được link này.
      </ConfirmDialog>

      <ConfirmDialog
        busy={busy}
        confirmLabel='Chuyển link'
        onCancel={() => setConfirming(null)}
        onConfirm={move}
        open={confirming === "move"}
        title={`Chuyển link "${link?.name}"`}
        tone='primary'
      >
        Chuyển link từ <strong>{link?.unitName}</strong> sang <strong>{destination?.name}</strong>? Thành viên của{" "}
        {link?.unitName} sẽ không còn thấy và sửa được link này; thành viên của {destination?.name} sẽ làm được. Địa chỉ
        link không đổi nên những gì đã in vẫn dùng được.
      </ConfirmDialog>
    </Card>
  );
};

export { AdminLinkLookup };
