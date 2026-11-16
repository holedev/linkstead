import { type FormEvent, useState } from "react";
import { Navigate } from "react-router";
import { Button, Card, ErrorText, Field } from "@/components/app";
import { api } from "../api";
import { messageOf } from "../messages";
import { useSession } from "../session";

const LoginPage = () => {
  const { me, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    <main className='mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 py-10'>
      <div>
        <h1 className='font-semibold text-2xl text-primary'>OU Link</h1>
        <p className='text-muted-foreground text-sm'>Link và mã QR của Trường Đại học Mở Thành phố Hồ Chí Minh</p>
      </div>
      <Card>
        <form className='space-y-4' onSubmit={submit}>
          <Field label='Email'>
            {(props) => (
              <input
                {...props}
                autoComplete='username'
                onChange={(event) => setEmail(event.target.value)}
                placeholder='ten@ou.edu.vn'
                required
                type='email'
                value={email}
              />
            )}
          </Field>
          <Field label='Mật khẩu'>
            {(props) => (
              <input
                {...props}
                autoComplete='current-password'
                onChange={(event) => setPassword(event.target.value)}
                required
                type='password'
                value={password}
              />
            )}
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button className='w-full' disabled={busy} type='submit' variant='primary'>
            {busy ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>
      </Card>
      <p className='text-muted-foreground text-sm'>
        Chưa có tài khoản hoặc quên mật khẩu? Hãy nhờ Quản lý đơn vị của bạn cấp đường dẫn đặt mật khẩu.
      </p>
    </main>
  );
};

export { LoginPage };
