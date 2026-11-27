import { type FormEvent, useState } from "react";
import { Navigate } from "react-router";
import { Button, Card, ErrorText, Field, PasswordInput, SignInFrame } from "@/components/app";
import { api } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";
import { exampleEmail } from "../organization";
import { useSession } from "../session";

const LoginPage = () => {
  const { me, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const t = text().login;

  if (me) {
    return <Navigate replace to='/' />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(email, password);
      await refresh();
    } catch (failure) {
      setError(messageOf(failure));
    }
    setBusy(false);
  };

  return (
    <SignInFrame title={t.title}>
      <Card>
        <form className='space-y-4' onSubmit={submit}>
          <Field label={t.email}>
            {(props) => (
              <input
                {...props}
                autoComplete='username'
                onChange={(event) => setEmail(event.target.value)}
                placeholder={exampleEmail()}
                required
                type='email'
                value={email}
              />
            )}
          </Field>
          <Field label={t.password}>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete='current-password'
                onChange={(event) => setPassword(event.target.value)}
                required
                value={password}
              />
            )}
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button className='w-full' disabled={busy} type='submit' variant='primary'>
            {busy ? t.signingIn : t.signIn}
          </Button>
        </form>
      </Card>
      <p className='text-muted-foreground text-sm'>{t.noAccount}</p>
    </SignInFrame>
  );
};

export { LoginPage };
