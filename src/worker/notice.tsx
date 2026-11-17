import { raw } from "hono/html";
import { ArrowRightIcon, Brand, Footer, Icon, VisitorPage } from "./visitor-page";

/**
 * The two pages a visitor can meet instead of a redirect. Vietnamese and English on the same
 * page: whoever scans a QR on a conference poster may read neither the other. Each says which
 * address was opened and what OU Link is, and offers the introduction - but never sends the
 * visitor there by itself: an unknown or switched-off Link does not fall back to a home page.
 */

type NoticeKind = "unknown" | "disabled";

const TEXT: Record<
  NoticeKind,
  { title: string; titleEn: string; vi: string; en: string; advice: string; adviceEn: string }
> = {
  disabled: {
    advice:
      "Đơn vị phát hành đã tắt liên kết này. Nếu bạn cần nội dung của nó, hãy liên hệ đơn vị đã in hoặc gửi liên kết cho bạn.",
    adviceEn: "The unit that published it has switched it off. If you need its content, please contact them.",
    en: "This link has been switched off and no longer leads anywhere.",
    title: "Liên kết đã bị tắt",
    titleEn: "This link is switched off",
    vi: "Liên kết này đã bị tắt và hiện không dẫn tới đâu."
  },
  unknown: {
    advice:
      "Hãy kiểm tra lại từng ký tự, nhất là các chữ dễ nhầm như 0 và o, 1 và l. Nếu bạn quét từ một ấn phẩm, hãy báo cho đơn vị đã phát hành ấn phẩm đó.",
    adviceEn: "Check each character, especially look-alikes such as 0 and o, 1 and l.",
    en: "This link does not exist. Please check the address you typed or scanned.",
    title: "Không tìm thấy liên kết",
    titleEn: "Link not found",
    vi: "Liên kết này không tồn tại. Vui lòng kiểm tra lại địa chỉ bạn đã gõ hoặc quét."
  }
};

const STYLE = `
.notice{max-width:38rem;margin:6vh auto 0;padding:1.75rem}
.badge{display:grid;place-items:center;width:3rem;height:3rem;margin-bottom:1.1rem;border-radius:.9rem;background:var(--warn-soft);color:var(--warn)}
.notice h1{font-size:1.5rem;line-height:1.3}
.notice .sub{margin-top:.15rem}
.notice .stack>*+*{margin-top:1rem}
.hint{padding:.85rem 1rem;border-left:3px solid var(--warn);border-radius:.4rem;background:var(--warn-soft);font-size:.92rem}
.about{display:flex;gap:.8rem;max-width:38rem;margin:1rem auto 0;padding:1rem 1.25rem;font-size:.92rem}
.about b{display:block}
@media (max-width:30rem){.notice{margin-top:2vh;padding:1.25rem}.notice .actions .btn{flex:1}}
`;

const UnknownIcon = () => (
  <Icon size={24}>
    <circle cx='11' cy='11' r='8' />
    <path d='m21 21-4.3-4.3' />
    <path d='m13.5 8.5-5 5' />
    <path d='m8.5 8.5 5 5' />
  </Icon>
);

const DisabledIcon = () => (
  <Icon size={24}>
    <path d='M18.36 6.64A9 9 0 0 1 20.77 15' />
    <path d='M6.16 6.16a9 9 0 1 0 12.68 12.68' />
    <path d='M12 2v4' />
    <path d='m2 2 20 20' />
  </Icon>
);

/** What fits on a phone: an address past this is cut, and is wrong anyway. */
const MAX_SHOWN = 80;

/**
 * The address as the visitor would recognise it: the host and the path, with %-escapes decoded so
 * "/hội-thảo" reads as typed. Only ever rendered as text, so whatever it holds stays text.
 */
const shownAddress = (url: string): string => {
  const { host, pathname } = new URL(url);
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A broken escape is shown as it came.
  }
  const address = `${host}${path}`;
  return address.length > MAX_SHOWN ? `${address.slice(0, MAX_SHOWN - 1)}…` : address;
};

const Notice = ({ kind, url }: { kind: NoticeKind; url: string }) => {
  const text = TEXT[kind];
  return (
    <VisitorPage
      description={`${text.title} - OU Link, ${text.titleEn}`}
      head={<style>{raw(STYLE)}</style>}
      title={`${text.title} - OU Link`}
    >
      <header class='wrap'>
        <div class='top'>
          <Brand />
        </div>
      </header>
      <main class='wrap'>
        <section class='card notice'>
          <div class='badge'>{kind === "unknown" ? <UnknownIcon /> : <DisabledIcon />}</div>
          <div class='stack'>
            <div>
              <h1>{text.title}</h1>
              <p class='en sub' lang='en'>
                {text.titleEn}
              </p>
            </div>
            <div>
              <span class='label'>Địa chỉ bạn đã mở · Address you opened</span>
              <code class='address'>{shownAddress(url)}</code>
            </div>
            <p>{text.vi}</p>
            <p class='en' lang='en'>
              {text.en}
            </p>
            <div class='hint'>
              <p>{text.advice}</p>
              <p class='en' lang='en'>
                {text.adviceEn}
              </p>
            </div>
            <div class='actions'>
              <a class='btn primary' href='/'>
                Tìm hiểu về OU Link
                <ArrowRightIcon />
              </a>
              <a class='btn' href='https://ou.edu.vn/'>
                Trang chủ của Trường
              </a>
            </div>
          </div>
        </section>
        <aside class='card about'>
          <div>
            <b>OU Link là gì?</b>
            <p class='muted'>
              Hệ thống đường dẫn ngắn và mã QR của Trường Đại học Mở Thành phố Hồ Chí Minh. Mỗi liên kết có dạng{" "}
              <code>{new URL(url).host}/mã</code> và được một đơn vị của Trường quản lý.
            </p>
            <p class='en' lang='en'>
              The university's own short links and QR codes, each managed by one of its units.
            </p>
          </div>
        </aside>
      </main>
      <Footer />
    </VisitorPage>
  );
};

export { Notice, type NoticeKind };
