import { raw } from "hono/html";
import type { Child } from "hono/jsx";

/**
 * The frame of the pages a visitor meets without signing in: the introduction at `/` and the
 * notice for a Link that does not answer. Server-rendered, no script, styles inline - each is one
 * response and must show even when nothing else on the site loads.
 */

const STYLE = `
:root{--bg:#f5f7fb;--surface:#fff;--text:#0f1b2d;--muted:#5a6a80;--border:#e1e7ef;--brand:#1f4fa3;--brand-ink:#fff;--brand-soft:#e9f0fb;--warn:#a1520a;--warn-soft:#fdf1dc;--danger:#b42318;--danger-soft:#fde8e6;--code:#eef2f7;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--surface:#111a2b;--text:#e6ecf5;--muted:#9babc0;--border:#223049;--brand:#82abff;--brand-ink:#0b1220;--brand-soft:#16264a;--warn:#f6c063;--warn-soft:#33260c;--danger:#ff8a80;--danger-soft:#3a1614;--code:#0d1626;color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--brand)}
h1,h2,h3,p{margin:0}
main{flex:1}
.wrap{width:100%;max-width:68rem;margin:0 auto;padding:0 1rem}
.top{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 0}
.brand{display:flex;align-items:center;gap:.65rem;min-width:0;color:inherit;text-decoration:none}
.mark{flex:none;display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:.65rem;background:var(--brand);color:var(--brand-ink)}
.brand b{display:block;font-size:1rem;line-height:1.2}
.brand small{display:block;overflow:hidden;color:var(--muted);font-size:.75rem;line-height:1.3;white-space:nowrap;text-overflow:ellipsis}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;padding:.6rem 1rem;border:1px solid var(--border);border-radius:.65rem;background:var(--surface);color:var(--text);font-weight:600;font-size:.95rem;line-height:1.2;text-decoration:none;white-space:nowrap}
.btn:hover{border-color:var(--brand)}
.btn.primary{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.btn.primary:hover{filter:brightness(1.08)}
.btn:focus-visible,.brand:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 45%,transparent);outline-offset:2px}
.actions{display:flex;flex-wrap:wrap;gap:.6rem}
.muted{color:var(--muted)}
.en{color:var(--muted);font-size:.95em}
.card{border:1px solid var(--border);border-radius:1rem;background:var(--surface)}
.address{display:block;overflow-wrap:anywhere;padding:.7rem .9rem;border-radius:.6rem;background:var(--code);font:500 .95rem/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.label{display:block;margin-bottom:.35rem;color:var(--muted);font-size:.75rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.foot{padding:2rem 0;color:var(--muted);font-size:.85rem}
.foot .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem 1.5rem}
.foot a{color:inherit}
`;

/** A line icon, drawn the way the admin UI's icons are. */
const Icon = ({ children, size = 20 }: { children: Child; size?: number }) => (
  <svg
    aria-hidden='true'
    fill='none'
    height={size}
    stroke='currentColor'
    stroke-linecap='round'
    stroke-linejoin='round'
    stroke-width='2'
    viewBox='0 0 24 24'
    width={size}
  >
    {children}
  </svg>
);

const LinkIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' />
    <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' />
  </Icon>
);

const ArrowRightIcon = () => (
  <Icon size={18}>
    <path d='M5 12h14' />
    <path d='m12 5 7 7-7 7' />
  </Icon>
);

/** The university, as every visitor page names it. */
const UNIVERSITY = "Trường Đại học Mở Thành phố Hồ Chí Minh";

const Brand = () => (
  <a class='brand' href='/'>
    <span class='mark'>
      <LinkIcon />
    </span>
    <span style='min-width:0'>
      <b>OU Link</b>
      <small>{UNIVERSITY}</small>
    </span>
  </a>
);

const Footer = () => (
  <footer class='foot'>
    <div class='wrap'>
      <span>© {UNIVERSITY}</span>
      <span>
        <a href='https://ou.edu.vn/'>ou.edu.vn</a>
      </span>
    </div>
  </footer>
);

const VisitorPage = ({
  title,
  description,
  indexable = false,
  head,
  children
}: {
  title: string;
  description: string;
  /** The introduction may be found by a search engine; a notice never is. */
  indexable?: boolean;
  head?: Child;
  children: Child;
}) => (
  <html lang='vi'>
    <head>
      <meta charset='utf-8' />
      <meta content='width=device-width, initial-scale=1' name='viewport' />
      {indexable ? null : <meta content='noindex' name='robots' />}
      <meta content={description} name='description' />
      <meta content='#1f4fa3' name='theme-color' />
      <title>{title}</title>
      <style>{raw(STYLE)}</style>
      {head}
    </head>
    <body>{children}</body>
  </html>
);

export { ArrowRightIcon, Brand, Footer, Icon, LinkIcon, UNIVERSITY, VisitorPage };
