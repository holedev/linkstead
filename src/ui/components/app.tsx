import { CheckIcon, CircleAlertIcon, CopyIcon, DownloadIcon, EllipsisIcon, EyeIcon, EyeOffIcon } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { locale, text } from "@/i18n";
import { cn } from "@/lib/utils";
import { organization } from "@/organization";

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

/**
 * A password field with an eye to show what was typed and hide it again - every password in the
 * system gets one, so a typo on a phone keyboard can be seen before it is sent. `shown` starts it
 * visible, for a password meant to be copied and passed on.
 */
const PasswordInput = ({
  className,
  shown: initiallyShown = false,
  ...rest
}: Omit<ComponentProps<"input">, "type"> & { shown?: boolean }) => {
  const [shown, setShown] = useState(initiallyShown);
  const t = text().common;
  return (
    <div className='relative'>
      <input {...rest} className={cn(className, "pr-11")} type={shown ? "text" : "password"} />
      <button
        aria-label={shown ? t.hidePassword : t.showPassword}
        aria-pressed={shown}
        className='absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50'
        onClick={() => setShown((value) => !value)}
        title={shown ? t.hidePassword : t.showPassword}
        type='button'
      >
        {shown ? <EyeOffIcon className='size-4' /> : <EyeIcon className='size-4' />}
      </button>
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
const CopyButton = ({ value, label = text().common.copy }: { value: string; label?: string }) => {
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
      {copied ? text().common.copied : label}
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
      aria-label={copied ? text().common.copied : label}
      className='size-9 shrink-0 text-muted-foreground md:size-7'
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
      size='icon'
      title={copied ? text().common.copied : label}
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
  wide = false,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Room for two columns from a laptop up, for a task with a picture beside its settings. */
  wide?: boolean;
  children: ReactNode;
}) => (
  <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
    <DialogContent
      aria-describedby={description ? undefined : ""}
      className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl", wide && "lg:max-w-4xl")}
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
        <Button onClick={onCancel}>{text().common.cancel}</Button>
        {/* A plain button, not the dialog's own action: the screen closes it once the write is under way. */}
        <Button disabled={busy} onClick={onConfirm} variant={tone}>
          {confirmLabel}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/** The top of a screen: its title, a line under it, and the screen's own buttons on the right. */
const PageHeader = ({
  title,
  description,
  actions
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) => (
  <div className='flex flex-wrap items-end gap-3'>
    <div className='min-w-0 flex-1 basis-60'>
      <h1 className='text-balance font-bold text-2xl tracking-tight'>{title}</h1>
      {description && <p className='text-muted-foreground text-sm'>{description}</p>}
    </div>
    {actions && <div className='flex flex-wrap gap-2'>{actions}</div>}
  </div>
);

/**
 * The Organization's mark: its uploaded logo on a white chip, so any logo reads on its colour -
 * or the first letter of its name - and the name beside it.
 */
const OrganizationMark = ({ className }: { className?: string }) => {
  const { name, uiLogo } = organization();
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      {uiLogo ? (
        <img
          alt=''
          className='h-9 w-auto max-w-32 shrink-0 rounded-md bg-white object-contain px-1.5 py-1'
          height={36}
          src={uiLogo}
          width={128}
        />
      ) : (
        <span
          aria-hidden='true'
          className='flex size-9 shrink-0 items-center justify-center rounded-md bg-white font-bold text-brand'
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className='truncate font-semibold leading-tight'>{name}</span>
    </span>
  );
};

/**
 * Signing in and setting a password: the Organization's colour with its mark beside the form,
 * above it on a phone. The only screens a person sees before being inside, so they say whose
 * system it is.
 */
const SignInFrame = ({ title, children }: { title: string; children: ReactNode }) => {
  const t = text().signIn;
  return (
    <div className='grid min-h-dvh md:grid-cols-2'>
      <aside className='relative flex flex-col justify-between gap-6 overflow-hidden bg-brand px-5 py-5 text-white md:p-10'>
        <OrganizationMark className='text-lg' />
        <div className='hidden max-w-md md:block'>
          <p className='text-balance font-bold text-3xl leading-tight tracking-tight'>{t.headline}</p>
          <p className='mt-3 text-white/80'>{t.lead}</p>
        </div>
        <p className='hidden text-white/60 text-xs md:block'>{organization().name} · linkstead</p>
        <span
          aria-hidden='true'
          className='pointer-events-none absolute -right-28 -bottom-32 hidden size-104 rounded-full border-56 border-white/5 md:block'
        />
      </aside>
      <main className='flex flex-col justify-center px-4 py-8 md:px-10'>
        <div className='mx-auto w-full max-w-sm space-y-4'>
          <h1 className='font-bold text-2xl tracking-tight'>{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
};

/**
 * The actions of one row of a table, behind a "⋯" at its end. `label` names the row for a screen
 * reader; the items are `DropdownMenuItem`s, the one that cannot be taken back marked destructive.
 */
const RowMenu = ({ label, disabled = false, children }: { label: string; disabled?: boolean; children: ReactNode }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <UiButton
        aria-label={label}
        className='size-9 shrink-0 text-muted-foreground md:size-8'
        disabled={disabled}
        size='icon'
        variant='ghost'
      >
        <EllipsisIcon />
      </UiButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end' className='min-w-56'>
      {children}
    </DropdownMenuContent>
  </DropdownMenu>
);

/** The title row of a card that holds a table: its name, a count, and anything on the right. */
const TableCardTitle = ({ title, count, children }: { title: string; count?: number; children?: ReactNode }) => (
  <div className='flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5'>
    <h2 className='min-w-0 flex-1 font-semibold'>
      {title}
      {count !== undefined && <span className='ml-2 font-normal text-muted-foreground text-sm'>({count})</span>}
    </h2>
    {children}
  </div>
);

/** A moment as the Organization's clocks show it, in its language. */
const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short", timeZone: organization().timeZone });

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(locale(), { timeZone: organization().timeZone });

/** A number as the Organization's language writes it. */
const formatNumber = (value: number): string => new Intl.NumberFormat(locale()).format(value);

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
  formatNumber,
  Modal,
  Notice,
  OrganizationMark,
  PageHeader,
  PasswordInput,
  RowMenu,
  SecretBox,
  SignInFrame,
  TableCardTitle
};
