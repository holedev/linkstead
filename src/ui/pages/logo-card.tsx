import { type ReactNode, useState } from "react";
import { Button, Card, ErrorText } from "@/components/app";
import { messageOf } from "../messages";
import { LogoUpload, QrPicture, useQr } from "../qr";

/**
 * A default logo - a Đơn vị's or the university's - shown on a sample QR, with the two things
 * that can be done to it: put another in its place, or take it away.
 */
const LogoCard = ({
  title,
  children,
  stamp,
  hasLogo,
  loadPreview,
  onUpload,
  onRemove,
  removeLabel
}: {
  title: string;
  children: ReactNode;
  /** Changes when the logo may have, from outside this card. */
  stamp: string;
  hasLogo: boolean;
  loadPreview: () => Promise<string>;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  removeLabel: string;
}) => {
  const [version, setVersion] = useState(0);
  const { source, error } = useQr(`${stamp}|${version}`, loadPreview);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setActionError("");
    try {
      await work();
      setVersion((value) => value + 1);
    } catch (failure) {
      setActionError(messageOf(failure));
    }
    setBusy(false);
  };

  return (
    <Card>
      <h2 className='font-semibold text-lg'>{title}</h2>
      <div className='mt-4 flex flex-col gap-4 sm:flex-row'>
        <QrPicture name='qr-vi-du' source={source} />
        <div className='min-w-0 flex-1 space-y-3'>
          <div className='space-y-2 text-muted-foreground text-sm'>{children}</div>
          <div className='flex flex-wrap gap-2'>
            <LogoUpload
              disabled={busy}
              label={hasLogo ? "Đổi logo" : "Tải lên logo"}
              onFile={(file) => run(() => onUpload(file))}
            />
            {hasLogo && (
              <Button disabled={busy} onClick={() => run(onRemove)}>
                {removeLabel}
              </Button>
            )}
          </div>
          <p className='text-muted-foreground text-xs'>
            Ảnh PNG hoặc JPEG. Viền trắng hoặc trong suốt quanh logo được tự cắt bỏ để logo lấp đầy khung. QR bên cạnh
            là mẫu để xem logo, không phải link thật.
          </p>
          <ErrorText>{actionError || error}</ErrorText>
        </div>
      </div>
    </Card>
  );
};

export { LogoCard };
