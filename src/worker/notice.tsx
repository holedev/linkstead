import { raw } from "hono/html";
import { ArrowRightIcon, Footer, Icon, TopBand, VisitorPage } from "./visitor-page";

/**
 * The pages a visitor can meet instead of a redirect. Vietnamese and English on the same
 * page: whoever scans a QR on a conference poster may read neither the other. Each says which
 * address was opened and what OU Link is, and offers the introduction - but never sends the
 * visitor there by itself: an unknown, switched-off or deleted Link does not fall back to a home
 * page. A Link whose Đích the daily check found unsafe warns, and leaves going on to the visitor.
 */

type NoticeKind = "unknown" | "disabled" | "deleted" | "expired" | "unsafe";

const TEXT: Record<
  NoticeKind,
  { title: string; titleEn: string; vi: string; en: string; advice: string; adviceEn: string }
> = {
  deleted: {
    advice:
      "Đơn vị phát hành đã xóa liên kết này. Nếu bạn cần nội dung của nó, hãy liên hệ đơn vị đã in hoặc gửi liên kết cho bạn.",
    adviceEn: "The unit that published it has deleted it. If you need its content, please contact them.",
    en: "This link has been deleted and no longer leads anywhere.",
    title: "Liên kết đã bị xóa",
    titleEn: "This link was deleted",
    vi: "Liên kết này đã bị xóa và không còn dẫn tới đâu."
  },
  disabled: {
    advice:
      "Đơn vị phát hành đã tắt liên kết này. Nếu bạn cần nội dung của nó, hãy liên hệ đơn vị đã in hoặc gửi liên kết cho bạn.",
    adviceEn: "The unit that published it has switched it off. If you need its content, please contact them.",
    en: "This link has been switched off and no longer leads anywhere.",
    title: "Liên kết đã bị tắt",
    titleEn: "This link is switched off",
    vi: "Liên kết này đã bị tắt và hiện không dẫn tới đâu."
  },
  expired: {
    advice:
      "Liên kết chỉ dùng được đến một ngày do đơn vị phát hành đặt. Nếu bạn vẫn cần nó, hãy liên hệ đơn vị đã in hoặc gửi liên kết cho bạn.",
    adviceEn: "It could only be used until a date its publisher set. If you still need it, please contact them.",
    en: "This link has expired and no longer leads anywhere.",
    title: "Liên kết đã hết hạn",
    titleEn: "This link has expired",
    vi: "Liên kết này đã hết hạn và hiện không dẫn tới đâu."
  },
  unknown: {
    advice:
      "Hãy kiểm tra lại từng ký tự, nhất là các chữ dễ nhầm như 0 và o, 1 và l. Nếu bạn quét từ một ấn phẩm, hãy báo cho đơn vị đã phát hành ấn phẩm đó.",
    adviceEn: "Check each character, especially look-alikes such as 0 and o, 1 and l.",
    en: "This link does not exist. Please check the address you typed or scanned.",
    title: "Không tìm thấy liên kết",
    titleEn: "Link not found",
    vi: "Liên kết này không tồn tại. Vui lòng kiểm tra lại địa chỉ bạn đã gõ hoặc quét."
  },
  unsafe: {
    advice:
      "Liên kết đã được đánh dấu để đơn vị quản lý kiểm tra. Chỉ tiếp tục nếu bạn tin trang này, và đừng nhập mật khẩu hay thông tin cá nhân ở đó.",
    adviceEn: "Only go on if you trust this page, and do not enter a password or personal details there.",
    en: "Google Safe Browsing lists the page this link leads to as possibly harmful - phishing or malware.",
    title: "Trang đích có thể không an toàn",
    titleEn: "The destination may be unsafe",
    vi: "Google Safe Browsing xếp trang mà liên kết này dẫn tới vào danh sách có thể gây hại - lừa đảo hoặc mã độc."
  }
};

const STYLE = `
.notice{max-width:38rem;margin:6vh auto 0;padding:1.75rem}
.badge{display:grid;place-items:center;width:3rem;height:3rem;margin-bottom:1.1rem;border-radius:.9rem;background:var(--warn-soft);color:var(--warn)}
.notice h1{font-size:1.5rem;line-height:1.3}
.notice .sub{margin-top:.15rem}
.notice .stack>*+*{margin-top:1rem}
.danger{background:var(--danger-soft);color:var(--danger)}
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

const DeletedIcon = () => (
  <Icon size={24}>
    <path d='M3 6h18' />
    <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' />
    <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
  </Icon>
);

const ExpiredIcon = () => (
  <Icon size={24}>
    <circle cx='12' cy='12' r='9' />
    <path d='M12 7v5l3 2' />
  </Icon>
);

const WarningIcon = () => (
  <Icon size={24}>
    <path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' />
    <path d='M12 9v4' />
    <path d='M12 17h.01' />
  </Icon>
);

const ICONS: Record<NoticeKind, () => unknown> = {
  deleted: () => <DeletedIcon />,
  disabled: () => <DisabledIcon />,
  expired: () => <ExpiredIcon />,
  unknown: () => <UnknownIcon />,
  unsafe: () => <WarningIcon />
};

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

/** Going on anyway, for the one kind that allows it: the Đích shown in full, never a hidden hop. */
const GoOn = ({ target }: { target: string }) => (
  <div>
    <span class='label'>Trang đích · Destination</span>
    <code class='address'>{target}</code>
    <p style='margin-top:.6rem'>
      <a href={target} rel='noreferrer nofollow'>
        Tôi hiểu rủi ro, vẫn tiếp tục · Continue anyway
      </a>
    </p>
  </div>
);

const Notice = ({ kind, url, target }: { kind: NoticeKind; url: string; target?: string }) => {
  const text = TEXT[kind];
  return (
    <VisitorPage
      description={`${text.title} - OU Link, ${text.titleEn}`}
      head={<style>{raw(STYLE)}</style>}
      title={`${text.title} - OU Link`}
    >
      <TopBand />
      <main class='wrap'>
        <section class='card notice'>
          <div class={kind === "unsafe" ? "badge danger" : "badge"}>{ICONS[kind]()}</div>
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
            {kind === "unsafe" && target ? <GoOn target={target} /> : null}
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

export { Notice, type NoticeKind, shownAddress };
