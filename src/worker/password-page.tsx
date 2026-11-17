import { raw } from "hono/html";
import type { Preview } from "../domain/preview";
import { shownAddress } from "./notice";
import { ArrowRightIcon, Brand, Footer, Icon, VisitorPage } from "./visitor-page";

/**
 * What a visitor meets at a Link with a password (ADR-0006): the address they opened and one field.
 * It says nothing of where the Link leads - not in the page, not in a preview - until the password
 * is given. The form posts back to the Link's own address, which then sends them on.
 */

type PasswordState = "ask" | "wrong" | "too-many";

const STYLE = `
.gate{max-width:28rem;margin:8vh auto 0;padding:1.75rem}
.gate .badge{display:grid;place-items:center;width:3rem;height:3rem;margin-bottom:1.1rem;border-radius:.9rem;background:var(--brand-soft);color:var(--brand)}
.gate h1{font-size:1.4rem;line-height:1.3}
.gate .stack>*+*{margin-top:1rem}
.gate .field{position:relative}
.gate .field input{padding-right:2.9rem}
.gate .eye{position:absolute;top:0;right:0;bottom:0;display:grid;place-items:center;width:2.75rem;border:0;border-radius:0 .6rem .6rem 0;background:none;color:var(--muted);cursor:pointer}
.gate .eye:hover{color:var(--text)}
.gate .eye:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 40%,transparent)}
.gate .eye[aria-pressed="true"] .when-hidden,.gate .eye[aria-pressed="false"] .when-shown{display:none}
.gate input{width:100%;padding:.7rem .85rem;border:1px solid var(--border);border-radius:.6rem;background:var(--surface);color:var(--text);font:inherit}
.gate input:focus{outline:3px solid color-mix(in srgb,var(--brand) 40%,transparent);border-color:var(--brand)}
.gate .btn{width:100%}
.gate .error{padding:.6rem .8rem;border-radius:.5rem;background:var(--danger-soft);color:var(--danger);font-size:.92rem}
@media (max-width:30rem){.gate{margin-top:2vh;padding:1.25rem}}
`;

const ERRORS: Record<Exclude<PasswordState, "ask">, { vi: string; en: string }> = {
  "too-many": {
    en: "Too many wrong tries. Please wait a minute and try again.",
    vi: "Nhập sai quá nhiều lần. Hãy đợi một phút rồi thử lại."
  },
  wrong: { en: "Wrong password.", vi: "Mật khẩu không đúng." }
};

/** Shows and hides what was typed - the page's one piece of script, and it touches nothing else. */
const EYE_SCRIPT = `(()=>{const b=document.querySelector(".eye"),i=document.getElementById("password");if(!b||!i)return;b.hidden=false;b.addEventListener("click",()=>{const s=i.type==="password";i.type=s?"text":"password";b.setAttribute("aria-pressed",String(s));b.setAttribute("aria-label",s?"Ẩn mật khẩu · Hide password":"Hiện mật khẩu · Show password");i.focus();});})();`;

const EyeIcon = () => (
  <Icon size={18}>
    <path d='M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0' />
    <circle cx='12' cy='12' r='3' />
  </Icon>
);

const EyeOffIcon = () => (
  <Icon size={18}>
    <path d='M10.73 5.08A10.43 10.43 0 0 1 12 5c4.67 0 8.44 2.98 9.94 6.65a1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49' />
    <path d='M14.08 14.16a3 3 0 0 1-4.24-4.24' />
    <path d='M17.48 17.5A10.75 10.75 0 0 1 2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14' />
    <path d='m2 2 20 20' />
  </Icon>
);

const LockIcon = () => (
  <Icon size={24}>
    <rect height='11' rx='2' width='18' x='3' y='11' />
    <path d='M7 11V7a5 5 0 0 1 10 0v4' />
  </Icon>
);

/**
 * `preview` is what a chat app shows for the Link: its Đơn vị's own words, or the locked ones
 * (`lockedPreview`) - never the Đích's.
 */
const PasswordPage = ({ url, state, preview }: { url: string; state: PasswordState; preview: Preview }) => (
  <VisitorPage
    description={preview.description}
    head={
      <>
        <meta content='website' property='og:type' />
        <meta content='OU Link - Trường Đại học Mở Thành phố Hồ Chí Minh' property='og:site_name' />
        <meta content={url} property='og:url' />
        <meta content={preview.title} property='og:title' />
        <meta content={preview.description} property='og:description' />
        {preview.image ? <meta content={preview.image} property='og:image' /> : null}
        <meta content={preview.image ? "summary_large_image" : "summary"} name='twitter:card' />
        <style>{raw(STYLE)}</style>
      </>
    }
    title={`${preview.title} - OU Link`}
  >
    <header class='wrap'>
      <div class='top'>
        <Brand />
      </div>
    </header>
    <main class='wrap'>
      <section class='card gate'>
        <div class='badge'>
          <LockIcon />
        </div>
        <form class='stack' method='post'>
          <div>
            <h1>Liên kết cần mật khẩu</h1>
            <p class='en' lang='en'>
              This link needs a password
            </p>
          </div>
          <code class='address'>{shownAddress(url)}</code>
          <p class='muted'>
            Nhập mật khẩu mà đơn vị phát hành đã gửi cho bạn.{" "}
            <span lang='en'>Enter the password its publisher gave you.</span>
          </p>
          {state === "ask" ? null : (
            <p class='error' role='alert'>
              {ERRORS[state].vi} <span lang='en'>{ERRORS[state].en}</span>
            </p>
          )}
          <div>
            <label class='label' for='password'>
              Mật khẩu · Password
            </label>
            <div class='field'>
              <input
                autocomplete='current-password'
                autofocus
                id='password'
                maxlength={100}
                name='password'
                required
                type='password'
              />
              {/* Shown once the script below runs: without it, there is nothing for the eye to do. */}
              <button aria-label='Hiện mật khẩu · Show password' aria-pressed='false' class='eye' hidden type='button'>
                <span class='when-hidden'>
                  <EyeIcon />
                </span>
                <span class='when-shown'>
                  <EyeOffIcon />
                </span>
              </button>
            </div>
          </div>
          <button class='btn primary' type='submit'>
            Mở liên kết · Open
            <ArrowRightIcon />
          </button>
        </form>
      </section>
    </main>
    <Footer />
    <script>{raw(EYE_SCRIPT)}</script>
  </VisitorPage>
);

export { PasswordPage, type PasswordState };
