import { type FormEvent, useState } from "react";
import { Button, Card, ErrorText, Field } from "@/components/app";
import { contrastWithWhite, type Language, MIN_CONTRAST_WITH_WHITE } from "../../domain/organization";
import { api } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";
import { organization } from "../organization";
import { LogoUpload } from "../qr";

/** Each language in its own words, as someone looking for theirs would recognise it. */
const LANGUAGE_NAMES: Record<Language, string> = { en: "English", vi: "Tiếng Việt" };

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const LINE_BREAKS = /[\s,;]+/;

/** Every zone this browser knows, to pick from; typing any IANA name works too. */
const zones = (): string[] => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
};

/** A time zone, typed or picked from the browser's list. Takes the props a `Field` hands out. */
const TimeZoneInput = ({
  value,
  onChange,
  ...props
}: {
  id: string;
  "aria-describedby": string | undefined;
  className: string;
  value: string;
  onChange: (zone: string) => void;
}) => (
  <>
    <input
      {...props}
      list='time-zones'
      onChange={(event) => onChange(event.target.value)}
      required
      spellCheck={false}
      value={value}
    />
    <datalist id='time-zones'>
      {zones().map((zone) => (
        <option key={zone} value={zone} />
      ))}
    </datalist>
  </>
);

/**
 * What the installation knows of its Organization (ADR-0007), for a System Administrator to set:
 * the name, the email domains Accounts may have, the language, the time zone, the colour, and the
 * logo the UI shows. The page reloads after a save, since every screen was drawn with the old ones.
 */
const SettingsForm = () => {
  const t = text().settings;
  const current = organization();
  const [name, setName] = useState(current.name);
  const [domains, setDomains] = useState(current.emailDomains.join("\n"));
  const [language, setLanguage] = useState<Language>(current.language);
  const [timeZone, setTimeZone] = useState(current.timeZone);
  const [brandColor, setBrandColor] = useState(current.brandColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const colorReadable = HEX_COLOR.test(brandColor) && contrastWithWhite(brandColor) >= MIN_CONTRAST_WITH_WHITE;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.adminSaveSettings({
        brandColor,
        emailDomains: domains.split(LINE_BREAKS).filter(Boolean),
        language,
        name,
        timeZone
      });
      window.location.reload();
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  };

  return (
    <Card>
      <form className='space-y-5' onSubmit={save}>
        <p className='text-muted-foreground text-sm'>{t.lead}</p>
        <Field hint={t.nameHint} label={t.name}>
          {(props) => (
            <input {...props} maxLength={100} onChange={(event) => setName(event.target.value)} required value={name} />
          )}
        </Field>
        <Field hint={t.languageHint} label={t.language}>
          {(props) => (
            <select {...props} onChange={(event) => setLanguage(event.target.value as Language)} value={language}>
              {Object.entries(LANGUAGE_NAMES).map(([value, label]) => (
                <option key={value} lang={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field hint={t.emailDomainsHint} label={t.emailDomains}>
          {(props) => (
            <textarea
              {...props}
              autoCapitalize='none'
              onChange={(event) => setDomains(event.target.value)}
              placeholder='example.org'
              rows={3}
              spellCheck={false}
              value={domains}
            />
          )}
        </Field>
        <Field hint={t.timeZoneHint} label={t.timeZone}>
          {(props) => <TimeZoneInput {...props} onChange={setTimeZone} value={timeZone} />}
        </Field>
        {timeZone !== current.timeZone && (
          <p className='rounded-md bg-amber-50 px-3 py-2 text-amber-900 text-sm'>{t.timeZoneWarning}</p>
        )}
        <Field hint={t.brandColorHint} label={t.brandColor}>
          {(props) => (
            <div className='flex items-center gap-3'>
              <input
                aria-label={t.brandColor}
                className='h-11 w-14 shrink-0 cursor-pointer rounded-md border md:h-9'
                onChange={(event) => setBrandColor(event.target.value)}
                type='color'
                value={HEX_COLOR.test(brandColor) ? brandColor : "#000000"}
              />
              <input
                {...props}
                className={`${props.className} font-mono`}
                maxLength={7}
                onChange={(event) => setBrandColor(event.target.value.trim())}
                required
                spellCheck={false}
                value={brandColor}
              />
              <span
                className='flex h-9 shrink-0 items-center rounded-md px-3 font-semibold text-sm text-white'
                style={{ background: HEX_COLOR.test(brandColor) ? brandColor : undefined }}
              >
                Aa
              </span>
            </div>
          )}
        </Field>
        {!colorReadable && <p className='text-destructive text-sm'>{t.contrastLow}</p>}
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy || !colorReadable} type='submit' variant='primary'>
          {busy ? text().common.saving : t.save}
        </Button>
      </form>
    </Card>
  );
};

/** The logo of the UI - not of QR codes, which is set on its own screen. */
const UiLogoCard = () => {
  const t = text().settings;
  const { uiLogo } = organization();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      window.location.reload();
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className='font-semibold text-lg'>{t.uiLogo}</h2>
      <div className='mt-4 flex flex-col gap-4 sm:flex-row sm:items-center'>
        <div className='flex h-20 w-40 shrink-0 items-center justify-center rounded-lg border bg-white p-2'>
          {uiLogo ? (
            <img alt='' className='max-h-full max-w-full object-contain' height={64} src={uiLogo} width={144} />
          ) : (
            <span className='text-muted-foreground text-xs'>{t.uiLogoNone}</span>
          )}
        </div>
        <div className='min-w-0 flex-1 space-y-3'>
          <p className='text-muted-foreground text-sm'>{t.uiLogoHint}</p>
          <div className='flex flex-wrap gap-2'>
            <LogoUpload
              disabled={busy}
              label={t.uploadUiLogo}
              onFile={(file) => run(() => api.adminUploadUiLogo(file))}
            />
            {uiLogo && (
              <Button disabled={busy} onClick={() => run(api.adminRemoveUiLogo)}>
                {t.removeUiLogo}
              </Button>
            )}
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
      </div>
    </Card>
  );
};

const AdminSettingsPage = () => (
  <>
    <SettingsForm />
    <UiLogoCard />
  </>
);

export { AdminSettingsPage, LANGUAGE_NAMES, TimeZoneInput };
