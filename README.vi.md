# 🔗 linkstead

Link và QR cố định dưới tên miền của chính tổ chức bạn, mà **đích có thể đổi sau khi đã in**. Một
tấm poster, một tờ rơi hay một thẻ hội nghị in ra hôm nay vẫn dẫn đúng nơi khi trang đích chuyển chỗ
vào năm sau.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/holedev/linkstead)
[![CI](https://github.com/holedev/linkstead/actions/workflows/ci.yml/badge.svg)](https://github.com/holedev/linkstead/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) · **Tiếng Việt**

## ✨ Tính năng

- **Link cố định**: Mỗi link có một Mã link (`/hoi-thao-2027`) không bao giờ đổi và không bao giờ
  cấp lại, kể cả sau khi link bị xóa. QR đã in không bao giờ dẫn tới nơi khác.
- **Đổi đích có kiểm soát**: Đổi đích phải qua bước xác nhận hiện đích cũ và đích mới. Mọi thay đổi
  được ghi vào lịch sử cùng người đổi.
- **Kiểu chuyển hướng**: Mỗi link chuyển hướng bằng 302 (mặc định), 307, 301 hoặc 308. Không kiểu
  nào bị trình duyệt lưu lại, nên đổi đích luôn có tác dụng
  ([ADR-0009](docs/adr/0009-a-link-may-redirect-permanently.md)).
- **QR**: QR chứa địa chỉ link, không chứa đích. Logo ở giữa đặt được theo tổ chức, theo đơn vị hoặc
  cho riêng từng link. Ô vuông hoặc chấm tròn, tải SVG hoặc PNG.
- **Theo đơn vị, không theo người**: Link thuộc về đơn vị (phòng ban, tạp chí, văn phòng), nên vẫn
  còn khi người tạo rời đi. Đơn vị xếp link vào các nhóm.
- **Mật khẩu và hạn dùng**: Link có thể hỏi mật khẩu trước khi chuyển người mở đi, và có thể hết hạn
  vào thời điểm đã đặt. Link hết hạn vẫn giữ mã.
- **Tạo hàng loạt**: Nhập file CSV, xem lại từng dòng, rồi tải QR của tất cả trong một file zip.
- **Lượt mở tôn trọng quyền riêng tư**: Đếm theo ngày, quốc gia, trang giới thiệu, thiết bị và
  trình duyệt. Không lưu gì nhận ra được người mở, và bỏ qua lượt mở do app chat tạo bản xem trước.
- **Đích an toàn**: Từ chối đích bị Google Safe Browsing xếp vào lừa đảo hay mã độc, và kiểm tra lại
  mọi đích hằng ngày.
- **REST API**: Đơn vị cấp khóa API để phần mềm của mình tạo link và đổi đích. Có tài liệu OpenAPI
  và Swagger UI.
- **Dữ liệu là của bạn**: Đơn vị tải dữ liệu ra CSV. Quản trị hệ thống xuất toàn bộ ra một file mà
  bản cài đặt khác nhập vào được.
- **Mang dấu ấn tổ chức**: Tên, màu, logo, tên miền email, ngôn ngữ (tiếng Anh hoặc tiếng Việt) và
  múi giờ đặt trên giao diện.

## 🛠 Công nghệ

| Phần | Công nghệ |
| --- | --- |
| Nền tảng | [Cloudflare Workers](https://workers.cloudflare.com) (một Worker phục vụ tất cả) |
| API và chuyển hướng | [Hono](https://hono.dev) |
| Giao diện quản trị (`/app`) | React 19, Vite, Tailwind CSS 4, [shadcn/ui](https://ui.shadcn.com) |
| Cơ sở dữ liệu | Cloudflare D1 (SQLite) qua [Drizzle ORM](https://orm.drizzle.team) |
| Lưu file | Cloudflare R2 (logo) |
| Thống kê (tùy chọn) | Workers Analytics Engine |
| Công cụ | TypeScript, Vitest, [Biome](https://biomejs.dev) qua [Ultracite](https://www.ultracite.ai), Husky, commitlint |

## 🚦 Bắt đầu

### Yêu cầu

- Một [tài khoản Cloudflare](https://dash.cloudflare.com/sign-up). Gói Workers Free là đủ.
- Một tên miền trên Cloudflare cho link. **Chọn tên miền trước khi in bất cứ thứ gì**: QR mang tên
  miền nó được tạo ra.
- Nếu deploy bằng tay hoặc phát triển: Node.js 22 và pnpm 11.20.0 (ghi trong `mise.toml`).

### Cách 1: Deploy to Cloudflare (khuyên dùng)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/holedev/linkstead)

Nút này chép repo vào tài khoản GitHub của bạn, tạo database D1 và bucket R2, chạy migration rồi
deploy. Nó hỏi một secret, `BOOTSTRAP_TOKEN` ([xem bên dưới](#-biến-môi-trường)). Sau đó mở `/app`
và [tạo Quản trị hệ thống đầu tiên](#tạo-quản-trị-hệ-thống-đầu-tiên).

### Cách 2: Deploy bằng tay

```bash
git clone https://github.com/holedev/linkstead.git
cd linkstead

# dùng đúng phiên bản công cụ (không bắt buộc)
mise install

pnpm install
pnpm exec wrangler login

# build giao diện, chạy migration và deploy
pnpm run deploy

# đặt mã thiết lập
pnpm exec wrangler secret put BOOTSTRAP_TOKEN
```

Ở lần deploy đầu, wrangler tự tạo database và bucket ghi trong `wrangler.jsonc`. Hãy gõ
`pnpm run deploy`: `pnpm deploy` là một lệnh khác có sẵn của pnpm.

### Chạy trên máy

```bash
pnpm install

# tạo file secret cho máy, rồi điền BOOTSTRAP_TOKEN
cp .dev.vars.example .dev.vars

pnpm db:migrate:local
pnpm build:ui
pnpm dev
```

Worker chạy ở `http://localhost:8787`, giao diện ở `http://localhost:8787/app`. Muốn tự tải lại khi
sửa giao diện, chạy thêm `pnpm dev:ui` ở một terminal khác.

## 🔐 Biến môi trường

Đây là những giá trị **bạn phải tự tạo**. Trên production, đặt secret bằng
`pnpm exec wrangler secret put <TÊN>` hoặc trên dashboard Cloudflare (**Workers & Pages → Worker của
bạn → Settings → Variables and Secrets**). Biến thường đặt ở mục `vars` trong `wrangler.jsonc` hoặc
ở cùng trang dashboard đó. Khi chạy trên máy, đặt cả hai trong `.dev.vars`.

| Tên | Loại | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `BOOTSTRAP_TOKEN` | Secret | **Có**, cho tới khi có Quản trị hệ thống đầu tiên | Mã thiết lập mà màn hình thiết lập hỏi. Nó ngăn người lạ mở bản cài đặt mới trước bạn mà chiếm quyền. Sau đó chỉ còn dùng để import bản export. |
| `SAFE_BROWSING_KEY` | Secret | Không | Khóa API Google Safe Browsing. Có nó thì đích được kiểm tra khi đặt và kiểm tra lại hằng ngày. Xem [kiểm tra đích](#bật-kiểm-tra-đích). |
| `CF_ACCOUNT_ID` | Biến | Khi dùng Analytics Engine | ID tài khoản Cloudflare chứa dataset Analytics Engine. |
| `CF_API_TOKEN` | Secret | Khi dùng Analytics Engine | API token Cloudflare có quyền **Account → Account Analytics → Read**, để đọc lại lượt mở. |
| `VISIT_DATASET` | Biến | Không | Tên dataset Analytics Engine, nếu không phải `linkstead_visits`. |

Tạo một `BOOTSTRAP_TOKEN` đủ mạnh:

```bash
openssl rand -base64 32
```

File `.dev.vars` trên máy trông như sau:

```bash
BOOTSTRAP_TOKEN=ma-thiet-lap-ngau-nhien-va-dai
# SAFE_BROWSING_KEY=
# CF_ACCOUNT_ID=
# CF_API_TOKEN=
```

**Binding** khai báo trong `wrangler.jsonc`. Bạn không phải tự tạo giá trị cho chúng:

| Binding | Loại | Mô tả |
| --- | --- | --- |
| `DB` | Database D1 | Mọi dữ liệu của hệ thống. Tự tạo ở lần deploy đầu. |
| `LOGOS` | Bucket R2 | File logo cho QR và giao diện. Tự tạo ở lần deploy đầu. Thiếu nó hệ thống vẫn chạy, chỉ không có logo. |
| `ASSETS` | Static assets | Giao diện quản trị đã build, phục vụ ở `/app`. |
| `VISIT_EVENTS` | Dataset Analytics Engine | Tùy chọn. Mặc định đang được comment; xem [Analytics Engine](#bật-analytics-engine-tùy-chọn). |

> [!NOTE]
> Thông tin của tổ chức (tên, ngôn ngữ, múi giờ, màu, tên miền email) **không** phải biến môi
> trường. Chúng được đặt trên giao diện và lưu trong database. Lịch chạy định kỳ nằm ở
> `triggers.crons` trong `wrangler.jsonc`.

## ⚙️ Thiết lập

### Tạo Quản trị hệ thống đầu tiên

Hệ thống không cho tự đăng ký và không gửi email. Khi bản cài đặt chưa có Quản trị hệ thống, `/app`
hiện **màn hình thiết lập** thay cho trang đăng nhập. Nhập:

- mã thiết lập (`BOOTSTRAP_TOKEN`);
- email và mật khẩu của bạn (ít nhất 12 ký tự);
- tên, ngôn ngữ và múi giờ của tổ chức, và nếu muốn, các tên miền email mà tài khoản phải dùng;
- tên đơn vị đầu tiên, do bạn quản lý.

Xong là đăng nhập luôn và tạo link được ngay. Những người sau do người đã ở bên trong thêm vào.

Sau khi vào được, bạn có thể xóa mã thiết lập bằng
`pnpm exec wrangler secret delete BOOTSTRAP_TOKEN`, trừ khi còn định import một bản export.

Muốn tạo bằng script thì gọi `POST /api/bootstrap`; xem
[README.md](README.md#create-the-first-administrator).

Sau đó, thành viên, khóa API và logo QR của đơn vị nằm ở thanh bên. Mọi thứ của toàn hệ thống nằm ở
mục **Quản trị hệ thống**, trong menu khi bấm vào tên bạn ở góc dưới bên trái: tổ chức, ngôn ngữ,
các đơn vị, link của mọi đơn vị, quản trị viên, mã dành riêng và xuất dữ liệu.

### Bật kiểm tra đích

Đích được kiểm tra bằng Google Safe Browsing, miễn phí nhưng cần khóa API.

1. Trong [Google Cloud Console](https://console.cloud.google.com/), tạo hoặc chọn một project và bật
   **Safe Browsing API**.
2. Tạo khóa API ở **APIs & Services → Credentials**.
3. Đưa khóa cho Worker:

   ```bash
   pnpm exec wrangler secret put SAFE_BROWSING_KEY
   ```

Không có khóa thì hệ thống vẫn chạy, chỉ là không kiểm tra gì.

### Bật Analytics Engine (tùy chọn)

Lượt mở có thể đi qua [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)
thay vì ghi vào D1 từng lượt một. Cách này hợp với link được quét hàng nghìn lần mỗi ngày, và cho
xem lượt mở theo giờ trong ba tháng gần nhất. Không lưu thêm gì về người mở: không IP, không user
agent.

1. Bỏ comment binding trong `wrangler.jsonc`:

   ```jsonc
   "analytics_engine_datasets": [{ "binding": "VISIT_EVENTS", "dataset": "linkstead_visits" }],
   ```

2. Đặt `CF_ACCOUNT_ID` là biến và `CF_API_TOKEN` là secret:

   ```bash
   pnpm exec wrangler secret put CF_API_TOKEN
   ```

3. Deploy. Thiếu một trong ba thứ trên thì lượt mở vẫn ghi thẳng vào D1.

## 🔌 API

Tài liệu dùng thử ngay trên trình duyệt ở **`/app/api-docs`** (Swagger UI, không cần đăng nhập).
Danh sách đầy đủ các route và ví dụ: xem [README.md](README.md#-api).

## 📚 Tài liệu

- [CONTEXT.md](CONTEXT.md): từ vựng của dự án (thuật ngữ tiếng Anh, kèm tên tiếng Việt).
- [AGENTS.md](AGENTS.md): quy tắc thiết kế, danh sách route, cấu trúc mã.
- [docs/adr/](docs/adr/): các quyết định khó đảo ngược, và lý do.
- [docs/export-and-import.md](docs/export-and-import.md): chuyển sang bản cài đặt khác.

## 📝 Giấy phép

MIT. Xem [LICENSE](LICENSE) và [NOTICE](NOTICE). linkstead khởi đầu là OU Link, viết cho Trường Đại
học Mở Thành phố Hồ Chí Minh.

## 👨‍💻 Tác giả

[@holedev](https://github.com/holedev)
