import { raw } from "hono/html";
import type { Child } from "hono/jsx";

/**
 * The frame of the pages a visitor meets without signing in: the introduction at `/` and the
 * notice for a Link that does not answer. Server-rendered, no script, styles inline - each is one
 * response and must show even when nothing else on the site loads.
 */

/** Where the UI's build puts the university's files (`src/ui/public/brand`). */
const BRAND = "/app/brand";

const VIETNAMESE =
  "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB";
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

/**
 * Be Vietnam Pro from this site, as the admin UI has it: nothing about a visitor goes to another
 * site to draw the page. `swap`: the text shows at once in the system's font and changes when the
 * font arrives, so a slow phone still reads the notice straight away.
 */
const FONTS = [400, 600, 700]
  .flatMap((weight) =>
    (
      [
        ["vietnamese", VIETNAMESE],
        ["latin", LATIN]
      ] as const
    ).map(
      ([subset, range]) =>
        `@font-face{font-family:"Be Vietnam Pro";font-style:normal;font-display:swap;font-weight:${weight};src:url(${BRAND}/fonts/be-vietnam-pro-${subset}-${weight}.woff2) format("woff2");unicode-range:${range}}`
    )
  )
  .join("\n");

const STYLE = `
${FONTS}
:root{--bg:#f5f7fb;--surface:#fff;--text:#0f1b2d;--muted:#5a6a80;--border:#e1e7ef;--brand:#114fa0;--band:#114fa0;--brand-ink:#fff;--brand-soft:#e7eef8;--warn:#a1520a;--warn-soft:#fdf1dc;--danger:#b42318;--danger-soft:#fde8e6;--code:#eef2f7;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--surface:#111a2b;--text:#e6ecf5;--muted:#9babc0;--border:#223049;--brand:#82abff;--band:#0d3b78;--brand-ink:#0b1220;--brand-soft:#16264a;--warn:#f6c063;--warn-soft:#33260c;--danger:#ff8a80;--danger-soft:#3a1614;--code:#0d1626;color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);font:16px/1.6 "Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--brand)}
h1,h2,h3,p{margin:0}
main{flex:1}
.wrap{width:100%;max-width:68rem;margin:0 auto;padding:0 1rem}
.band{background:var(--band);color:#fff;margin-bottom:1.5rem}
.top{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.85rem 1rem}
.brand{display:flex;align-items:center;gap:.85rem;min-width:0;color:inherit;text-decoration:none;border-radius:.4rem}
.brand img{display:block;height:2.25rem;width:auto;max-width:100%}
.brand b{flex:none;padding-left:.85rem;border-left:1px solid rgb(255 255 255 / .35);font-size:1rem;font-weight:600;line-height:1.2;white-space:nowrap}
@media (max-width:30rem){.brand img{height:1.85rem}.brand b{display:none}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;padding:.6rem 1rem;border:1px solid var(--border);border-radius:.65rem;background:var(--surface);color:var(--text);font-weight:600;font-size:.95rem;line-height:1.2;text-decoration:none;white-space:nowrap}
.btn:hover{border-color:var(--brand)}
.btn.primary{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.btn.primary:hover{filter:brightness(1.08)}
.band .btn.primary{background:#fff;border-color:#fff;color:#114fa0}
.btn:focus-visible,.brand:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 45%,transparent);outline-offset:2px}
.band .btn:focus-visible,.band .brand:focus-visible{outline-color:rgb(255 255 255 / .7)}
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

/**
 * The top of every visitor page: the university's logo, white on its blue, and the system's name.
 * `children` sits on the right - the way in, on the introduction.
 */
const TopBand = ({ children }: { children?: Child }) => (
  <header class='band'>
    <div class='wrap top'>
      <a class='brand' href='/'>
        <img alt={UNIVERSITY} height='69' src={`${BRAND}/logo-ou-white.avif`} width='384' />
        <b>OU Link</b>
      </a>
      {children}
    </div>
  </header>
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
      <meta content='#114fa0' name='theme-color' />
      <link href={`${BRAND}/logo-ou.png`} rel='icon' type='image/png' />
      <title>{title}</title>
      <style>{raw(STYLE)}</style>
      {head}
    </head>
    <body>{children}</body>
  </html>
);

export { ArrowRightIcon, Footer, Icon, LinkIcon, TopBand, UNIVERSITY, VisitorPage };
