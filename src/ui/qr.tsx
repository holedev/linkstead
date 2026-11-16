import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/app";
import { contentBox } from "../domain/logo-trim";
import { messageOf } from "./messages";

const PNG_MIN_PIXELS = 1024;

/**
 * Loads a QR's SVG and keeps it as text and as an address an `<img>` can show. `stamp` changes
 * when the picture may have - a new logo, another choice - which loads it again.
 */
const useQr = (stamp: string, load: () => Promise<string>) => {
  const [source, setSource] = useState<{ text: string; url: string } | null>(null);
  const [error, setError] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` is the same call on every render; `stamp` is the reload trigger
  useEffect(() => {
    let url = "";
    let current = true;
    setError("");
    load()
      .then((text) => {
        if (current) {
          url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
          setSource({ text, url });
        }
      })
      .catch((failure) => current && setError(messageOf(failure)));
    return () => {
      current = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [stamp]);

  return { error, source };
};

const save = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

/**
 * PNG from the server's SVG, drawn at a whole number of pixels per module so every edge stays
 * sharp. The server never makes PNG (AGENTS.md).
 */
const savePng = (svgUrl: string, filename: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.max(1, Math.ceil(PNG_MIN_PIXELS / image.naturalWidth));
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth * scale;
      canvas.height = image.naturalHeight * scale;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("no canvas"));
        return;
      }
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          save(blob, filename);
          resolve();
        } else {
          reject(new Error("no png"));
        }
      }, "image/png");
    };
    image.onerror = () => reject(new Error("no image"));
    image.src = svgUrl;
  });

/** The picture itself, with its two downloads. `name` is the file's name without an extension. */
const QrPicture = ({
  source,
  name,
  backdrop = "#fff"
}: {
  source: { text: string; url: string } | null;
  name: string;
  /** What shows through a QR with no background of its own - a CSS background. */
  backdrop?: string;
}) => {
  const [failed, setFailed] = useState(false);
  if (!source) {
    return <div className='size-44 shrink-0 rounded-md border border-border bg-card' />;
  }
  return (
    <div className='flex shrink-0 flex-col gap-2'>
      <img
        alt='QR'
        className='size-44 rounded-md border border-border'
        height={176}
        src={source.url}
        style={{ background: backdrop }}
        width={176}
      />
      <div className='flex gap-2'>
        <Button
          className='flex-1 whitespace-nowrap px-2!'
          onClick={() => save(new Blob([source.text], { type: "image/svg+xml" }), `${name}.svg`)}
        >
          Tải SVG
        </Button>
        <Button
          className='flex-1 whitespace-nowrap px-2!'
          onClick={() => savePng(source.url, `${name}.png`).catch(() => setFailed(true))}
        >
          Tải PNG
        </Button>
      </div>
      {failed && <p className='text-destructive text-xs'>Trình duyệt không tạo được PNG. Hãy tải SVG.</p>}
    </div>
  );
};

/** Plenty for a logo shown at a fifth of a QR; anything larger only makes the file heavier. */
const LOGO_MAX_SIDE = 512;
/** The server's limit (`domain/logo.ts`). */
const LOGO_MAX_BYTES = 256 * 1024;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

const EXTENSION = /\.\w+$/u;

/**
 * The logo without the white or transparent margin round it, so it fills the QR's logo box
 * instead of sitting small in its middle. The box itself does not change. Anything that cannot be
 * read here is sent as it is, for the server to judge.
 */
const trimLogo = async (file: File): Promise<File> => {
  try {
    const bitmap = await createImageBitmap(file);
    const source = document.createElement("canvas");
    source.width = bitmap.width;
    source.height = bitmap.height;
    const sourceContext = source.getContext("2d");
    if (!sourceContext) {
      return file;
    }
    sourceContext.drawImage(bitmap, 0, 0);
    const whole = { height: bitmap.height, width: bitmap.width, x: 0, y: 0 };
    const box = contentBox(
      sourceContext.getImageData(0, 0, bitmap.width, bitmap.height).data,
      bitmap.width,
      bitmap.height
    );
    // No margin to cut: only a file too big to send, or too large to need, is redrawn smaller.
    if (!box && file.size <= LOGO_MAX_BYTES && Math.max(bitmap.width, bitmap.height) <= LOGO_MAX_SIDE) {
      return file;
    }
    const keep = box ?? whole;
    const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(keep.width, keep.height));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(keep.width * scale));
    out.height = Math.max(1, Math.round(keep.height * scale));
    const context = out.getContext("2d");
    if (!context) {
      return file;
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(source, keep.x, keep.y, keep.width, keep.height, 0, 0, out.width, out.height);
    const png = await toBlob(out, "image/png");
    if (png && png.size <= LOGO_MAX_BYTES) {
      return new File([png], `${file.name.replace(EXTENSION, "")}.png`, { type: "image/png" });
    }
    // A photo-like logo can be heavy as PNG; on its white backing JPEG loses nothing that shows.
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, out.width, out.height);
    const jpeg = await toBlob(out, "image/jpeg", 0.9);
    return jpeg ? new File([jpeg], `${file.name.replace(EXTENSION, "")}.jpg`, { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
};

/** A button that opens the file chooser, limited to the two kinds of picture a logo may be. */
const LogoUpload = ({
  label,
  disabled,
  onFile
}: {
  label: string;
  disabled: boolean;
  onFile: (file: File) => void;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file again still counts as a change.
    event.target.value = "";
    if (file) {
      trimLogo(file).then(onFile);
    }
  };
  return (
    <>
      <input accept='image/png,image/jpeg' className='hidden' onChange={pick} ref={input} type='file' />
      <Button disabled={disabled} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  );
};

export { LogoUpload, QrPicture, useQr };
