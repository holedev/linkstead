import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Layout } from "./layout";
import {
  AdminAdminsPage,
  AdminCodesPage,
  AdminExportPage,
  AdminLinksPage,
  AdminLogoPage,
  AdminUnitPage,
  AdminUnitsPage,
  SystemAdminOnly
} from "./pages/admin";
import { ApiDocsPage } from "./pages/api-docs";
import { KeysPage } from "./pages/keys";
import { LinkDetailPage } from "./pages/link-detail";
import { LinksPage } from "./pages/links";
import { LoginPage } from "./pages/login";
import { LogoPage } from "./pages/logo";
import { MembersPage } from "./pages/members";
import { SetupPage } from "./pages/setup";
import { StatsPage } from "./pages/stats";
import { SessionProvider, useSession } from "./session";
import "./styles.css";

/** Everything behind sign-in. While the first answer is on its way it shows nothing, not the login form. */
const SignedIn = () => {
  const { me } = useSession();
  if (me === undefined) {
    return <p className='p-6 text-muted-foreground'>Đang tải...</p>;
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
            {/* Open to anyone: a developer holding a Khóa API may have no account. */}
            <Route element={<ApiDocsPage />} path='/api-docs' />
            <Route element={<SignedIn />}>
              <Route element={<LinksPage />} index />
              <Route element={<LinkDetailPage />} path='/links/:code' />
              <Route element={<StatsPage />} path='/stats' />
              <Route element={<MembersPage />} path='/members' />
              <Route element={<KeysPage />} path='/keys' />
              <Route element={<LogoPage />} path='/logo' />
              <Route element={<SystemAdminOnly />} path='/admin'>
                <Route element={<Navigate replace to='/admin/links' />} index />
                <Route element={<AdminLinksPage />} path='links' />
                <Route element={<AdminUnitsPage />} path='units' />
                <Route element={<AdminUnitPage />} path='units/:unitId' />
                <Route element={<AdminAdminsPage />} path='admins' />
                <Route element={<AdminCodesPage />} path='codes' />
                <Route element={<AdminLogoPage />} path='logo' />
                <Route element={<AdminExportPage />} path='export' />
              </Route>
            </Route>
            <Route element={<Navigate replace to='/' />} path='*' />
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </StrictMode>
  );
}
