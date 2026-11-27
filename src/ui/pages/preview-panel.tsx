import { ImageIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Button, ErrorText, Field } from "@/components/app";
import { LOCKED_PREVIEWS } from "../../domain/preview";
import { api, type Link, type Preview } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";
import { organization } from "../organization";

const EMPTY: Preview = { description: "", image: "", title: "" };
const t = text().preview;

/** What a Link with a password says of itself, in the Organization's language (`domain/preview.ts`). */
const lockedPreview = (): Preview => LOCKED_PREVIEWS[organization().language];

/** Roughly how Zalo, Facebook and Messenger show a pasted Link: picture, title, a line, the host. */
const PreviewCard = ({ preview, host }: { preview: Preview; host: string }) => {
  const [broken, setBroken] = useState(false);
  // Tried apart from the <img>, so an address that does not load shows the empty frame instead.
  useEffect(() => {
    setBroken(false);
    if (!preview.image) {
      return;
    }
    const probe = new Image();
    probe.onerror = () => setBroken(true);
    probe.src = preview.image;
    return () => {
      probe.onerror = null;
    };
  }, [preview.image]);

  return (
    <div className='overflow-hidden rounded-lg border bg-card'>
      {preview.image && !broken ? (
        <img
          alt=''
          className='aspect-[1.91/1] w-full bg-muted object-cover'
          height={628}
          referrerPolicy='no-referrer'
          src={preview.image}
          width={1200}
        />
      ) : (
        <div className='flex aspect-[1.91/1] w-full items-center justify-center bg-muted text-muted-foreground'>
          <ImageIcon className='size-8' />
        </div>
      )}
      <div className='space-y-0.5 border-t bg-muted/40 px-3 py-2'>
        <p className='truncate text-muted-foreground text-xs uppercase'>{host}</p>
        <p className='line-clamp-2 font-medium text-sm'>{preview.title || host}</p>
        {preview.description && <p className='line-clamp-2 text-muted-foreground text-xs'>{preview.description}</p>}
      </div>
    </div>
  );
};

/**
 * How the Link looks when pasted into a chat or a post. Each part left empty takes what the
 * Target's page says about itself; anything set here wins. Everything here is public - unlike the
 * Link Name and the note.
 */
const PreviewPanel = ({
  link,
  onChanged,
  onDone
}: {
  link: Link;
  onChanged: (link: Link) => void;
  onDone: () => void;
}) => {
  const [own, setOwn] = useState<Preview>(link.preview);
  const [fromTarget, setFromTarget] = useState<Preview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A Link with a password never shows its Target's words, so there is nothing to read.
  const locked = link.hasPassword;
  const fallback = locked ? lockedPreview() : fromTarget;

  // biome-ignore lint/correctness/useExhaustiveDependencies: read once, when the panel opens
  useEffect(() => {
    if (link.hasPassword) {
      setFromTarget(null);
      return;
    }
    let current = true;
    api
      .linkPreview(link.code)
      .then((answer) => current && setFromTarget(answer.fromTarget))
      .catch(() => current && setFromTarget(null));
    return () => {
      current = false;
    };
  }, []);

  const shown: Preview = {
    description: own.description.trim() || fallback?.description || "",
    image: own.image.trim() || fallback?.image || "",
    title: own.title.trim() || fallback?.title || ""
  };
  const set = (part: keyof Preview) => (event: { target: { value: string } }) => {
    setError("");
    setOwn((previous) => ({ ...previous, [part]: event.target.value }));
  };
  const fromPage = (part: keyof Preview) => {
    if (locked) {
      const words = lockedPreview()[part];
      return words ? t.lockedLeave(words) : t.lockedNoImage;
    }
    return fromTarget?.[part] ? t.targetLeave(fromTarget[part]) : t.targetNone;
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onChanged(await api.setLinkPreview(link.code, own));
      onDone();
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  };

  return (
    <form className='space-y-4' onSubmit={save}>
      {locked ? (
        <p className='rounded-md border border-primary/30 bg-primary/5 p-3 text-sm'>{t.lockedIntro(link.url)}</p>
      ) : (
        <p className='text-muted-foreground text-sm'>{t.intro(link.url)}</p>
      )}
      {fromTarget === undefined ? (
        <p className='text-muted-foreground text-sm'>{t.readingTarget}</p>
      ) : (
        <PreviewCard host={new URL(locked ? link.url : link.target).hostname} preview={shown} />
      )}
      {fromTarget === null && !locked && <p className='text-muted-foreground text-xs'>{t.unreadable}</p>}
      <Field hint={fromTarget === undefined ? undefined : fromPage("title")} label={t.title}>
        {(props) => <input {...props} maxLength={200} onChange={set("title")} value={own.title} />}
      </Field>
      <Field hint={fromTarget === undefined ? undefined : fromPage("description")} label={t.description}>
        {(props) => (
          <textarea {...props} maxLength={500} onChange={set("description")} rows={2} value={own.description} />
        )}
      </Field>
      <Field hint={t.imageHint} label={t.image}>
        {(props) => (
          <input
            {...props}
            inputMode='url'
            onChange={set("image")}
            placeholder={(locked ? "" : fromTarget?.image) || "https://"}
            spellCheck={false}
            value={own.image}
          />
        )}
      </Field>
      <p className='text-muted-foreground text-xs'>
        {t.refreshBefore}{" "}
        <a
          className='underline'
          href={`https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(link.url)}`}
          rel='noreferrer'
          target='_blank'
        >
          Sharing Debugger
        </a>{" "}
        {t.refreshAfter}
      </p>
      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>{text().common.cancel}</Button>
        <Button onClick={() => setOwn(EMPTY)}>{locked ? t.clearLocked : t.useAllFromTarget}</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? text().common.saving : text().common.save}
        </Button>
      </div>
    </form>
  );
};

export { PreviewPanel };
