import { type FormEvent, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, ErrorText, Field, formatDate, formatNumber } from "@/components/app";
import { api, type FoundLink, type UnitOverview } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";
import { HistoryList } from "./link-forms";

const t = text().adminLink;
const forms = text().linkForms;
const TRAILING_SLASHES = /\/+$/;

/** The names the dialogs show, which are drawn whether or not a Link has been found. */
const namesOf = (link: FoundLink | null, destination: UnitOverview | null) => ({
  name: link?.name ?? "",
  to: destination?.name ?? "",
  unit: link?.unitName ?? "",
  url: link?.url ?? ""
});

/**
 * Finds a Link of any Unit by its Link Code, to switch it off or on or to give it to another Unit.
 * Its Target stays its Unit's to change.
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
  const shown = namesOf(link, destination);

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
      <h2 className='font-semibold text-lg'>{t.title}</h2>
      <p className='mt-1 text-muted-foreground text-sm'>{t.lead}</p>
      <form className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end' onSubmit={find}>
        <Field label={t.codeOrAddress}>
          {(props) => (
            <input
              {...props}
              autoCapitalize='none'
              onChange={(event) => setCode(event.target.value)}
              placeholder='conference-2027'
              required
              spellCheck={false}
              value={code}
            />
          )}
        </Field>
        <Button disabled={busy} type='submit' variant='primary'>
          {t.find}
        </Button>
      </form>
      <div className='mt-4'>
        <ErrorText>{error}</ErrorText>
      </div>

      {link && (
        <div className='mt-4 space-y-3 rounded-md border border-border p-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='min-w-0 flex-1 break-words font-medium'>{link.name}</h3>
            {link.deletedAt && <Badge tone='danger'>{t.badgeDeleted}</Badge>}
            {!link.deletedAt && link.enabled && <Badge tone='ok'>{forms.badgeOn}</Badge>}
            {!(link.deletedAt || link.enabled) && (
              <Badge tone={link.disabledBySystem ? "danger" : "muted"}>
                {link.disabledBySystem ? forms.badgeOffBySystem : t.badgeOffByUnit}
              </Badge>
            )}
          </div>
          <dl className='space-y-1 text-sm'>
            <div>
              <dt className='inline text-muted-foreground'>{t.labelUnit}</dt>
              <dd className='inline font-medium'>{link.unitName}</dd>
            </div>
            <div>
              <dt className='inline text-muted-foreground'>{t.labelLink}</dt>
              <dd className='inline break-all font-mono text-primary'>{link.url}</dd>
            </div>
            <div>
              <dt className='inline text-muted-foreground'>{t.labelTarget}</dt>
              <dd className='inline break-all'>
                <a className='underline' href={link.target} rel='noreferrer' target='_blank'>
                  {link.target}
                </a>
              </dd>
            </div>
          </dl>
          <p className='text-muted-foreground text-xs'>
            {t.created(formatDate(link.createdAt), formatNumber(link.visits))}
          </p>

          {link.deletedAt && <p className='text-sm'>{t.deletedNotice(formatDate(link.deletedAt))}</p>}

          <div className={link.deletedAt ? "hidden" : "flex flex-wrap gap-2"}>
            {link.enabled || !link.disabledBySystem ? (
              <Button disabled={busy} onClick={() => setConfirming("disable")} variant='danger'>
                {link.enabled ? forms.disable : t.keepOff}
              </Button>
            ) : null}
            {!link.enabled && (
              <Button disabled={busy} onClick={() => run(api.enableLink, link.code)}>
                {text().linkRow.enable}
              </Button>
            )}
          </div>

          {others.length > 0 && !link.deletedAt && (
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end'>
              <Field hint={t.moveHint} label={t.moveTo}>
                {(props) => (
                  <select {...props} onChange={(event) => setToUnit(event.target.value)} value={toUnit}>
                    <option value=''>{t.pickUnit}</option>
                    {others.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Button disabled={busy || !destination} onClick={() => setConfirming("move")}>
                {t.move}
              </Button>
            </div>
          )}

          <div className='rounded-md border border-border bg-muted/50 p-3'>
            <h4 className='font-medium text-sm'>{t.history}</h4>
            <HistoryList createdAt={link.createdAt} entries={link.history} />
          </div>
        </div>
      )}

      <ConfirmDialog
        busy={busy}
        confirmLabel={forms.disable}
        onCancel={() => setConfirming(null)}
        onConfirm={() => link && run(api.disableLink, link.code)}
        open={confirming === "disable"}
        title={t.disableTitle(shown.name, shown.unit)}
      >
        {t.disableBody(shown.url, shown.unit)}
      </ConfirmDialog>

      <ConfirmDialog
        busy={busy}
        confirmLabel={t.move}
        onCancel={() => setConfirming(null)}
        onConfirm={move}
        open={confirming === "move"}
        title={t.moveTitle(shown.name)}
        tone='primary'
      >
        {t.moveBody(shown.unit, shown.to)}
      </ConfirmDialog>
    </Card>
  );
};

export { AdminLinkLookup };
