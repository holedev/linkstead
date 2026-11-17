import { raw } from "hono/html";
import { ArrowRightIcon, Footer, Icon, LinkIcon, TopBand, UNIVERSITY, VisitorPage } from "./visitor-page";

/**
 * What answers at `/`: what OU Link is, for the visitor who trimmed a Link down to its domain and
 * for the colleague who is about to be given an account. Bilingual where a visitor reads it; the
 * part about working with Links is in Vietnamese, as the admin UI is.
 */

const STYLE = `
.hero{display:grid;gap:2.5rem;align-items:center;padding-top:3.5rem;padding-bottom:3rem}
@media (min-width:56rem){.hero{grid-template-columns:1.1fr .9fr;padding-top:5rem;padding-bottom:4rem}}
.eyebrow{display:inline-block;margin-bottom:1rem;padding:.25rem .7rem;border-radius:99rem;background:var(--brand-soft);color:var(--brand);font-size:.8rem;font-weight:600}
.hero h1{font-size:clamp(2rem,5vw,3rem);line-height:1.15;letter-spacing:-.02em}
.hero h1 span{color:var(--brand)}
.lead{margin-top:1.1rem;font-size:1.1rem}
.hero .en{margin-top:.75rem}
.hero .actions{margin-top:1.75rem}
.demo{padding:1.25rem;box-shadow:0 20px 40px -24px rgb(15 27 45 / .35)}
.demo .row{display:flex;align-items:center;gap:.75rem}
.demo .dot{flex:none;display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:.6rem;background:var(--brand-soft);color:var(--brand)}
.demo .grow{min-width:0;flex:1}
.demo .down{display:flex;justify-content:center;padding:.6rem 0;color:var(--muted)}
.demo .was{opacity:.55;text-decoration:line-through}
.demo .tag{flex:none;padding:.1rem .5rem;border-radius:99rem;background:var(--brand-soft);color:var(--brand);font-size:.72rem;font-weight:600}
.demo .note{margin-top:1rem;padding-top:1rem;border-top:1px dashed var(--border);font-size:.88rem}
section.block{padding:3rem 0;border-top:1px solid var(--border)}
.block h2{font-size:1.5rem;line-height:1.3;letter-spacing:-.01em}
.block>.wrap>p{max-width:42rem;margin-top:.5rem}
.steps,.features{display:grid;gap:1rem;margin:1.75rem 0 0;padding:0;list-style:none}
@media (min-width:44rem){.steps{grid-template-columns:repeat(3,1fr)}.features{grid-template-columns:repeat(2,1fr)}}
@media (min-width:62rem){.features{grid-template-columns:repeat(3,1fr)}}
.steps li,.features li{padding:1.25rem}
.num{display:grid;place-items:center;width:2rem;height:2rem;margin-bottom:.8rem;border-radius:99rem;background:var(--brand);color:var(--brand-ink);font-weight:700}
.features .dot{display:grid;place-items:center;width:2.5rem;height:2.5rem;margin-bottom:.8rem;border-radius:.7rem;background:var(--brand-soft);color:var(--brand)}
.steps h3,.features h3{font-size:1.05rem;line-height:1.35}
.steps p,.features p{margin-top:.35rem;color:var(--muted);font-size:.95rem}
.visitor{display:grid;gap:1.5rem;padding:1.5rem}
@media (min-width:48rem){.visitor{grid-template-columns:1fr 1fr;padding:2rem}}
.visitor h3{font-size:1.1rem}
.visitor p{margin-top:.4rem}
`;

const STEPS = [
  {
    text: "Một đơn vị của Trường tạo liên kết với một mã ngắn, dễ đọc, dễ gõ - tự đặt hoặc để hệ thống tạo.",
    title: "Tạo liên kết"
  },
  {
    text: "Mã QR luôn chứa địa chỉ của liên kết, không chứa trang đích, nên có thể in lên poster, sách, thẻ hội nghị.",
    title: "In mã QR"
  },
  {
    text: "Trang đích có thể thay bất cứ lúc nào. Mã đã in vẫn dùng được; mỗi lần đổi đều ghi lại ai đổi và khi nào.",
    title: "Đổi đích khi cần"
  }
];

const BuildingIcon = () => (
  <Icon>
    <path d='M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z' />
    <path d='M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2' />
    <path d='M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2' />
    <path d='M10 6h4' />
    <path d='M10 10h4' />
    <path d='M10 14h4' />
    <path d='M10 18h4' />
  </Icon>
);

const HistoryIcon = () => (
  <Icon>
    <path d='M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' />
    <path d='M3 3v5h5' />
    <path d='M12 7v5l4 2' />
  </Icon>
);

const QrIcon = () => (
  <Icon>
    <rect height='5' rx='1' width='5' x='3' y='3' />
    <rect height='5' rx='1' width='5' x='16' y='3' />
    <rect height='5' rx='1' width='5' x='3' y='16' />
    <path d='M21 16h-3a2 2 0 0 0-2 2v3' />
    <path d='M21 21v.01' />
    <path d='M12 7v3a2 2 0 0 1-2 2H7' />
    <path d='M3 12h.01' />
    <path d='M12 3h.01' />
    <path d='M12 16v.01' />
    <path d='M16 12h1' />
    <path d='M21 12v.01' />
    <path d='M12 21v-1' />
  </Icon>
);

const ChartIcon = () => (
  <Icon>
    <path d='M3 3v18h18' />
    <path d='M18 17V9' />
    <path d='M13 17V5' />
    <path d='M8 17v-3' />
  </Icon>
);

const ShieldIcon = () => (
  <Icon>
    <path d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' />
  </Icon>
);

const CodeIcon = () => (
  <Icon>
    <path d='m16 18 6-6-6-6' />
    <path d='m8 6-6 6 6 6' />
  </Icon>
);

const FEATURES = [
  {
    icon: <BuildingIcon />,
    text: "Liên kết thuộc về đơn vị, không thuộc về một người. Người phụ trách đổi việc, liên kết vẫn ở lại.",
    title: "Của đơn vị, không của cá nhân"
  },
  {
    icon: <HistoryIcon />,
    text: "Mã liên kết không bao giờ bị đổi, xóa hay cấp lại cho việc khác. Không dùng nữa thì tắt.",
    title: "Không bao giờ mất"
  },
  {
    icon: <QrIcon />,
    text: "Mã QR mang logo của Trường hoặc của đơn vị, nhiều kiểu màu, tải về dạng SVG hoặc PNG để in.",
    title: "QR có logo"
  },
  {
    icon: <ChartIcon />,
    text: "Đếm số lượt mở mỗi ngày, bỏ qua các lượt xem trước của Zalo, Facebook, Messenger.",
    title: "Lượt mở theo ngày"
  },
  {
    icon: <ShieldIcon />,
    text: "Không lưu địa chỉ IP, thiết bị hay bất cứ thông tin nào về người mở liên kết.",
    title: "Tôn trọng người xem"
  },
  {
    icon: <CodeIcon />,
    text: "Phần mềm của đơn vị có thể tạo và cập nhật liên kết qua API, bằng khóa riêng của đơn vị.",
    title: "API cho ứng dụng"
  }
];

const DESCRIPTION =
  "OU Link: đường dẫn ngắn và mã QR bền vững của Trường Đại học Mở Thành phố Hồ Chí Minh - in một lần, đổi trang đích bất cứ lúc nào.";

const Demo = ({ host }: { host: string }) => (
  <div aria-label='Ví dụ một liên kết' class='card demo' role='img'>
    <div class='row'>
      <span class='dot'>
        <LinkIcon />
      </span>
      <div class='grow'>
        <span class='label'>Liên kết in trên poster</span>
        <code class='address'>{host}/hoi-thao-2027</code>
      </div>
    </div>
    <div class='down'>
      <Icon size={22}>
        <path d='M12 5v14' />
        <path d='m19 12-7 7-7-7' />
      </Icon>
    </div>
    <span class='label'>Dẫn tới</span>
    <div class='row'>
      <code class='address was grow'>ou.edu.vn/thong-bao-hoi-thao</code>
      <span class='tag'>tháng 3</span>
    </div>
    <div class='row' style='margin-top:.5rem'>
      <code class='address grow'>ou.edu.vn/chuong-trinh-hoi-thao</code>
      <span class='tag'>hôm nay</span>
    </div>
    <p class='note muted'>Poster đã in không cần in lại - chỉ trang đích thay đổi.</p>
  </div>
);

const Landing = ({ url }: { url: string }) => {
  const { host, origin } = new URL(url);
  return (
    <VisitorPage
      description={DESCRIPTION}
      head={
        <>
          <meta content='website' property='og:type' />
          <meta content={`OU Link - ${UNIVERSITY}`} property='og:title' />
          <meta content={DESCRIPTION} property='og:description' />
          <meta content={`${origin}/`} property='og:url' />
          <style>{raw(STYLE)}</style>
        </>
      }
      indexable
      title={`OU Link - ${UNIVERSITY}`}
    >
      <TopBand>
        <a class='btn primary' href='/app'>
          Đăng nhập
        </a>
      </TopBand>
      <main>
        <div class='wrap hero'>
          <div>
            <span class='eyebrow'>{UNIVERSITY}</span>
            <h1>
              Đường dẫn và mã QR <span>bền vững</span> của Trường
            </h1>
            <p class='lead muted'>
              OU Link cho mỗi ấn phẩm, sự kiện, bài báo một địa chỉ ngắn dưới tên miền của Trường. Địa chỉ ấy không bao
              giờ đổi; nơi nó dẫn tới thì cập nhật được bất cứ lúc nào, kể cả sau khi mã QR đã được in.
            </p>
            <p class='en' lang='en'>
              Permanent short links and QR codes for Ho Chi Minh City Open University: printed once, pointed wherever
              they need to go.
            </p>
            <div class='actions'>
              <a class='btn primary' href='/app'>
                Đăng nhập để quản lý liên kết
                <ArrowRightIcon />
              </a>
              <a class='btn' href='#cach-hoat-dong'>
                Cách hoạt động
              </a>
            </div>
          </div>
          <Demo host={host} />
        </div>

        <section class='block' id='cach-hoat-dong'>
          <div class='wrap'>
            <h2>Cách hoạt động</h2>
            <p class='muted'>Ba bước, và mã QR đã in không bao giờ phải in lại vì đổi trang đích.</p>
            <ol class='steps'>
              {STEPS.map((step, index) => (
                <li class='card' key={step.title}>
                  <span class='num'>{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section class='block'>
          <div class='wrap'>
            <h2>Dành cho các đơn vị của Trường</h2>
            <p class='muted'>
              Tài khoản là email @ou.edu.vn, do quản lý đơn vị mời. Mỗi đơn vị quản lý liên kết, thành viên và khóa API
              của riêng mình.
            </p>
            <ul class='features'>
              {FEATURES.map((feature) => (
                <li class='card' key={feature.title}>
                  <span class='dot'>{feature.icon}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </li>
              ))}
            </ul>
            <p class='muted' style='margin-top:1.25rem'>
              Lập trình viên: xem <a href='/app/api-docs'>tài liệu API</a>.
            </p>
          </div>
        </section>

        <section class='block'>
          <div class='wrap'>
            <div class='card visitor'>
              <div>
                <h3>Bạn vừa mở một liên kết OU Link?</h3>
                <p class='muted'>
                  Mọi liên kết có dạng <code>{host}/mã</code>. Nếu một liên kết đưa bạn tới trang báo lỗi, hãy kiểm tra
                  lại mã, hoặc liên hệ đơn vị đã phát hành nó.
                </p>
              </div>
              <div lang='en'>
                <h3>Opened an OU Link?</h3>
                <p class='muted'>
                  Every link reads <code>{host}/code</code>. If one shows an error page, check the code, or contact the
                  unit that published it.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </VisitorPage>
  );
};

export { Landing };
