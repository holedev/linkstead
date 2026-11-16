import { CheckIcon, CircleAlertIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge as UiBadge } from "@/components/ui/badge";
import { buttonVariants, Button as UiButton } from "@/components/ui/button";
import { Card as UiCard } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The few building blocks every screen uses, on top of shadcn's. Screens speak in what a thing
 * means - a primary action, a danger, a confirmation - and this file says how that looks.
 */

const VARIANT = { danger: "destructive", plain: "outline", primary: "default" } as const;

/** 44px tall on a phone: the smallest target a thumb hits reliably. Compact from a tablet up. */
const TOUCH = "h-11 md:h-9";

type ButtonProps = Omit<ComponentProps<"button">, "ref"> & { variant?: keyof typeof VARIANT };

const Button = ({ variant = "plain", className, type = "button", ...rest }: ButtonProps) => (
  <UiButton className={cn(TOUCH, className)} type={type} variant={VARIANT[variant]} {...rest} />
);

/** A file to save, as a link so the browser handles the download itself. Looks like a plain button. */
const DownloadLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className={cn(buttonVariants({ variant: "outline" }), TOUCH)} download href={href}>
    <DownloadIcon />
    {children}
  </a>
);

/** shadcn's input look, for the native controls a `Field` hands its class to. */
const CONTROL = cn(
  "w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs outline-none",
  "transition-[color,box-shadow] placeholder:text-muted-foreground md:text-sm",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "min-h-11 md:min-h-9"
);

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
    <div className='grid gap-2'>
      <Label htmlFor={id}>{label}</Label>
      {children({ "aria-describedby": hint ? hintId : undefined, className: CONTROL, id })}
      {hint && (
        <p className='text-muted-foreground text-sm' id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
};

/** `flush` drops the padding, for a card whose rows run edge to edge and pad themselves. */
const Card = ({ children, flush = false }: { children: ReactNode; flush?: boolean }) => (
  <UiCard className={cn("block gap-0 py-0", flush ? "overflow-hidden" : "p-4 sm:p-6")}>{children}</UiCard>
);

const ErrorText = ({ children }: { children: ReactNode }) =>
  children ? (
    <Alert role='alert' variant='destructive'>
      <CircleAlertIcon />
      <AlertDescription className='text-destructive'>{children}</AlertDescription>
    </Alert>
  ) : null;

const BADGE = {
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
  ok: "border-ok/20 bg-ok/10 text-ok"
};

const Badge = ({ tone, children }: { tone: keyof typeof BADGE; children: ReactNode }) => (
  <UiBadge className={BADGE[tone]} variant='outline'>
    {children}
  </UiBadge>
);

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
      {copied ? <CheckIcon className='text-ok' /> : <CopyIcon />}
      {copied ? "Đã sao chép" : label}
    </Button>
  );
};

/** The same, as a small icon beside the value it copies. `label` says what, for a screen reader. */
const CopyIconButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <UiButton
      aria-label={copied ? "Đã sao chép" : label}
      className='size-9 shrink-0 text-muted-foreground md:size-7'
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
      size='icon'
      title={copied ? "Đã sao chép" : label}
      type='button'
      variant='ghost'
    >
      {copied ? <CheckIcon className='text-ok' /> : <CopyIcon />}
    </UiButton>
  );
};

/**
 * A task done in a window over the page: a form, a history, a picture. Its content is mounted only
 * while it is open, so it always starts from how things are now.
 */
const Modal = ({
  open,
  onClose,
  title,
  description,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) => (
  <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
    <DialogContent
      aria-describedby={description ? undefined : ""}
      className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl'
    >
      <DialogHeader className='text-left'>
        <DialogTitle className='break-words pr-6 leading-snug'>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
);

/** A value to hand to someone else: shown whole, selectable, with its copy button beside it. */
const SecretBox = ({ value }: { value: string }) => (
  <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
    <code className='min-w-0 flex-1 break-all rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm'>{value}</code>
    <CopyButton value={value} />
  </div>
);

/** Something that went through, with what to do next. */
const Notice = ({ children }: { children: ReactNode }) => (
  <div className='mt-4 space-y-2 rounded-lg border border-ok/30 bg-ok/5 p-3 text-sm'>{children}</div>
);

/**
 * Asked before anything that cannot be taken back, or that a visitor will notice. It names the
 * thing and says what follows; the write happens only from its own button.
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
}) => (
  <AlertDialog onOpenChange={(next) => !next && onCancel()} open={open}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className='break-words'>{title}</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className='text-left text-muted-foreground text-sm'>{children}</div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <Button onClick={onCancel}>Hủy</Button>
        {/* A plain button, not the dialog's own action: the screen closes it once the write is under way. */}
        <Button disabled={busy} onClick={onConfirm} variant={tone}>
          {confirmLabel}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString("vi-VN");

export {
  Badge,
  Button,
  Card,
  CONTROL,
  ConfirmDialog,
  CopyButton,
  CopyIconButton,
  DownloadLink,
  ErrorText,
  Field,
  formatDate,
  formatDateTime,
  Modal,
  Notice,
  SecretBox
};
