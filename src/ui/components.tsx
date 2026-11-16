import { type ButtonHTMLAttributes, type ReactNode, useEffect, useId, useRef, useState } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "plain" | "danger" };

const BUTTON_STYLE = {
  danger: "bg-danger text-white hover:brightness-90",
  plain: "border border-line bg-surface text-ink hover:bg-page",
  primary: "bg-brand text-white hover:bg-brand-strong"
};

/** 44px tall: the smallest target a thumb hits reliably. */
const Button = ({ variant = "plain", className = "", type = "button", ...rest }: ButtonProps) => (
  <button
    className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLE[variant]} ${className}`}
    type={type}
    {...rest}
  />
);

const INPUT_STYLE = "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-ink placeholder:text-muted";

/** A label, its control and an optional hint, wired together for a screen reader. */
const Field = ({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: (props: { id: string; "aria-describedby": string | undefined; className: string }) => ReactNode;
}) => {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className='space-y-1'>
      <label className='block font-medium text-sm' htmlFor={id}>
        {label}
      </label>
      {children({ "aria-describedby": hint ? hintId : undefined, className: INPUT_STYLE, id })}
      {hint && (
        <p className='text-muted text-sm' id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
};

/** `flush` drops the padding, for a card whose rows run edge to edge and pad themselves. */
const Card = ({ children, flush = false }: { children: ReactNode; flush?: boolean }) => (
  <section className={`rounded-lg border border-line bg-surface ${flush ? "" : "p-4 sm:p-5"}`}>{children}</section>
);

const ErrorText = ({ children }: { children: ReactNode }) =>
  children ? (
    <p className='rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger text-sm' role='alert'>
      {children}
    </p>
  ) : null;

const Badge = ({ tone, children }: { tone: "ok" | "muted" | "danger"; children: ReactNode }) => {
  const style = {
    danger: "bg-danger/10 text-danger",
    muted: "bg-page text-muted",
    ok: "bg-ok/10 text-ok"
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 font-medium text-xs ${style}`}>{children}</span>;
};

/** Copies a value and says so. The label flips back by itself so the button can be used again. */
const CopyButton = ({ value, label = "Sao chép" }: { value: string; label?: string }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      className='shrink-0'
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
    >
      {copied ? "Đã sao chép" : label}
    </Button>
  );
};

/** A value to hand to someone else: shown whole, selectable, with its copy button beside it. */
const SecretBox = ({ value }: { value: string }) => (
  <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
    <code className='min-w-0 flex-1 break-all rounded-md border border-line bg-page px-3 py-2 font-mono text-sm'>
      {value}
    </code>
    <CopyButton value={value} />
  </div>
);

/**
 * Asked before anything that cannot be taken back. It names the thing and says what is lost; the
 * write happens only from its own button.
 */
const ConfirmDialog = ({
  open,
  title,
  children,
  confirmLabel,
  busy,
  tone = "danger",
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  /** `danger` for what cannot be taken back; `primary` for a change that can be made again. */
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) {
      dialog?.showModal();
    }
    if (!open && dialog?.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      className='m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-surface p-5 text-ink'
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={ref}
    >
      <h2 className='font-semibold text-lg'>{title}</h2>
      <div className='mt-2 text-muted text-sm'>{children}</div>
      <div className='mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onCancel}>Hủy</Button>
        <Button disabled={busy} onClick={onConfirm} variant={tone}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
};

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString("vi-VN");

export { Badge, Button, Card, ConfirmDialog, CopyButton, ErrorText, Field, formatDate, formatDateTime, SecretBox };
