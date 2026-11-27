import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router";
import { text } from "./i18n";
import { Layout } from "./layout";
import { ApiDocsPage } from "./pages/api-docs";
import { KeysPage } from "./pages/keys";
import { LinkDetailPage } from "./pages/link-detail";
import { LinksPage } from "./pages/links";
import { LoginPage } from "./pages/login";
import { LogoPage } from "./pages/logo";
import { MembersPage } from "./pages/members";
import { SetupPage } from "./pages/setup";
import { type SetupSection, setupSearch } from "./pages/setup-address";
import { StatsPage } from "./pages/stats";
import { SessionProvider, useSession } from "./session";

/**
 * Where the system-wide screens were before they moved into the System Administration dialog,
 * kept for bookmarks and old links.
 */
const MOVED_TO_SETUP: [path: string, section: SetupSection][] = [
  ["links", "links"],
  ["units", "units"],
  ["settings", "organization"],
  ["logo", "qr-logo"],
  ["admins", "admins"],
  ["codes", "codes"],
  ["export", "export"]
];

/** A Unit's old page, `/admin/units/:unitId`, now opened in the dialog. */
const MovedUnit = () => {
  const unitId = Number(useParams().unitId);
  return <Navigate replace to={`/${setupSearch("units", Number.isInteger(unitId) ? unitId : undefined)}`} />;
};

/** Everything behind sign-in. While the first answer is on its way it shows nothing, not the login form. */
const SignedIn = () => {
  const { me } = useSession();
  if (me === undefined) {
    return <p className='p-6 text-muted-foreground'>{text().common.loading}</p>;
  }
  return me ? <Layout /> : <Navigate replace to='/login' />;
};

/** The screens, drawn once `main.tsx` has learned the Organization's language. */
const renderApp = () => {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }
  createRoot(root).render(
    <StrictMode>
      <SessionProvider>
        <BrowserRouter basename='/app'>
          <Routes>
            <Route element={<LoginPage />} path='/login' />
            <Route element={<SetupPage />} path='/setup' />
            {/* Open to anyone: a developer holding an API Key may have no account. */}
            <Route element={<ApiDocsPage />} path='/api-docs' />
            <Route element={<SignedIn />}>
              <Route element={<LinksPage />} index />
              <Route element={<LinkDetailPage />} path='/links/:code' />
              <Route element={<StatsPage />} path='/stats' />
              <Route element={<MembersPage />} path='/members' />
              <Route element={<KeysPage />} path='/keys' />
              <Route element={<LogoPage />} path='/logo' />
              <Route path='/admin'>
                <Route element={<Navigate replace to={`/${setupSearch("organization")}`} />} index />
                {MOVED_TO_SETUP.map(([path, section]) => (
                  <Route element={<Navigate replace to={`/${setupSearch(section)}`} />} key={path} path={path} />
                ))}
                <Route element={<MovedUnit />} path='units/:unitId' />
              </Route>
            </Route>
            <Route element={<Navigate replace to='/' />} path='*' />
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </StrictMode>
  );
};

export { renderApp };
