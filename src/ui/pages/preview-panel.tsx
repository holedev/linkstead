import { ImageIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Button, ErrorText, Field } from "@/components/app";
import { api, type Link, type Preview } from "../api";
import { messageOf } from "../messages";

const EMPTY: Preview = { description: "", image: "", title: "" };

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
 * Đích's page says about itself; anything set here wins. Everything here is public - unlike the
 * Tên link and the note.
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: read once, when the panel opens
  useEffect(() => {
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
    description: own.description.trim() || fromTarget?.description || "",
    image: own.image.trim() || fromTarget?.image || "",
    title: own.title.trim() || fromTarget?.title || ""
  };
  const set = (part: keyof Preview) => (event: { target: { value: string } }) => {
    setError("");
    setOwn((previous) => ({ ...previous, [part]: event.target.value }));
  };
  const fromPage = (part: keyof Preview) =>
    fromTarget?.[part] ? `Để trống để dùng của trang đích: "${fromTarget[part]}"` : "Trang đích không có.";

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
      <p className='text-muted-foreground text-sm'>
        Đây là thứ hiện ra khi dán {link.url} vào Zalo, Facebook, Messenger... Mỗi phần để trống sẽ lấy từ trang đích.
        Mọi người đều thấy phần này - khác với Tên link và ghi chú, chỉ đơn vị thấy.
      </p>
      {fromTarget === undefined ? (
        <p className='text-muted-foreground text-sm'>Đang đọc trang đích...</p>
      ) : (
        <PreviewCard host={new URL(link.target).hostname} preview={shown} />
      )}
      {fromTarget === null && (
        <p className='text-muted-foreground text-xs'>
          Không đọc được trang đích, hoặc trang không tự mô tả. Hãy tự đặt tiêu đề và ảnh bên dưới.
        </p>
      )}
      <Field hint={fromTarget === undefined ? undefined : fromPage("title")} label='Tiêu đề'>
        {(props) => <input {...props} maxLength={200} onChange={set("title")} value={own.title} />}
      </Field>
      <Field hint={fromTarget === undefined ? undefined : fromPage("description")} label='Mô tả'>
        {(props) => (
          <textarea {...props} maxLength={500} onChange={set("description")} rows={2} value={own.description} />
        )}
      </Field>
      <Field hint='Địa chỉ https của một ảnh, nên ngang khoảng 1200 x 630.' label='Ảnh'>
        {(props) => (
          <input
            {...props}
            inputMode='url'
            onChange={set("image")}
            placeholder={fromTarget?.image || "https://"}
            spellCheck={false}
            value={own.image}
          />
        )}
      </Field>
      <p className='text-muted-foreground text-xs'>
        Zalo và Facebook lưu bản xem trước một thời gian, nên link đã dán trước đó có thể chưa đổi ngay.
      </p>
      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>Hủy</Button>
        <Button onClick={() => setOwn(EMPTY)}>Dùng hết của trang đích</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>
    </form>
  );
};

export { PreviewPanel };
