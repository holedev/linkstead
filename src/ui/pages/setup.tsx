import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { checkNewPassword } from "../../domain/password";
import { api } from "../api";
import { Button, Card, ErrorText, Field } from "../components";
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
      setError("Hai lần nhập mật khẩu không giống nhau.");
      return;
    }
    // Checked here because only the browser ever sees the password itself.
    if (checkNewPassword(password)) {
      setError("Mật khẩu phải có ít nhất 12 ký tự.");
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
    <main className='mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 py-10'>
      <h1 className='font-semibold text-2xl text-brand'>Đặt mật khẩu</h1>
      <Card>
        {done ? (
          <div className='space-y-4'>
            <p>Đã đặt mật khẩu. Đường dẫn vừa dùng không còn hiệu lực.</p>
            <Link className='font-medium text-brand underline' to='/login'>
              Đến trang đăng nhập
            </Link>
          </div>
        ) : (
          <form className='space-y-4' onSubmit={submit}>
            {email && (
              <p className='text-sm'>
                Đặt mật khẩu cho tài khoản <strong className='break-all'>{email}</strong>.
              </p>
            )}
            {/* Lets a password manager file the new password under the right account. */}
            <input autoComplete='username' hidden readOnly type='email' value={email} />
            <Field hint='Ít nhất 12 ký tự.' label='Mật khẩu mới'>
              {(props) => (
                <input
                  {...props}
                  autoComplete='new-password'
                  minLength={12}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type='password'
                  value={password}
                />
              )}
            </Field>
            <Field label='Nhập lại mật khẩu'>
              {(props) => (
                <input
                  {...props}
                  autoComplete='new-password'
                  onChange={(event) => setRepeat(event.target.value)}
                  required
                  type='password'
                  value={repeat}
                />
              )}
            </Field>
            <ErrorText>{token ? error : "Đường dẫn này thiếu mã. Hãy mở lại đúng đường dẫn bạn được gửi."}</ErrorText>
            <Button className='w-full' disabled={busy || !(token && email)} type='submit' variant='primary'>
              {busy ? "Đang lưu..." : "Đặt mật khẩu"}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
};

export { SetupPage };
