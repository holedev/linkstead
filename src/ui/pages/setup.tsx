import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { Button, Card, ErrorText, Field, PasswordInput, SignInFrame } from "@/components/app";
import { checkNewPassword } from "../../domain/password";
import { api } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";

/**
 * Where a one-time link lands. The token is read once and then taken out of the address bar, so
 * it does not sit in the browser's history or get copied along with the address.
 */
const SetupPage = () => {
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Whose password this is: shown so nobody sets it for the wrong account, and needed to stretch it.
  const [email, setEmail] = useState("");
  const t = text().setup;

  // biome-ignore lint/correctness/useExhaustiveDependencies: asked once, with the token the page opened with
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
    if (token) {
      api
        .setupAccount(token)
        .then((account) => setEmail(account.email))
        .catch((failure) => setError(messageOf(failure)));
    }
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== repeat) {
      setError(t.mismatch);
      return;
    }
    // Checked here because only the browser ever sees the password itself.
    if (checkNewPassword(password)) {
      setError(t.tooShort);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.setPassword(token, email, password);
      setDone(true);
    } catch (failure) {
      setError(messageOf(failure));
    }
    setBusy(false);
  };

  return (
    <SignInFrame title={t.title}>
      <Card>
        {done ? (
          <div className='space-y-4'>
            <p>{t.done}</p>
            <Link className='font-medium text-primary underline' to='/login'>
              {t.toLogin}
            </Link>
          </div>
        ) : (
          <form className='space-y-4' onSubmit={submit}>
            {email && (
              <p className='text-sm'>
                {t.forAccount} <strong className='break-all'>{email}</strong>.
              </p>
            )}
            {/* Lets a password manager file the new password under the right account. */}
            <input autoComplete='username' hidden readOnly type='email' value={email} />
            <Field hint={t.minLength} label={t.newPassword}>
              {(props) => (
                <PasswordInput
                  {...props}
                  autoComplete='new-password'
                  minLength={12}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  value={password}
                />
              )}
            </Field>
            <Field label={t.repeat}>
              {(props) => (
                <PasswordInput
                  {...props}
                  autoComplete='new-password'
                  onChange={(event) => setRepeat(event.target.value)}
                  required
                  value={repeat}
                />
              )}
            </Field>
            <ErrorText>{token ? error : t.missingToken}</ErrorText>
            <Button className='w-full' disabled={busy || !(token && email)} type='submit' variant='primary'>
              {busy ? text().common.saving : t.submit}
            </Button>
          </form>
        )}
      </Card>
    </SignInFrame>
  );
};

export { SetupPage };
