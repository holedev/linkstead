import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Layout } from "./layout";
import { AdminPage } from "./pages/admin";
import { KeysPage } from "./pages/keys";
import { LinksPage } from "./pages/links";
import { LoginPage } from "./pages/login";
import { LogoPage } from "./pages/logo";
import { MembersPage } from "./pages/members";
import { SetupPage } from "./pages/setup";
import { SessionProvider, useSession } from "./session";
import "./styles.css";

/** Everything behind sign-in. While the first answer is on its way it shows nothing, not the login form. */
const SignedIn = () => {
  const { me } = useSession();
  if (me === undefined) {
    return <p className='p-6 text-muted'>Đang tải...</p>;
  }
  return me ? <Layout /> : <Navigate replace to='/login' />;
};

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <SessionProvider>
        <BrowserRouter basename='/app'>
          <Routes>
            <Route element={<LoginPage />} path='/login' />
            <Route element={<SetupPage />} path='/setup' />
            <Route element={<SignedIn />}>
              <Route element={<LinksPage />} index />
              <Route element={<MembersPage />} path='/members' />
              <Route element={<KeysPage />} path='/keys' />
              <Route element={<LogoPage />} path='/logo' />
              <Route element={<AdminPage />} path='/admin' />
            </Route>
            <Route element={<Navigate replace to='/' />} path='*' />
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </StrictMode>
  );
}
