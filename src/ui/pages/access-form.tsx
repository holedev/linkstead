import { type FormEvent, useState } from "react";
import { Button, ErrorText, Field, PasswordInput } from "@/components/app";
import { fromWallClock, toWallClock } from "../../domain/time-zone";
import { api, type Link } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";
import { organization } from "../organization";

/**
 * Who may open a Link (ADR-0006): a password visitors must give, and a moment after which it stops
 * opening. Both are optional, both can be undone, and neither frees the Link Code. The moment is
 * typed and shown on the Organization's clocks, whatever the browser's own zone.
 */

/** An ISO moment as the `datetime-local` value the Organization's clocks show. */
const toInput = (iso: string): string => toWallClock(new Date(iso), organization().timeZone);

/** A `datetime-local` value, read on the Organization's clocks, as an ISO moment - or null. */
const fromInput = (value: string): string | null =>
  fromWallClock(value, organization().timeZone)?.toISOString() ?? null;

/** Whether the moment has passed - for a Link, whether it has expired. */
const isPast = (iso: string | null): boolean => iso !== null && Date.parse(iso) <= Date.now();

type PasswordChoice = "keep" | "set" | "remove";

const AccessForm = ({
  link,
  onChanged,
  onDone
}: {
  link: Link;
  onChanged: (link: Link) => void;
  onDone: () => void;
}) => {
  const [passwordChoice, setPasswordChoice] = useState<PasswordChoice>(link.hasPassword ? "keep" : "remove");
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState(link.expiresAt ? toInput(link.expiresAt) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = text();

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const access: { password?: string | null; expiresAt?: string | null } = {};
    if (passwordChoice === "set") {
      access.password = password;
    } else if (passwordChoice === "remove" && link.hasPassword) {
      access.password = null;
    }
    const expiresAt = expiry ? fromInput(expiry) : null;
    if (expiresAt !== link.expiresAt) {
      access.expiresAt = expiresAt;
    }
    setBusy(true);
    setError("");
    try {
      onChanged(await api.setLinkAccess(link.code, access));
      onDone();
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  };

  return (
    <form className='space-y-5' onSubmit={save}>
      <fieldset className='space-y-2'>
        <legend className='mb-1 font-medium text-sm'>{t.access.password}</legend>
        <p className='text-muted-foreground text-xs'>{t.access.passwordLead}</p>
        <div className='flex flex-wrap gap-x-4 gap-y-1 text-sm'>
          {link.hasPassword && (
            <label className='flex min-h-9 items-center gap-2'>
              <input
                checked={passwordChoice === "keep"}
                name='password-choice'
                onChange={() => setPasswordChoice("keep")}
                type='radio'
              />
              {t.access.keepPassword}
            </label>
          )}
          <label className='flex min-h-9 items-center gap-2'>
            <input
              checked={passwordChoice === "set"}
              name='password-choice'
              onChange={() => setPasswordChoice("set")}
              type='radio'
            />
            {link.hasPassword ? t.access.changePassword : t.access.setPassword}
          </label>
          <label className='flex min-h-9 items-center gap-2'>
            <input
              checked={passwordChoice === "remove"}
              name='password-choice'
              onChange={() => setPasswordChoice("remove")}
              type='radio'
            />
            {link.hasPassword ? t.access.removePassword : t.access.noPassword}
          </label>
        </div>
        {passwordChoice === "set" && (
          <Field hint={t.access.passwordHint} label={t.access.newPassword}>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete='off'
                maxLength={100}
                minLength={4}
                onChange={(event) => setPassword(event.target.value)}
                required
                shown
                spellCheck={false}
                value={password}
              />
            )}
          </Field>
        )}
      </fieldset>

      <fieldset className='space-y-2 border-t pt-4'>
        <legend className='sr-only'>{t.access.expiryLegend}</legend>
        <Field hint={t.access.expiryHint(organization().timeZone)} label={t.access.expiresAt}>
          {(props) => (
            <input
              {...props}
              onChange={(event) => setExpiry(event.target.value)}
              type='datetime-local'
              value={expiry}
            />
          )}
        </Field>
        {expiry && (
          <button
            className='font-medium text-primary text-sm underline-offset-4 hover:underline'
            onClick={() => setExpiry("")}
            type='button'
          >
            {t.access.removeExpiry}
          </button>
        )}
      </fieldset>

      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>{t.common.cancel}</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? t.common.saving : t.common.save}
        </Button>
      </div>
    </form>
  );
};

export { AccessForm, isPast };
