import { type ReactNode, useEffect, useState } from "react";
import { ErrorText } from "@/components/app";
import {
  DEFAULT_QR_STYLE,
  MAX_LOGO_SCALE,
  MIN_LOGO_SCALE,
  QR_STYLES,
  type QrShape,
  type QrStyle
} from "../../domain/qr-style";
import { api, type Link, type LogoChoice } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";
import { LogoUpload, QrPicture, useQr } from "../qr";

const t = text().qrPanel;

const CHOICES: { value: LogoChoice; label: string }[] = [
  { label: t.choiceInherit, value: "inherit" },
  { label: t.choiceNone, value: "none" },
  { label: t.choiceOwn, value: "custom" }
];

const STYLE_KEY = "linkstead.qr-style";
const SAVE_AFTER_MS = 400;

/** A checkerboard, the usual sign for "nothing here": light for a dark QR, dark for a light one. */
const checker = (a: string, b: string) => `repeating-conic-gradient(${a} 0% 25%, ${b} 0% 50%) 50% / 16px 16px`;

/** The looks offered, in the order offered, with what the person needs to know before printing. */
const LOOKS: { style: QrStyle; label: string; note?: string; backdrop: string }[] = [
  { backdrop: "#fff", label: t.lookDark, style: "dark-on-light" },
  { backdrop: "#fff", label: t.lookLight, note: t.lookLightNote, style: "light-on-dark" },
  { backdrop: "#fff", label: t.lookBlue, style: "blue-on-light" },
  { backdrop: checker("#fff", "#e5e7eb"), label: t.lookDarkClear, note: t.lookDarkClearNote, style: "dark-on-clear" },
  {
    backdrop: checker("#111827", "#374151"),
    label: t.lookLightClear,
    note: t.lookLightClearNote,
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

/** A small picture of each shape, drawn the way the QR is: three corner squares and a few modules. */
const ShapeIcon = ({ shape }: { shape: QrShape }) => {
  const corner = (x: number, y: number) =>
    shape === "dots" ? (
      <g key={`${x}-${y}`}>
        <rect fill='none' height='6' rx='2' stroke='currentColor' strokeWidth='1.4' width='6' x={x + 0.7} y={y + 0.7} />
        <rect height='3' rx='1' width='3' x={x + 2.2} y={y + 2.2} />
      </g>
    ) : (
      <g key={`${x}-${y}`}>
        <rect fill='none' height='6' stroke='currentColor' strokeWidth='1.4' width='6' x={x + 0.7} y={y + 0.7} />
        <rect height='3' width='3' x={x + 2.2} y={y + 2.2} />
      </g>
    );
  const modules = [
    [10, 2],
    [12, 4],
    [10, 10],
    [13, 12],
    [16, 11],
    [11, 15],
    [15, 16],
    [17, 14]
  ];
  return (
    <svg aria-hidden='true' className='size-10 shrink-0' fill='currentColor' viewBox='0 0 20 20'>
      {corner(0, 0)}
      {corner(12, 0)}
      {corner(0, 12)}
      {modules.map(([x = 0, y = 0]) =>
        shape === "dots" ? (
          <circle cx={x + 1} cy={y + 1} key={`${x}-${y}`} r='0.9' />
        ) : (
          <rect height='2' key={`${x}-${y}`} width='2' x={x} y={y} />
        )
      )}
    </svg>
  );
};

const SHAPES: { shape: QrShape; label: string; hint: string }[] = [
  { hint: t.shapeSquareHint, label: t.shapeSquare, shape: "square" },
  { hint: t.shapeDotsHint, label: t.shapeDots, shape: "dots" }
];

/** One group of settings, framed and named. */
const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className='space-y-3 rounded-lg border p-4'>
    <h3 className='font-medium'>{title}</h3>
    {children}
  </section>
);

/**
 * A Link's QR and the one thing about it that can be chosen: which logo. Size, position and error
 * correction are the system's.
 */
const QrPanel = ({ link, onChanged }: { link: Link; onChanged: (link: Link) => void }) => {
  // Counts uploads: a new file under the same choice is still a new picture.
  const [version, setVersion] = useState(0);
  const [style, setStyle] = useState<QrStyle>(readStyle);
  const look = LOOKS.find((candidate) => candidate.style === style) ?? LOOKS[0];
  const { source, error } = useQr(
    `${link.code}|${link.logoChoice}|${link.logoScale}|${link.qrShape}|${version}|${style}`,
    () => api.linkQr(link.code, style)
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

  const run = async (work: () => Promise<Partial<Pick<Link, "logoChoice" | "logoScale" | "qrShape">>>) => {
    setBusy(true);
    setActionError("");
    try {
      onChanged({ ...link, ...(await work()) });
      setVersion((value) => value + 1);
    } catch (failure) {
      setActionError(messageOf(failure));
    }
    setBusy(false);
  };

  const upload = (file: File) =>
    run(async () => {
      await api.uploadLinkLogo(link.code, file);
      return { logoChoice: "custom", logoScale: link.logoScale };
    });

  // The slider moves freely; the size is saved once it rests, not on every step.
  const [scale, setScale] = useState(link.logoScale);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new position of the slider should save
  useEffect(() => {
    if (scale === link.logoScale) {
      return;
    }
    const timer = setTimeout(() => run(() => api.setLinkLogoScale(link.code, scale)), SAVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [scale]);

  return (
    <div className='space-y-4'>
      <div className='grid gap-5 lg:grid-cols-[auto_1fr]'>
        {/* The picture stays in view while the settings beside it scroll. */}
        <div className='space-y-3 lg:sticky lg:top-0 lg:self-start'>
          <QrPicture
            backdrop={look?.backdrop}
            large
            name={style === DEFAULT_QR_STYLE ? `qr-${link.code}` : `qr-${link.code}-${style}`}
            source={source}
          />
          <p className='max-w-80 text-muted-foreground text-sm sm:max-w-72'>
            {t.carries} <span className='break-all'>{link.url}</span>
            {t.carriesAfter}
          </p>
        </div>

        <div className='min-w-0 space-y-4'>
          <Panel title={t.logo}>
            <fieldset className='space-y-1' disabled={busy}>
              <legend className='sr-only'>{t.logoLegend}</legend>
              {CHOICES.map((choice) => (
                <label className='flex min-h-11 items-center gap-2 text-sm md:min-h-9' key={choice.value}>
                  <input
                    checked={link.logoChoice === choice.value}
                    // A logo of its own starts with a file, so that choice is made by uploading one.
                    disabled={choice.value === "custom" && link.logoChoice !== "custom"}
                    name={`logo-${link.code}`}
                    onChange={() => {
                      const { value } = choice;
                      if (value !== "custom") {
                        run(() => api.setLinkLogoChoice(link.code, value));
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
              label={link.logoChoice === "custom" ? t.changeOwnLogo : t.uploadOwnLogo}
              onFile={upload}
            />
            <div className='space-y-1 border-t pt-3'>
              <label
                className='flex items-center justify-between gap-2 font-medium text-sm'
                htmlFor={`scale-${link.code}`}
              >
                {t.scale}
                <span className='font-normal text-muted-foreground tabular-nums'>{scale}%</span>
              </label>
              <input
                className='w-full accent-primary'
                disabled={link.logoChoice === "none"}
                id={`scale-${link.code}`}
                max={MAX_LOGO_SCALE}
                min={MIN_LOGO_SCALE}
                onChange={(event) => setScale(Number(event.target.value))}
                step={5}
                type='range'
                value={scale}
              />
              <p className='text-muted-foreground text-xs'>{t.scaleHint}</p>
            </div>
            <p className='text-muted-foreground text-xs'>{t.logoHint}</p>
          </Panel>

          <Panel title={t.shape}>
            <fieldset className='grid grid-cols-2 gap-2' disabled={busy}>
              <legend className='sr-only'>{t.shapeLegend}</legend>
              {SHAPES.map((option) => (
                <label
                  className='flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5'
                  key={option.shape}
                >
                  <input
                    checked={link.qrShape === option.shape}
                    className='sr-only'
                    name={`shape-${link.code}`}
                    onChange={() => run(() => api.setLinkQrShape(link.code, option.shape))}
                    type='radio'
                  />
                  <ShapeIcon shape={option.shape} />
                  <span>
                    <span className='block font-medium'>{option.label}</span>
                    <span className='block text-muted-foreground text-xs'>{option.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className='text-muted-foreground text-xs'>{t.shapeNote}</p>
          </Panel>

          <Panel title={t.color}>
            <fieldset>
              <legend className='sr-only'>{t.colorLegend}</legend>
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
            </fieldset>
            {look?.note && <p className='rounded-md bg-amber-50 px-3 py-2 text-amber-900 text-xs'>{look.note}</p>}
            <p className='text-muted-foreground text-xs'>{t.colorNote}</p>
          </Panel>

          <ErrorText>{actionError || error}</ErrorText>
        </div>
      </div>
    </div>
  );
};

export { QrPanel };
