import { useState } from "react";
import { api, type Link, type LogoChoice } from "../api";
import { ErrorText } from "../components";
import { messageOf } from "../messages";
import { LogoUpload, QrPicture, useQr } from "../qr";

const CHOICES: { value: LogoChoice; label: string }[] = [
  { label: "Theo đơn vị (hoặc logo của Trường nếu đơn vị chưa đặt)", value: "inherit" },
  { label: "Không logo", value: "none" },
  { label: "Logo riêng cho link này", value: "custom" }
];

/**
 * A Link's QR and the one thing about it that can be chosen: which logo. Size, position and error
 * correction are the system's.
 */
const QrPanel = ({ link, onChanged }: { link: Link; onChanged: (link: Link) => void }) => {
  // Counts uploads: a new file under the same choice is still a new picture.
  const [version, setVersion] = useState(0);
  const { source, error } = useQr(`${link.code}|${link.logoChoice}|${version}`, () => api.linkQr(link.code));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const run = async (work: () => Promise<LogoChoice>) => {
    setBusy(true);
    setActionError("");
    try {
      onChanged({ ...link, logoChoice: await work() });
      setVersion((value) => value + 1);
    } catch (failure) {
      setActionError(messageOf(failure));
    }
    setBusy(false);
  };

  const upload = (file: File) =>
    run(async () => {
      await api.uploadLinkLogo(link.code, file);
      return "custom";
    });

  return (
    <div className='space-y-3 rounded-md border border-line bg-page p-3'>
      <h4 className='font-medium text-sm'>QR</h4>
      <p className='rounded-md bg-amber-100 px-3 py-2 text-amber-900 text-sm'>
        <strong>Chưa in QR này.</strong> Hệ thống đang chạy thử trên tên miền tạm; QR mang tên miền tạm sẽ ngừng hoạt
        động khi đổi sang tên miền chính thức.
      </p>
      <div className='flex flex-col gap-4 sm:flex-row'>
        <QrPicture name={`qr-${link.code}`} source={source} />
        <div className='min-w-0 flex-1 space-y-3'>
          <p className='text-muted text-sm'>
            QR chứa địa chỉ {link.url}, không chứa đích - nên đổi đích sau khi in vẫn dùng được QR này.
          </p>
          <fieldset className='space-y-1' disabled={busy}>
            <legend className='font-medium text-sm'>Logo ở giữa QR</legend>
            {CHOICES.map((choice) => (
              <label className='flex min-h-11 items-center gap-2 text-sm' key={choice.value}>
                <input
                  checked={link.logoChoice === choice.value}
                  // A logo of its own starts with a file, so that choice is made by uploading one.
                  disabled={choice.value === "custom" && link.logoChoice !== "custom"}
                  name={`logo-${link.code}`}
                  onChange={() => {
                    const { value } = choice;
                    if (value !== "custom") {
                      run(async () => (await api.setLinkLogoChoice(link.code, value)).logoChoice);
                    }
                  }}
                  type='radio'
                />
                {choice.label}
              </label>
            ))}
          </fieldset>
          <LogoUpload
            disabled={busy}
            label={link.logoChoice === "custom" ? "Đổi logo riêng" : "Tải lên logo riêng"}
            onFile={upload}
          />
          <p className='text-muted text-xs'>
            Ảnh PNG hoặc JPEG, tối đa 256 KB. Hệ thống tự đặt logo ở giữa, trên nền trắng, với kích thước an toàn cho
            việc quét.
          </p>
          <ErrorText>{actionError || error}</ErrorText>
        </div>
      </div>
    </div>
  );
};

export { QrPanel };
