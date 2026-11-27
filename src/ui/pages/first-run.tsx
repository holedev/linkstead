import { type FormEvent, useState } from "react";
import { Button, Card, ErrorText, Field, PasswordInput, SignInFrame } from "@/components/app";
import type { Language } from "../../domain/organization";
import { checkNewPassword } from "../../domain/password";
import { ApiFailure, api } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";
import { organization } from "../organization";
import { LANGUAGE_NAMES, TimeZoneInput } from "./settings";

const LIST_BREAKS = /[\s,;]+/;

/** The zone of the browser the installation is being set up from: usually the Organization's. */
const browserZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
};

/**
 * What a fresh installation shows instead of signing in, until it has a System Administrator: the
 * setup code from the deploy, the first administrator's email and password, and who the
 * Organization is. Done, the session has started and the page reloads in the chosen language.
 */
const FirstRunPage = ({ secretSet }: { secretSet: boolean }) => {
  const t = text().firstRun;
  const [secret, setSecret] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>(organization().language);
  const [timeZone, setTimeZone] = useState(browserZone);
  const [domains, setDomains] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== repeat) {
      setError(text().setup.mismatch);
      return;
    }
    // Checked here because only the browser ever sees the password itself.
    if (checkNewPassword(password)) {
      setError(text().setup.tooShort);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.bootstrap(secret.trim(), {
        email,
        emailDomains: domains.split(LIST_BREAKS).filter(Boolean),
        language,
        name,
        password,
        timeZone
      });
      window.location.assign("/app/");
    } catch (failure) {
      setError(failure instanceof ApiFailure && failure.code === "forbidden" ? t.wrongSecret : messageOf(failure));
      setBusy(false);
    }
  };

  if (!secretSet) {
    return (
      <SignInFrame title={t.title}>
        <Card>
          <p className='text-sm'>{t.noSecret}</p>
        </Card>
      </SignInFrame>
    );
  }

  return (
    <SignInFrame title={t.title}>
      <p className='text-muted-foreground text-sm'>{t.lead}</p>
      <Card>
        <form className='space-y-4' onSubmit={submit}>
          <Field hint={t.secretHint} label={t.secret}>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete='off'
                onChange={(event) => setSecret(event.target.value)}
                required
                spellCheck={false}
                value={secret}
              />
            )}
          </Field>
          <Field hint={t.emailHint} label={t.email}>
            {(props) => (
              <input
                {...props}
                autoComplete='username'
                onChange={(event) => setEmail(event.target.value)}
                placeholder='name@example.org'
                required
                type='email'
                value={email}
              />
            )}
          </Field>
          <Field hint={text().setup.minLength} label={text().setup.newPassword}>
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
          <Field label={text().setup.repeat}>
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

          <h2 className='border-t pt-4 font-semibold'>{t.organization}</h2>
          <Field label={t.organizationName}>
            {(props) => (
              <input
                {...props}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder='Example University'
                required
                value={name}
              />
            )}
          </Field>
          <Field hint={text().settings.languageHint} label={text().settings.language}>
            {(props) => (
              <select {...props} onChange={(event) => setLanguage(event.target.value as Language)} value={language}>
                {Object.entries(LANGUAGE_NAMES).map(([value, label]) => (
                  <option key={value} lang={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field hint={text().settings.timeZoneHint} label={text().settings.timeZone}>
            {(props) => <TimeZoneInput {...props} onChange={setTimeZone} value={timeZone} />}
          </Field>
          <Field hint={t.domainsHint} label={t.domains}>
            {(props) => (
              <textarea
                {...props}
                autoCapitalize='none'
                onChange={(event) => setDomains(event.target.value)}
                placeholder='example.org'
                rows={2}
                spellCheck={false}
                value={domains}
              />
            )}
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button className='w-full' disabled={busy} type='submit' variant='primary'>
            {busy ? text().common.saving : t.submit}
          </Button>
        </form>
      </Card>
    </SignInFrame>
  );
};

export { FirstRunPage };
