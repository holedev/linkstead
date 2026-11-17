import { raw } from "hono/html";
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

const LockIcon = () => (
  <Icon size={24}>
    <rect height='11' rx='2' width='18' x='3' y='11' />
    <path d='M7 11V7a5 5 0 0 1 10 0v4' />
  </Icon>
);

const PasswordPage = ({ url, state }: { url: string; state: PasswordState }) => (
  <VisitorPage
    description='Liên kết này cần mật khẩu. This link needs a password.'
    head={<style>{raw(STYLE)}</style>}
    title='Cần mật khẩu - OU Link'
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
          <label>
            <span class='label'>Mật khẩu · Password</span>
            <input autocomplete='current-password' autofocus maxlength={100} name='password' required type='password' />
          </label>
          <button class='btn primary' type='submit'>
            Mở liên kết · Open
            <ArrowRightIcon />
          </button>
        </form>
      </section>
    </main>
    <Footer />
  </VisitorPage>
);

export { PasswordPage, type PasswordState };
