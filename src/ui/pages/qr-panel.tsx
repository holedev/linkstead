import { useState } from "react";
import { ErrorText } from "@/components/app";
import { DEFAULT_QR_STYLE, QR_STYLES, type QrStyle } from "../../domain/qr-style";
import { api, type Link, type LogoChoice } from "../api";
import { messageOf } from "../messages";
import { LogoUpload, QrPicture, useQr } from "../qr";

const CHOICES: { value: LogoChoice; label: string }[] = [
  { label: "Theo đơn vị (hoặc logo của Trường nếu đơn vị chưa đặt)", value: "inherit" },
  { label: "Không logo", value: "none" },
  { label: "Logo riêng cho link này", value: "custom" }
];

const STYLE_KEY = "ou-link.qr-style";

/** A checkerboard, the usual sign for "nothing here": light for a dark QR, dark for a light one. */
const checker = (a: string, b: string) => `repeating-conic-gradient(${a} 0% 25%, ${b} 0% 50%) 50% / 16px 16px`;

/** The looks offered, in the order offered, with what the person needs to know before printing. */
const LOOKS: { style: QrStyle; label: string; note?: string; backdrop: string }[] = [
  { backdrop: "#fff", label: "Đen trên trắng", style: "dark-on-light" },
  {
    backdrop: "#fff",
    label: "Trắng trên đen",
    note: "Một số ứng dụng quét cũ không đọc được QR màu đảo. Hãy quét thử bằng vài điện thoại trước khi in.",
    style: "light-on-dark"
  },
  { backdrop: "#fff", label: "Xanh đậm trên trắng", style: "blue-on-light" },
  {
    backdrop: checker("#fff", "#e5e7eb"),
    label: "Đen, không nền",
    note: "Không có nền: QR lấy màu của chỗ nó được đặt lên, nên chỉ đặt lên nền sáng.",
    style: "dark-on-clear"
  },
  {
    backdrop: checker("#111827", "#374151"),
    label: "Trắng, không nền",
    note: "Không có nền: chỉ đặt lên nền thật tối như đen hoặc xanh than. Trên nền màu vừa, QR dễ quét không được.",
    style: "light-on-clear"
  }
];

/** The look last chosen, remembered in this browser only - a convenience, so it may be absent. */
const readStyle = (): QrStyle => {
  try {
    const stored = localStorage.getItem(STYLE_KEY);
    return LOOKS.some((look) => look.style === stored) ? (stored as QrStyle) : DEFAULT_QR_STYLE;
  } catch {
    return DEFAULT_QR_STYLE;
  }
};

const Swatch = ({ style }: { style: QrStyle }) => {
  const { background, foreground } = QR_STYLES[style];
  return (
    <span
      aria-hidden='true'
      className='grid size-6 shrink-0 place-items-center rounded border border-border'
      style={{ background: background ?? checker("#fff", "#d1d5db") }}
    >
      <span className='size-3 rounded-[2px]' style={{ background: foreground }} />
    </span>
  );
};

/**
 * A Link's QR and the one thing about it that can be chosen: which logo. Size, position and error
 * correction are the system's.
 */
const QrPanel = ({ link, onChanged }: { link: Link; onChanged: (link: Link) => void }) => {
  // Counts uploads: a new file under the same choice is still a new picture.
  const [version, setVersion] = useState(0);
  const [style, setStyle] = useState<QrStyle>(readStyle);
  const look = LOOKS.find((candidate) => candidate.style === style) ?? LOOKS[0];
  const { source, error } = useQr(`${link.code}|${link.logoChoice}|${version}|${style}`, () =>
    api.linkQr(link.code, style)
  );
  const choose = (next: QrStyle) => {
    setStyle(next);
    try {
      localStorage.setItem(STYLE_KEY, next);
    } catch {
      // Nothing to do: the choice still holds while the dialog is open.
    }
  };
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
    <div className='space-y-4'>
      <p className='rounded-md bg-amber-100 px-3 py-2 text-amber-900 text-sm'>
        <strong>Chưa in QR này.</strong> Hệ thống đang chạy thử trên tên miền tạm; QR mang tên miền tạm sẽ ngừng hoạt
        động khi đổi sang tên miền chính thức.
      </p>
      <div className='flex flex-col gap-4 sm:flex-row'>
        <QrPicture
          backdrop={look?.backdrop}
          name={style === DEFAULT_QR_STYLE ? `qr-${link.code}` : `qr-${link.code}-${style}`}
          source={source}
        />
        <div className='min-w-0 flex-1 space-y-3'>
          <p className='text-muted-foreground text-sm'>
            QR chứa địa chỉ {link.url}, không chứa đích - nên đổi đích sau khi in vẫn dùng được QR này.
          </p>
          <fieldset className='space-y-1'>
            <legend className='font-medium text-sm'>Màu</legend>
            <div className='grid grid-cols-1 gap-x-3 sm:grid-cols-2'>
              {LOOKS.map((option) => (
                <label className='flex min-h-11 items-center gap-2 text-sm md:min-h-9' key={option.style}>
                  <input
                    checked={style === option.style}
                    name={`style-${link.code}`}
                    onChange={() => choose(option.style)}
                    type='radio'
                  />
                  <Swatch style={option.style} />
                  {option.label}
                </label>
              ))}
            </div>
            {look?.note && <p className='rounded-md bg-amber-50 px-3 py-2 text-amber-900 text-xs'>{look.note}</p>}
            <p className='text-muted-foreground text-xs'>
              Màu chỉ áp dụng cho lần tải này, không lưu vào link. Logo luôn nằm trên nền trắng.
            </p>
          </fieldset>
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
          <p className='text-muted-foreground text-xs'>
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
